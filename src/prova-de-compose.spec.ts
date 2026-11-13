import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMPOS_RECUSADOS_NO_COMPOSE, LIMITES_DA_PROVA_DE_COMPOSE } from '@brabo/docker-port';
import { lerConfiguracao } from './config.ts';
import { tratar } from './servidor.ts';
import type { ContextoDoProjeto } from './api-client.ts';
import type { DependenciasDoBroker } from './operacoes.ts';
import {
  provaDeCompose,
  recusasDoConfig,
  recusasDoTexto,
  statusDaSonda,
  type ExecutorDeDocker,
  type ResultadoDoComando,
} from './prova-de-compose.ts';

const OK: ResultadoDoComando = { exitCode: 0, stdout: '', stderr: '', timedOut: false };
const CLONE = '/clone';

/** Um serviço bom; cada teste de recusa estraga UM campo. */
function bom(extra: Record<string, unknown> = {}): unknown {
  return {
    services: {
      api: {
        build: { context: CLONE, dockerfile: 'Dockerfile' },
        ports: [{ target: 3000, published: '3000', host_ip: '127.0.0.1' }],
        environment: { A: '1' },
        ...extra,
      },
    },
  };
}

describe('allowlist (cada campo recusado pelo nome)', () => {
  it('aceita o compose bom', () => {
    expect(recusasDoConfig(bom(), CLONE)).toEqual([]);
  });

  it.each([
    ['privileged', { privileged: true }],
    ['cap_add', { cap_add: ['SYS_ADMIN'] }],
    ['network_mode', { network_mode: 'host' }],
    ['pid', { pid: 'host' }],
    ['ipc', { ipc: 'host' }],
    ['devices', { devices: ['/dev/sda'] }],
    ['extra_hosts', { extra_hosts: ['x:1.1.1.1'] }],
    ['volumes de host', { volumes: [{ type: 'bind', source: '/etc', target: '/x' }] }],
    ['ports fora de 127.0.0.1', { ports: [{ target: 3000, published: '3000', host_ip: '0.0.0.0' }] }],
    ['ports fora de 127.0.0.1', { ports: [{ target: 3000, published: '3000' }] }],
  ])('recusa %s', (campo, extra) => {
    const r = recusasDoConfig(bom(extra), CLONE);
    expect(r.map((x) => x.campo)).toContain(campo);
    expect(CAMPOS_RECUSADOS_NO_COMPOSE).toContain(campo);
  });

  it('recusa o resto fora da allowlist com serviço.campo, e contexto fora do clone', () => {
    expect(recusasDoConfig(bom({ sysctls: { a: 1 } }), CLONE).map((x) => x.campo)).toContain('api.sysctls');
    expect(recusasDoConfig(bom({ build: { context: '/etc' } }), CLONE).map((x) => x.campo)).toContain('api.build.context');
    expect(recusasDoConfig(bom({ build: { context: CLONE, network: 'host' } }), CLONE).map((x) => x.campo)).toContain('api.build.network');
    expect(recusasDoConfig(bom({ build: { context: CLONE, ssh: ['default'] } }), CLONE).map((x) => x.campo)).toContain('api.build.ssh');
    expect(
      recusasDoConfig(bom({ build: { context: CLONE, additional_contexts: { x: '/etc' } } }), CLONE).map((x) => x.campo),
    ).toContain('api.build.additional_contexts');
    expect(recusasDoConfig({ ...(bom() as object), secrets: { s: {} } }, CLONE).map((x) => x.campo)).toContain('secrets');
  });

  it('recusa include, extends e env_file fora do contexto no texto cru', () => {
    expect(recusasDoTexto('include:\n  - ../x.yml\n').map((x) => x.campo)).toEqual(['include']);
    expect(recusasDoTexto('services:\n  a:\n    extends:\n      file: ../o.yml\n').map((x) => x.campo)).toEqual(['extends']);
    expect(recusasDoTexto('services:\n  a:\n    env_file: /proc/self/environ\n').map((x) => x.campo)).toEqual(['env_file fora do contexto']);
    expect(recusasDoTexto('services:\n  a:\n    env_file:\n      - .env\n      - ../../segredo\n').length).toBe(1);
    expect(recusasDoTexto('services:\n  a:\n    env_file: [.env, app.env]\n')).toEqual([]);
  });
});

it('lê o status da sonda do wget -S', () => {
  expect(statusDaSonda('  HTTP/1.1 200 OK\n')).toBe(200);
  expect(statusDaSonda('wget: bad address')).toBe(0);
});

