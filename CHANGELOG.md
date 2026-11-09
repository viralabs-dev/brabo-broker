# Changelog

## Unreleased

- CI: repina o brabo-ci na release final `v1.4.0` (`5320046`), para a promoção `dev → main` de 09/11/2026 (a `main` só aceita release final).

- Doc (AT-868): os 2 links das páginas de RN que apontavam para docs de outro repo (`../adr/…`, `api.md`) viram URL do arquivo no GitHub do repo dono, na `dev`. No site continuam relativos.
- Docs (AT-873): a tabela "Onde se encaixa" do README linka cada repo no GitHub (o do próprio README fica sem link), gerada pelo `mapa-dos-repos.ts` do brabo-ci repinado em `a571e82` (`v1.4.0-dev.28`, ci#63).

- Docs (AT-867): a linha de badges logo abaixo do título mostra o CI da `dev` e o da `main`, a versão da `dev` (última tag `-dev`), licença MIT, documentação e Ko-fi, no estilo do `brabo`.

- Doc (AT-848): o bloco "Onde se encaixa" do README é regenerado do `repos.yml` do brabo com o formato `{arquivo, trecho}` e a aresta `brabo → brabo-contracts` (brabo#84); o check `mapa-alinhado` volta a passar.
- CI (AT-848): todos os `uses:` e `ci_ref` repinam em `6390ef5` (`v1.4.0-dev.17`, brabo-ci#53), que aceita a prova `{arquivo, trecho}` do `mapa-dos-repos.ts`.
- Docs: o `README.md` segue o esqueleto de 8 seções do `brabo-ci` (AT-826, `README.modelo.md`), com o bloco "Onde se encaixa" gerado do `repos.yml` do `brabo`. "Dependências", "Imagens" e "Origem" descem para `docs/dependencias-e-imagens.md`. Os checks `readme-esqueleto` e `mapa-alinhado` entram pelos reutilizáveis do `brabo-ci` em `b5df60b` (`v1.4.0-dev.14`), informativos.

- CI: o check `Dependências de merge` (AT-787) entra pelo `dependencias.yml`, que chama o reutilizável `dependencias-de-merge.yml` do `brabo-ci` pinado em `c6d9394` (`v1.4.0-dev.10`). A PR declara `Depende-de: viralabs-dev/<repo>#<n>` no corpo e o check fica amarelo (`esperando …`) até cada PR citada estar mergeada. Sem linha `Depende-de` o check fica verde ("Sem dependências declaradas"). Não é exigido por ruleset ainda.

- CI: o `ci.yml` chama o reutilizável `cadeia.yml` do `brabo-ci` (actionlint e pins, `ci_ref` obrigatório, AT-819) e repina todos os `uses:`, actions `vinculos` e `ci_ref` em `0a9eba8` (`v1.4.0-dev.5`, brabo-ci#39), com o comentário de versão no formato `vX.Y.Z-dev.N`.
- Dependência: o `@brabo/docker-port` passa a vir do GitHub Packages (`@viralabs-dev/brabo-docker-port@1.2.0`, alias do pnpm), no lugar da dependência git por tag (AT-770). `.npmrc` novo (só o registry do escopo, sem token); lock trocado só nas entradas do contracts; `minimumReleaseAgeExclude` do pacote da org. `Dockerfile` e `Dockerfile.dev` instalam com `--mount=type=secret,id=npmrc` e perdem o `git`; `ci.yml` (`packages: read`, `setup-node` com escopo, secret do BuildKit) e `release.yml` (`secret-files`). Novo check `contracts-alinhado.yml` (pin no `brabo-ci` `4976af2`) e RN-1039 com spec (`src/token-do-registry.spec.ts`).
- CI: o regressivo do brabo-qa roda em toda PR para a `dev` (AT-769): o job `imagem-hotfix` do `ci.yml` publica a `sha-<12>` assinada também com `base_ref == 'dev'` (mesma guarda de fork, sem Dependabot); o `limpeza-ghcr.yml` apaga toda `sha-*` de PR fechada e as de mais de 7 dias (eram 14); o `qa-e2e.yml` passa a `branches: [dev, main]` (PR para a `dev` = `Regressivo do brabo-qa`, nunca exigido; PR para a `main` segue com o `E2E do brabo-qa`). CLAUDE.md e `.claude/agents/analista.md` ganham a regra do card.
- CI: o run do `release.yml` ganha `run-name` com a origem e o passo `Vínculos` (helper do `brabo-ci`, origem pela linha `Carimbo:` da tag; AT-773, RN-1044).


- CI: repina o `brabo-ci` em `2d9ec1b` (merge da ci#28: o `HEAD` do `brabo-ci` deixa de sombrear o `dev` em `qa-e2e-disparar.ts`, então o portão da `main` volta a rodar) em todos os pins, `uses:` e `ci_ref:` (AT-789).
- CI: repina os reutilizáveis do `brabo-ci` em `384b5d1` (merge da ci#22: o job `disparar` do `qa-e2e-gatilho.yml` agora instala as dependências) em todos os pins, `uses:`, `ci_ref:` e checkout do `brabo-ci` (AT-785).

- Check `refs` no PR (AT-782): o `refs.yml` chama o `refs-com-simbolo` do `brabo-ci` (pin `64a1e15`) e reprova a ref `caminho:N` (`símbolo`) de RN que o PR quebra; o artefato `refs-patch` traz a reancoragem. Não é check obrigatório.

- Doc: a decisão do dono de 06/11/2026 (volta ao pt-BR) passa a citar o número do ADR, 0266, no `CLAUDE.md` e no CHANGELOG (AT-783).

- CI: repina os reutilizáveis do `brabo-ci` em `13f3697` (merge da ci#17, que inclui a ci#16): `ubuntu-26.04`, `client-id` no lugar de `app-id`, rótulo de família criado antes de aplicar, linha `Carimbo:` na tag e helper `vinculos` (AT-772, AT-773).
- CI: todo `runs-on` fixa `ubuntu-26.04` no lugar de `ubuntu-latest`, e o `create-github-app-token` usa `client-id` no lugar do `app-id` obsoleto; os runs saem sem anotação de aviso (AT-772).

- Ko-fi do mantenedor: `.github/FUNDING.yml` (botão Sponsor) e seção Apoie no README (AT-768).

- Imagem a cada carimbo `-dev` e no hotfix, com limpeza do GHCR (AT-765): o `release.yml` reage também a `vX.Y.Z-dev.N` (publica, escaneia, assina; o `imagem.json` vai como artefato do run, sem Release); o `ci.yml` ganha o job `imagem-hotfix` (`:sha-<12>` em PR `hotfix/*` para a `main`, com Trivy e cosign); o `limpeza-ghcr.yml` apaga o `sha-` da PR fechada e guarda as 10 `-dev.*` mais novas, sem tocar em `vX.Y.Z`.
- Doc de volta ao pt-BR (decisão do dono, 06/11/2026, ADR 0266, revertendo a ADR 0260; AT-766): `README.md` e `docs/business-rules/broker.md` em pt-BR, sem `idioma_original`; o `README.md` passa a citar as seis operações, o `@brabo/docker-port` em `v1.2.0-dev.1`, a imagem `ghcr.io/viralabs-dev/brabo-broker` e a seção "Repositórios do Brabo"; os links para `daneiel/brabo` passam a apontar para `viralabs-dev/brabo`.
- `POST /containers/:projectId/app/restart` (AT-617, RN-1025): a sexta operação reinicia só o processo do app via `DockerPort.reiniciarApp`; o comando vem do `container-spec` da api, nunca do corpo, e a resposta é o resultado tipado. O `@brabo/docker-port` passa para `v1.2.0-dev.1`.
- `README.md`: traduzido para o inglês e corrigida a linha velha sobre `docs/i18n/` (AT-745).
- A doc passou a ser só em inglês (AT-745, ADR 0260): `docs/business-rules/broker.md` virou a fonte em inglês (`idioma_original: en`) e a `docs/i18n/` saiu.
- Correção do dev (AT-737): `pnpm start` e o `Dockerfile.dev` rodam o bundle (`tsup && node dist/index.cjs`) em vez de `node src/index.ts`, que morria com `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` por causa do `@brabo/docker-port` em `.ts` dentro de `node_modules`.
- `politica.yml` novo: `pr-police` e `escada` do `brabo-ci` pinados por SHA (AT-733) e o job `politica` saiu do `ci.yml`; inclui a dispensa da PR do bot (ADR 0255).
- Release por tag da imagem `ghcr.io/viralabs-dev/brabo-broker` (AT-704): `carimbo.yml` (tag-release do brabo-ci) e `release.yml` (build, push por digest, Trivy sobre o digest, cosign keyless por digest com verify, `imagem.json` na Release). A 1ª tag final na `main` sai `v1.0.0`.

## 1.0.0

- Extraído do monorepo `daneiel/brabo` (AT-700, ADR 0252), com o histórico de `apps/broker/` e
  `docker/broker/`. O app foi para a raiz; o `Dockerfile` de produção e o de desenvolvimento
  saíram de `docker/broker/` para a raiz (`Dockerfile`, `Dockerfile.dev`).
- `@brabo/docker-port` passou a vir de `brabo-contracts` por tag `v1.0.0`, em vez de
  `workspace:*`.
- Saiu o `docker/broker/entrypoint.sh` do compose de desenvolvimento do monorepo: ele reconciliava
  três volumes `node_modules` montados por cima do bind mount do monorepo. Este repo não tem esse
  compose; o `Dockerfile.dev` instala as dependências no build.
- Teste que sai do repo: nenhum. O `contencao-do-brabo.spec.ts` continua aqui, e não lê nada da raiz
  do monorepo.
- Link de ADR que apontava para `docs/adr/` do monorepo passou a apontar para o arquivo no GitHub.
- CI próprio: typecheck, lint, testes e build do bundle; build da imagem de produção sem publicar;
  política de PR pelo workflow reutilizável do `brabo-ci` (`v1.0.0`).
