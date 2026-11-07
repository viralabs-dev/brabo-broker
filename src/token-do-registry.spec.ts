import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * RN-1039 (AT-770): o token do GitHub Packages nunca entra em camada nem em
 * `ARG`/`ENV` — só como secret do BuildKit (`--mount=type=secret,id=npmrc`).
 * O spec lê os arquivos que o repo publica: se alguém mover o token para um
 * `ARG`, tirar o mount do `pnpm install` ou versionar o token no `.npmrc`, ele reprova.
 */
const ler = (caminho: string): string => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');
const DOCKERFILES = ['Dockerfile', 'Dockerfile.dev'];
const WORKFLOWS = ['.github/workflows/ci.yml', '.github/workflows/release.yml'];

/** Junta as linhas continuadas com `\` e descarta comentário. */
function instrucoes(texto: string): string[] {
  return texto
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

describe('o token do registry só entra como secret do BuildKit (RN-1039)', () => {
  it.each(DOCKERFILES)('%s: nenhum ARG/ENV de token', (arquivo) => {
    const proibidas = instrucoes(ler(arquivo)).filter(
      (l) => /^(ARG|ENV)\s/i.test(l) && /token|npmrc|npm_config|auth/i.test(l),
    );
    expect(proibidas).toEqual([]);
  });

  it.each(DOCKERFILES)('%s: todo `pnpm install` monta o secret npmrc', (arquivo) => {
    const installs = instrucoes(ler(arquivo)).filter((l) => /pnpm install/.test(l));
    expect(installs.length).toBeGreaterThan(0);
    for (const l of installs) expect(l).toMatch(/^RUN --mount=type=secret,id=npmrc,target=\/root\/\.npmrc /);
  });

  it.each(DOCKERFILES)('%s: não instala git nem copia o ~/.npmrc para a imagem', (arquivo) => {
    const linhas = instrucoes(ler(arquivo));
    expect(linhas.filter((l) => /apk add.*\bgit\b/.test(l))).toEqual([]);
    expect(linhas.filter((l) => /^(COPY|ADD)\s.*npmrc/i.test(l) && !/\s\.npmrc\s+\.\/$/.test(l))).toEqual([]);
  });

  it('o .npmrc versionado só aponta o registry do escopo, sem token', () => {
    const linhas = ler('.npmrc').split('\n').filter((l) => l.trim() !== '');
    expect(linhas).toEqual(['@viralabs-dev:registry=https://npm.pkg.github.com']);
  });

  it.each(WORKFLOWS)('%s: o build da imagem passa o npmrc por secret, nunca por build-arg', (arquivo) => {
    const texto = ler(arquivo);
    expect(texto).toMatch(/secret-files:|--secret /);
    // As linhas de `build-args: |` são as que seguem, mais indentadas que a chave.
    const linhas = texto.split('\n');
    const args = linhas.flatMap((l, i) => {
      if (!/^\s*build-args:/.test(l)) return [];
      const recuo = l.search(/\S/);
      const bloco: string[] = [];
      for (const prox of linhas.slice(i + 1)) {
        if (prox.trim() !== '' && prox.search(/\S/) <= recuo) break;
        bloco.push(prox);
      }
      return bloco;
    });
    expect(args.filter((l) => /token|npm|secret/i.test(l))).toEqual([]);
  });
});