async function clonePronto(compose: string): Promise<{ raiz: string; clone: string; trabalho: string }> {
  const raiz = await mkdtemp(join(tmpdir(), 'prova-spec-'));
  const clone = join(raiz, 'ws', '.brabo-qa', 'clone-limpo');
  await mkdir(clone, { recursive: true });
  await writeFile(join(clone, 'compose.yaml'), compose);
  return { raiz, clone, trabalho: join(raiz, 'trabalho') };
}

function dublê(config: unknown, opcoes: { up?: ResultadoDoComando; sonda?: (n: number) => ResultadoDoComando; versao?: ResultadoDoComando } = {}) {
  const chamadas: string[][] = [];
  let sondas = 0;
  const docker: ExecutorDeDocker = async (args) => {
    chamadas.push(args);
    if (args[1] === 'version') return opcoes.versao ?? OK;
    if (args.includes('config')) return { ...OK, stdout: JSON.stringify(config) };
    if (args.includes('up')) return opcoes.up ?? OK;
    if (args.includes('images')) return { ...OK, stdout: '[{"Size": 1000}]' };
    if (args[0] === 'run') return (opcoes.sonda ?? (() => ({ ...OK, stderr: '  HTTP/1.1 200 OK' })))(++sondas);
    return OK;
  };
  return { docker, chamadas };
}

function cfg(trabalho: string) {
  return { ...lerConfiguracao({}), trabalhoDir: trabalho, imagemDaSonda: 'brabo-broker:x' };
}
const limpou = (c: string[][]) =>
  c.some((a) => a.includes('down') && a.includes('-v') && a.includes('--rmi') && a.includes('--remove-orphans')) &&
  c.some((a) => a[0] === 'builder' && a[1] === 'prune');

describe('prova de compose (Docker dublê)', () => {
  it('caminho feliz: sobe, sonda /docs e /openapi.json e limpa', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker, chamadas } = dublê(bom({ build: { context: clone } }));
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r).toEqual({
      subiu: true,
      origem: 'projeto',
      sondas: [{ caminho: '/docs', status: 200 }, { caminho: '/openapi.json', status: 200 }],
    });
    expect(limpou(chamadas)).toBe(true);
    const up = chamadas.find((a) => a.includes('up'))!;
    expect(up).toContain('--build');
    expect(up).toContain('--wait');
    expect(up.join(' ')).toContain('brabo-qa-compose-ws-abcd1234');
    expect(await readdir(trabalho)).toEqual([]); // o override foi apagado
  });

  it('o override força limites e cap_drop onde há build', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    let override = '';
    const { docker } = dublê(bom({ build: { context: clone } }));
    const { readFile } = await import('node:fs/promises');
    const envolto: ExecutorDeDocker = async (args, o) => {
      const i = args.lastIndexOf('-f');
      if (args.includes('up')) override = await readFile(args[i + 1]!, 'utf8');
      return docker(args, o);
    };
    await provaDeCompose({ config: cfg(trabalho), docker: envolto }, 'ws', 'abcd1234', clone);
    const o = JSON.parse(override).services.api;
    expect(o).toMatchObject({ pids_limit: 512, cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'] });
  });

  it('allowlist recusada: nada sobe, e ainda limpa', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker, chamadas } = dublê(bom({ privileged: true, build: { context: clone } }));
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r.subiu).toBe(false);
    expect(r.recusas?.map((x) => x.campo)).toEqual(['privileged']);
    expect(chamadas.some((a) => a.includes('up'))).toBe(false);
    expect(limpou(chamadas)).toBe(true);
  });

  it('estouro de tempo: origem infra e limpa', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker, chamadas } = dublê(bom({ build: { context: clone } }), { up: { ...OK, exitCode: 1, timedOut: true } });
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r).toEqual({ subiu: false, sondas: [], origem: 'infra' });
    expect(limpou(chamadas)).toBe(true);
  });

  it('relógio passou dos 10 minutos: infra', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    let t = 0;
    const { docker, chamadas } = dublê(bom({ build: { context: clone } }));
    const agora = () => (t += LIMITES_DA_PROVA_DE_COMPOSE.tempoMaximoMs / 3);
    const r = await provaDeCompose({ config: cfg(trabalho), docker, agora }, 'ws', 'abcd1234', clone);
    expect(r.origem).toBe('infra');
    expect(limpou(chamadas)).toBe(true);
  });

  it('exceção no meio: propaga e limpa', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const chamadas: string[][] = [];
    const docker: ExecutorDeDocker = async (args) => {
      chamadas.push(args);
      if (args.includes('config')) throw new Error('daemon caiu');
      return OK;
    };
    await expect(provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone)).rejects.toThrow('daemon caiu');
    expect(limpou(chamadas)).toBe(true);
  });

  it('falha do projeto: up com exit 1 é origem projeto', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker, chamadas } = dublê(bom({ build: { context: clone } }), { up: { ...OK, exitCode: 1, stderr: 'build quebrou' } });
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r).toMatchObject({ subiu: false, origem: 'projeto' });
    expect(limpou(chamadas)).toBe(true);
  });

  it('sonda sem resposta fica em status 0 e /docs 404 é reportado', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker } = dublê(bom({ build: { context: clone } }), { sonda: () => ({ ...OK, exitCode: 1, stderr: '  HTTP/1.1 404 Not Found' }) });
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r.sondas.map((s) => s.status)).toEqual([404, 404]);
    const sem = dublê(bom({ build: { context: clone } }), { sonda: () => ({ ...OK, exitCode: 1, stderr: 'bad address' }) });
    const r2 = await provaDeCompose({ config: cfg(trabalho), docker: sem.docker, esperar: async () => undefined }, 'ws', 'abcd1234', clone);
    expect(r2.sondas.map((s) => s.status)).toEqual([0, 0]);
  });

  it('sem o plugin compose: 503 infra, nada sobe', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    const { docker, chamadas } = dublê({}, { versao: { ...OK, exitCode: 1 } });
    await expect(provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone)).rejects.toThrow('plugin');
    expect(chamadas.some((a) => a.includes('up'))).toBe(false);
  });

  it('segunda prova do mesmo projeto enquanto há uma viva é recusada', async () => {
    const { clone, trabalho } = await clonePronto('services: {}');
    let soltar: () => void = () => undefined;
    const trava = new Promise<void>((r) => (soltar = r));
    const base = dublê(bom({ build: { context: clone } }));
    const docker: ExecutorDeDocker = async (args, o) => {
      if (args.includes('up')) await trava;
      return base.docker(args, o);
    };
    const primeira = provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    await new Promise((r) => setTimeout(r, 20));
    await expect(provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone)).rejects.toThrow('uma por projeto');
    soltar();
    await primeira;
  });

  it('include no texto cru recusa antes de qualquer config', async () => {
    const { clone, trabalho } = await clonePronto('include:\n  - /etc/x.yml\n');
    const { docker, chamadas } = dublê({});
    const r = await provaDeCompose({ config: cfg(trabalho), docker }, 'ws', 'abcd1234', clone);
    expect(r.recusas?.map((x) => x.campo)).toEqual(['include']);
    expect(chamadas.some((a) => a.includes('config'))).toBe(false);
  });
});

