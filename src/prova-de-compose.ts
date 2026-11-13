/**
 * AT-922 / ADR 0297: a prova de compose. O broker NÃO executa o compose do
 * projeto como está: lê o clone limpo (somente leitura), pede o `config` ao
 * `docker compose`, aprova só o que está na allowlist, gera um override com
 * limites e roda num projeto descartável. Sobe, sonda `/docs` e
 * `/openapi.json` por dentro da rede do compose e LIMPA SEMPRE.
 *
 * Risco aceito pelo dono (12/11/2026): o `RUN` do Dockerfile executa código do
 * projeto no BuildKit do servidor. Descrito, não remendado (ADR 0189).
 */

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import {
  CAMINHOS_SONDADOS_NA_PROVA,
  DockerCliAusenteError,
  LIMITES_DA_PROVA_DE_COMPOSE,
  nomeDoProjetoDeCompose,
  type RecusaDeCompose,
  type ResultadoDaProvaDeCompose,
  type SondaDeCompose,
} from '@brabo/docker-port';
import type { ConfiguracaoDoBroker } from './config.ts';

export interface ResultadoDoComando {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** O processo `docker`, injetável: o teste usa um duplo, nunca o daemon. */
export type ExecutorDeDocker = (
  args: string[],
  opcoes: { cwd?: string; timeoutMs: number },
) => Promise<ResultadoDoComando>;

export interface DependenciasDaProva {
  config: ConfiguracaoDoBroker;
  docker: ExecutorDeDocker;
  esperar?: (ms: number) => Promise<void>;
  /** Relógio injetável (o teste simula o estouro de tempo). */
  agora?: () => number;
}

/** Origem `infra`: falta peça do AMBIENTE (clone, plugin, imagem de sonda). */
export class ProvaDeComposeIndisponivelError extends Error {
  readonly origem = 'infra';
  constructor(motivo: string) {
    super(`prova de compose indisponível: ${motivo}. Nada foi subido.`);
    this.name = 'ProvaDeComposeIndisponivelError';
  }
}

/** Origem `politica`: já há uma prova viva deste projeto (RN-935). */
export class ProvaDeComposeEmAndamentoError extends Error {
  readonly origem = 'politica';
  constructor(nome: string) {
    super(`já existe uma prova de compose viva para ${nome}: uma por projeto.`);
    this.name = 'ProvaDeComposeEmAndamentoError';
  }
}

const ARQUIVOS_DE_COMPOSE = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const TETO_DA_LIMPEZA_MS = 120_000;
const TENTATIVAS_DE_SONDA = 5;

/** Chaves de serviço aprovadas. O resto é recusado pelo nome. */
const SERVICO_PERMITIDO = new Set([
  'build', 'image', 'environment', 'ports', 'expose', 'depends_on', 'healthcheck', 'command',
  'entrypoint', 'working_dir', 'user', 'restart', 'tmpfs', 'networks', 'volumes', 'labels',
  'profiles', 'init', 'stop_grace_period', 'pull_policy',
]);
const BUILD_PERMITIDO = new Set([
  'context', 'dockerfile', 'dockerfile_inline', 'args', 'target', 'additional_contexts', 'labels',
]);
/** Chaves de serviço que têm nome próprio na lista fechada do contrato. */
const NOMEADAS = new Set(['privileged', 'cap_add', 'network_mode', 'pid', 'ipc', 'devices', 'extra_hosts', 'env_file']);

const emAndamento = new Set<string>();

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Dentro do clone, sem `..`, depois de resolver symlink. */
function dentro(clone: string, caminho: string): boolean {
  return caminho === clone || caminho.startsWith(clone + sep);
}

/** Valores de `env_file` no TEXTO cru: o `config` já os leria (ex.: `/proc/self/environ`). */
export function valoresDeEnvFile(texto: string): string[] {
  const linhas = texto.split('\n');
  const out: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = /^(\s*)env_file\s*:\s*(.*)$/.exec(linhas[i] ?? '');
    if (m === null) continue;
    const inline = (m[2] ?? '').replace(/\s+#.*$/, '').trim();
    if (inline.length > 0) {
      out.push(...inline.replace(/[[\]]/g, '').split(',').map((x) => x.trim()));
      continue;
    }
    const recuo = (m[1] ?? '').length;
    for (let j = i + 1; j < linhas.length; j++) {
      const l = linhas[j] ?? '';
      if (l.trim() === '' || l.trim().startsWith('#')) continue;
      const item = /^(\s*)-\s*(.*)$/.exec(l);
      if (item === null || (item[1] ?? '').length < recuo) break;
      out.push((item[2] ?? '').replace(/^path\s*:\s*/, '').trim());
    }
  }
  return out.map((v) => v.replace(/^['"]|['"]$/g, ''));
}

const CAMINHO_RELATIVO_SEGURO = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[\w.\-/]+$/;

/** Recusas pelo TEXTO cru do compose: o que o `config` esconderia (include, extends) ou leria (env_file). */
export function recusasDoTexto(texto: string): RecusaDeCompose[] {
  const r: RecusaDeCompose[] = [];
  if (/^\s*include\s*:/m.test(texto)) {
    r.push({ campo: 'include', motivo: 'o compose do projeto não pode incluir outros arquivos' });
  }
  if (/^\s*extends\s*:/m.test(texto)) {
    // shortcut: recusa todo `extends`, não só o externo (sem parser YAML); relaxar com um parser.
    r.push({ campo: 'extends', motivo: 'extends não é aceito na prova' });
  }
  for (const v of valoresDeEnvFile(texto)) {
    if (!CAMINHO_RELATIVO_SEGURO.test(v)) {
      r.push({ campo: 'env_file fora do contexto', motivo: `env_file ${JSON.stringify(v)} não é um caminho relativo dentro do clone` });
    }
  }
  return r;
}

/** A allowlist sobre o JSON do `docker compose config`. Devolve as recusas nomeadas. */
export function recusasDoConfig(config: unknown, clone: string): RecusaDeCompose[] {
  const r: RecusaDeCompose[] = [];
  const add = (campo: string, motivo: string): void => void r.push({ campo, motivo });
  if (!ehObj(config)) return [{ campo: 'compose', motivo: 'config ilegível' }];
  for (const chave of ['secrets', 'configs', 'include']) {
    if (config[chave] !== undefined) add(chave === 'include' ? 'include' : chave, `${chave} não é aceito`);
  }
  if (ehObj(config.networks)) {
    for (const [nome, rede] of Object.entries(config.networks)) {
      if (ehObj(rede) && (rede.external === true || (rede.driver !== undefined && rede.driver !== 'bridge'))) {
        add(`networks.${nome}`, 'rede externa ou com driver diferente de bridge');
      }
    }
  }
  if (ehObj(config.volumes)) {
    for (const [nome, vol] of Object.entries(config.volumes)) {
      if (ehObj(vol) && (vol.external === true || vol.driver_opts !== undefined)) {
        add(`volumes.${nome}`, 'volume externo ou com driver_opts');
      }
    }
  }
  const servicos = ehObj(config.services) ? config.services : {};
  for (const [nome, srv] of Object.entries(servicos)) {
    if (!ehObj(srv)) continue;
    for (const chave of Object.keys(srv)) {
      if (SERVICO_PERMITIDO.has(chave)) continue;
      const nomeada = NOMEADAS.has(chave);
      add(
        nomeada ? (chave === 'env_file' ? 'env_file fora do contexto' : chave) : `${nome}.${chave}`,
        `serviço ${nome}: \`${chave}\` não está na allowlist`,
      );
    }
    if (Array.isArray(srv.ports)) {
      for (const p of srv.ports) {
        if (ehObj(p) && p.published !== undefined && p.published !== '' && p.host_ip !== '127.0.0.1') {
          add('ports fora de 127.0.0.1', `serviço ${nome}: porta publicada sem host_ip 127.0.0.1`);
        }
      }
    }
    if (Array.isArray(srv.volumes)) {
      for (const v of srv.volumes) {
        if (ehObj(v) && v.type !== 'volume' && v.type !== 'tmpfs') {
          add('volumes de host', `serviço ${nome}: volume do tipo ${JSON.stringify(v.type)} (só volume nomeado e tmpfs)`);
        }
      }
    }
    if (ehObj(srv.networks)) {
      for (const rede of Object.keys(srv.networks)) {
        if (!(ehObj(config.networks) && rede in config.networks) && rede !== 'default') {
          add(`${nome}.networks`, `rede ${JSON.stringify(rede)} não declarada`);
        }
      }
    }
    if (ehObj(srv.build)) {
      const b = srv.build;
      for (const chave of Object.keys(b)) {
        if (!BUILD_PERMITIDO.has(chave)) add(`${nome}.build.${chave}`, `serviço ${nome}: build.${chave} não está na allowlist`);
      }
      const ctx = b.context;
      if (typeof ctx !== 'string' || !dentro(clone, ctx)) {
        add(`${nome}.build.context`, `contexto ${JSON.stringify(ctx)} fora do clone`);
      }
      if (typeof b.dockerfile === 'string' && !CAMINHO_RELATIVO_SEGURO.test(b.dockerfile)) {
        add(`${nome}.build.dockerfile`, 'dockerfile fora do contexto');
      }
      if (ehObj(b.additional_contexts)) {
        for (const [k, v] of Object.entries(b.additional_contexts)) {
          if (typeof v !== 'string' || !(v.startsWith('service:') || dentro(clone, v))) {
            add(`${nome}.build.additional_contexts`, `contexto adicional ${JSON.stringify(k)} fora do clone`);
          }
        }
      }
    } else if (typeof srv.build === 'string') {
      add(`${nome}.build`, 'build em forma curta não é esperado depois do config');
    }
  }
  return r;
}

/** O override: limites, `cap_drop` onde há código do usuário (build) e no-new-privileges. */
export function overrideDaProva(config: Obj): Obj {
  const servicos = ehObj(config.services) ? Object.keys(config.services) : [];
  const memMb = Math.max(256, Math.floor(LIMITES_DA_PROVA_DE_COMPOSE.discoMaximoBytes / 1024 ** 2 / Math.max(1, servicos.length)));
  const out: Obj = {};
  for (const nome of servicos) {
    const srv = (config.services as Obj)[nome] as Obj;
    out[nome] = {
      mem_limit: `${memMb}m`,
      cpus: 1,
      pids_limit: 512,
      security_opt: ['no-new-privileges:true'],
      // shortcut: serviço só de imagem (banco) fica com as capacidades padrão, que o postgres exige.
      ...(srv.build !== undefined ? { cap_drop: ['ALL'] } : {}),
    };
  }
  return { services: out };
}

/** O alvo da sonda: o primeiro serviço com porta publicada ou `expose`. */
export function alvoDaSonda(config: Obj): { servico: string; porta: number } | null {
  const servicos = ehObj(config.services) ? config.services : {};
  for (const [nome, srv] of Object.entries(servicos)) {
    if (!ehObj(srv)) continue;
    if (Array.isArray(srv.ports)) {
      for (const p of srv.ports) {
        const alvo = ehObj(p) ? Number(p.target) : NaN;
        if (Number.isInteger(alvo) && alvo > 0) return { servico: nome, porta: alvo };
      }
    }
    if (Array.isArray(srv.expose)) {
      const e = Number(String(srv.expose[0] ?? '').split('/')[0]);
      if (Number.isInteger(e) && e > 0) return { servico: nome, porta: e };
    }
  }
  return null;
}

export function statusDaSonda(saida: string): number {
  const m = /HTTP\/\d(?:\.\d)?\s+(\d{3})/.exec(saida);
  return m === null ? 0 : Number(m[1]);
}

/** `docker` sem NENHUM segredo do broker no ambiente (o compose interpola `${VAR}`). */
export function executorPadrao(): ExecutorDeDocker {
  return (args, { cwd, timeoutMs }) =>
    new Promise((resolve, reject) => {
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: '/tmp', DOCKER_CONFIG: process.env.DOCKER_CONFIG ?? '/tmp/.docker' };
      if (process.env.DOCKER_HOST !== undefined) env.DOCKER_HOST = process.env.DOCKER_HOST;
      execFile('docker', args, { cwd, env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL' }, (erro, stdout, stderr) => {
        if (erro !== null && (erro as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new DockerCliAusenteError());
          return;
        }
        const e = erro as (NodeJS.ErrnoException & { killed?: boolean; code?: unknown }) | null;
        resolve({
          exitCode: e === null ? 0 : typeof e.code === 'number' ? e.code : 1,
          stdout: String(stdout),
          stderr: String(stderr),
          timedOut: e !== null && e.killed === true,
        });
      });
    });
}

function raizNoBroker(config: ConfiguracaoDoBroker, tipo: string): string {
  const raiz = tipo === 'gerenciada' ? config.raizDeWorkspacesNoBroker : tipo === 'montada' ? config.baseDeProjetosNoBroker : null;
  if (raiz === null) {
    throw new ProvaDeComposeIndisponivelError(
      `este broker não enxerga a pasta do projeto (${tipo === 'gerenciada' ? 'PROJECT_WORKSPACES_BROKER_ROOT' : 'BRABO_PROJECTS_BROKER_BASE'} ausente)`,
    );
  }
  return raiz;
}

/** A prova inteira. `clone` já é o caminho do clone limpo VISTO por este processo. */
export async function provaDeCompose(
  deps: DependenciasDaProva,
  workspaceDirName: string,
  chave: string,
  clone: string,
): Promise<ResultadoDaProvaDeCompose> {
  const { docker, config } = deps;
  const agora = deps.agora ?? Date.now;
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const projeto = nomeDoProjetoDeCompose(workspaceDirName, chave);
  if (config.imagemDaSonda === null) throw new ProvaDeComposeIndisponivelError('BRABO_PROVA_SONDA_IMAGE ausente');
  if (emAndamento.has(workspaceDirName)) throw new ProvaDeComposeEmAndamentoError(projeto);

  let raizReal: string;
  try {
    raizReal = await realpath(clone);
  } catch {
    throw new ProvaDeComposeIndisponivelError('o clone limpo do projeto não existe');
  }
  const infra: ResultadoDaProvaDeCompose = { subiu: false, sondas: [], origem: 'infra' };
  const projetoFalhou = (campo: string, motivo: string): ResultadoDaProvaDeCompose => ({
    subiu: false, sondas: [], origem: 'projeto', recusas: [{ campo, motivo }],
  });

  emAndamento.add(workspaceDirName);
  const limite = agora() + LIMITES_DA_PROVA_DE_COMPOSE.tempoMaximoMs;
  const restante = (): number => limite - agora();
  let arquivosDeCompose: string[] = [];
  let pastaDeTrabalho: string | null = null;
  try {
    const v = await docker(['compose', 'version'], { timeoutMs: 15_000 });
    if (v.exitCode !== 0) throw new ProvaDeComposeIndisponivelError('o plugin `docker compose` não está na imagem do broker');

    let arquivo: string | null = null;
    for (const nome of ARQUIVOS_DE_COMPOSE) {
      try {
        const real = await realpath(join(raizReal, nome));
        if (dentro(raizReal, real)) { arquivo = real; break; }
      } catch { /* próximo */ }
    }
    if (arquivo === null) return projetoFalhou('arquivo de compose', 'o clone não tem compose.yaml/docker-compose.yml');

    const texto = await readFile(arquivo, 'utf8');
    const doTexto = recusasDoTexto(texto);
    if (doTexto.length > 0) return { subiu: false, sondas: [], recusas: doTexto, origem: 'projeto' };

    const base = ['compose', '--project-directory', raizReal, '-p', projeto, '-f', arquivo];
    arquivosDeCompose = ['-f', arquivo];
    const cfg = await docker([...base, 'config', '--format', 'json'], { cwd: raizReal, timeoutMs: Math.min(60_000, Math.max(1, restante())) });
    if (cfg.timedOut) return infra;
    if (cfg.exitCode !== 0) return projetoFalhou('compose', cfg.stderr.trim().slice(0, 500) || 'config falhou');
    let config_: Obj;
    try { config_ = JSON.parse(cfg.stdout) as Obj; } catch { return projetoFalhou('compose', 'config não devolveu JSON'); }
    const recusas = recusasDoConfig(config_, raizReal);
    if (recusas.length > 0) return { subiu: false, sondas: [], recusas, origem: 'projeto' };

    await mkdir(config.trabalhoDir, { recursive: true });
    pastaDeTrabalho = await mkdtemp(join(config.trabalhoDir, 'prova-'));
    const override = join(pastaDeTrabalho, 'override.yaml'); // JSON é YAML válido
    await writeFile(override, JSON.stringify(overrideDaProva(config_)));
    arquivosDeCompose = ['-f', arquivo, '-f', override];
    const comArquivos = ['compose', '--project-directory', raizReal, '-p', projeto, ...arquivosDeCompose];

    const up = await docker([...comArquivos, 'up', '--build', '--wait', '--detach'], { cwd: raizReal, timeoutMs: Math.max(1, restante()) });
    if (up.timedOut || restante() <= 0) return infra;
    if (up.exitCode !== 0) return projetoFalhou('up', up.stderr.trim().slice(-500) || 'up falhou');

    // Teto de disco: confere o tamanho das imagens do projeto depois do build.
    // shortcut: não limita o cache durante o build, só confere depois; limitar exige quota no daemon.
    const imgs = await docker([...comArquivos, 'images', '--format', 'json'], { cwd: raizReal, timeoutMs: 30_000 });
    if (tamanhoTotal(imgs.stdout) > LIMITES_DA_PROVA_DE_COMPOSE.discoMaximoBytes) return infra;

    const alvo = alvoDaSonda(config_);
    const sondas: SondaDeCompose[] = [];
    for (const caminho of CAMINHOS_SONDADOS_NA_PROVA) {
      let status = 0;
      if (alvo !== null) {
        for (let t = 0; t < TENTATIVAS_DE_SONDA && status === 0 && restante() > 0; t++) {
          if (t > 0) await esperar(2000);
          const s = await docker(
            ['run', '--rm', '--network', `${projeto}_default`, '--read-only', '--cap-drop', 'ALL',
              '--security-opt', 'no-new-privileges:true', '--memory', '64m', '--entrypoint', 'wget',
              config.imagemDaSonda, '-S', '-O', '/dev/null', '-T', '5', `http://${alvo.servico}:${alvo.porta}${caminho}`],
            { timeoutMs: Math.max(1, Math.min(20_000, restante())) },
          );
          status = statusDaSonda(`${s.stdout}\n${s.stderr}`);
        }
      }
      sondas.push({ caminho, status });
    }
    return { subiu: true, sondas, origem: 'projeto' };
  } finally {
    // SEMPRE: sucesso, recusa, falha, exceção e teto. Roda fora do prazo da prova.
    try {
      await docker(['compose', '-p', projeto, ...arquivosDeCompose, 'down', '-v', '--rmi', 'local', '--remove-orphans'], { timeoutMs: TETO_DA_LIMPEZA_MS });
      await docker(['builder', 'prune', '--force'], { timeoutMs: TETO_DA_LIMPEZA_MS });
    } catch (erro) {
      console.error(`broker: a limpeza da prova ${projeto} falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
    if (pastaDeTrabalho !== null) await rm(pastaDeTrabalho, { recursive: true, force: true }).catch(() => undefined);
    emAndamento.delete(workspaceDirName);
  }
}

function tamanhoTotal(saida: string): number {
  let total = 0;
  const linhas = saida.trim().startsWith('[') ? [saida] : saida.split('\n');
  for (const l of linhas) {
    try {
      const j: unknown = JSON.parse(l);
      for (const i of Array.isArray(j) ? j : [j]) {
        if (ehObj(i) && typeof i.Size === 'number') total += i.Size;
      }
    } catch { /* linha vazia ou texto: ignora */ }
  }
  return total;
}

/** Onde o clone mora para ESTE processo: `<raiz>/<segmento>/.brabo-qa/clone-limpo`. */
export function caminhoDoClone(config: ConfiguracaoDoBroker, tipo: string, segmento: string): string {
  return join(raizNoBroker(config, tipo), segmento, '.brabo-qa', 'clone-limpo');
}
