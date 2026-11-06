# Changelog

## Unreleased

- `POST /containers/:projectId/app/restart` (AT-617, RN-1025): the sixth operation restarts only the app process via `DockerPort.reiniciarApp`; the command comes from the api `container-spec`, never from the body, and the answer is the typed result. `@brabo/docker-port` moves to `v1.2.0-dev.1`.
- `README.md`: translated to English and the stale `docs/i18n/` line fixed (AT-745).
- Docs are English-only now (AT-745, ADR 0260): `docs/business-rules/broker.md` is the English source (`idioma_original: en`) and `docs/i18n/` is removed.
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
