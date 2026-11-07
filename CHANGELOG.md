# Changelog

## Unreleased

- CI: repina os reutilizáveis do `brabo-ci` em `f2d99e4` (merge da ci#16): `ubuntu-26.04`, `client-id` no lugar de `app-id`, rótulo de família criado antes de aplicar, linha `Carimbo:` na tag e helper `vinculos` (AT-772, AT-773).
- CI: todo `runs-on` fixa `ubuntu-26.04` no lugar de `ubuntu-latest`, e o `create-github-app-token` usa `client-id` no lugar do `app-id` obsoleto; os runs saem sem anotação de aviso (AT-772).

- Ko-fi do mantenedor: `.github/FUNDING.yml` (botão Sponsor) e seção Apoie no README (AT-768).

- Imagem a cada carimbo `-dev` e no hotfix, com limpeza do GHCR (AT-765): o `release.yml` reage também a `vX.Y.Z-dev.N` (publica, escaneia, assina; o `imagem.json` vai como artefato do run, sem Release); o `ci.yml` ganha o job `imagem-hotfix` (`:sha-<12>` em PR `hotfix/*` para a `main`, com Trivy e cosign); o `limpeza-ghcr.yml` apaga o `sha-` da PR fechada e guarda as 10 `-dev.*` mais novas, sem tocar em `vX.Y.Z`.
- Doc de volta ao pt-BR (decisão do dono, 06/11/2026, revertendo a ADR 0260; AT-766): `README.md` e `docs/business-rules/broker.md` em pt-BR, sem `idioma_original`; o `README.md` passa a citar as seis operações, o `@brabo/docker-port` em `v1.2.0-dev.1`, a imagem `ghcr.io/viralabs-dev/brabo-broker` e a seção "Repositórios do Brabo"; os links para `daneiel/brabo` passam a apontar para `viralabs-dev/brabo`.
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
