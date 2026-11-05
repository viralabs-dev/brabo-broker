# Changelog

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
