# brabo-broker

O broker de container do Brabo: o **único** processo do produto que fala com o daemon
Docker do servidor (ADR 0130). Não aceita especificação de container: recebe um
`projectId` e uma das cinco operações da `DockerPort`, lê a decisão do Arquiteto na
api e compõe a especificação ele mesmo. Sem porta publicada; só a api o alcança.

## Desenvolvimento

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test       # inclui contencao-do-brabo.spec.ts, a prova da contenção
pnpm build      # tsup -> dist/index.cjs (bundle com @brabo/docker-port embutido)
```

Os testes não sobem container: a `DockerPort` é um duplo em todos eles.

## Dependências

`@brabo/docker-port` vem de [brabo-contracts](https://github.com/viralabs-dev/brabo-contracts)
por **tag**, como fonte TypeScript sem build:

```sh
pnpm add -D "github:viralabs-dev/brabo-contracts#v1.0.0&path:/packages/docker-port"
```

Nunca fixe em branch. A dependência é `devDependency` de propósito: o `tsup` embute o
pacote no bundle, e a imagem final não tem `node_modules`.

## Imagens

- `Dockerfile` — produção. Multi-estágio: o build resolve a dependência por git (o `git`
  só existe no estágio de build) e o runtime tem o bundle, o `docker-cli` e mais nada,
  com `npm`/`corepack` removidos, `USER node` e `HEALTHCHECK` em `/health`.
  Build: `docker build -f Dockerfile -t brabo-broker:prod .`
- `Dockerfile.dev` — desenvolvimento. Instala as dependências no build e roda
  `src/index.ts` por type stripping, sem bundle.

O socket do Docker (`/var/run/docker.sock`) **não** entra na imagem: quem roda o
serviço o monta, e só este serviço pode montá-lo.

## Documentação

`docs/` tem a regra de negócio do broker (RNs) em pt-BR e nos três idiomas de tradução
(`docs/i18n/`). O contexto do produto (ADRs, o plano de execução e o compose) mora no
monorepo de origem, `daneiel/brabo`, e não aqui.

## Origem

Extraído do monorepo `daneiel/brabo` com o histórico de `apps/broker/` e
`docker/broker/` (AT-700, ADR 0252). Ver [CHANGELOG.md](CHANGELOG.md).

## Licença

MIT. Ver [LICENSE](LICENSE).