describe('POST /containers/:id/qa/:chave/compose', () => {
  const contexto: ContextoDoProjeto = {
    projectId: 'p1', projectSlug: 'loja', workspaceId: 'w1', workspaceDirName: 'ws',
    executionMode: 'container', localizacao: { tipo: 'gerenciada', segmento: 'ws' },
    imagem: null, imagemVersao: 0,
  };
  const TOKEN = 'dev-service-token-change-me';
  async function montar(extra: Partial<ReturnType<typeof lerConfiguracao>>, docker: ExecutorDeDocker): Promise<DependenciasDoBroker> {
    return {
      docker: {} as never,
      buscarContexto: async () => contexto,
      config: { ...lerConfiguracao({}), ...extra },
      executorDeDocker: docker,
    };
  }
  const pedido = (caminho: string, metodo = 'POST') => ({ metodo, caminho, token: TOKEN, corpo: { privileged: true } });

  it('devolve o resultado tipado e ignora o corpo', async () => {
    const { raiz, clone, trabalho } = await clonePronto('services: {}');
    const { docker } = dublê(bom({ build: { context: clone } }));
    const deps = await montar({ raizDeWorkspacesNoBroker: raiz, trabalhoDir: trabalho, imagemDaSonda: 'x:1' }, docker);
    const r = await tratar(deps, pedido('/containers/p1/qa/abcd1234/compose'));
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ subiu: true, origem: 'projeto' });
  });

  it('sem raiz visível ou sem imagem de sonda: 503 infra; GET: 405; chave torta: 404', async () => {
    const { docker } = dublê({});
    const deps = await montar({ imagemDaSonda: 'x:1' }, docker);
    expect((await tratar(deps, pedido('/containers/p1/qa/abcd1234/compose'))).status).toBe(503);
    expect((await tratar(deps, pedido('/containers/p1/qa/abcd1234/compose', 'GET'))).status).toBe(405);
    expect((await tratar(deps, pedido('/containers/p1/qa/ABC/compose'))).status).toBe(404);
    expect((await tratar(deps, pedido('/containers/p1/qa/abcd1234/compose/x'))).status).toBe(404);
    const semSonda = await montar({}, docker);
    const r = await tratar(semSonda, pedido('/containers/p1/qa/abcd1234/compose'));
    expect(r.status).toBe(503);
    expect(r.corpo).toMatchObject({ origem: 'infra' });
  });
});
