# brabo-broker

O broker de container do Brabo: o **único** processo do produto que fala com o daemon Docker
do servidor (ADR 0130). Ele não aceita especificação de container: recebe um `projectId` e uma
das seis operações do `DockerPort` (`start`, `stop`, `remove`, `inspect`, `exec` e
`app/restart`, RN-1025), lê a decisão do Arquiteto na api e compõe a especificação ele mesmo.
Não publica porta; só a api chega nele.

## Desenvolvimento

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test       # inclui contencao-do-brabo.spec.ts, a prova da contenção
pnpm build      # tsup -> dist/index.cjs (bundle com @brabo/docker-port embutido)
```

Os testes não sobem container: o `DockerPort` é um dublê em todos eles.

## Dependências

O `@brabo/docker-port` é o pacote `@viralabs-dev/brabo-docker-port`, publicado pelo
[brabo-contracts](https://github.com/viralabs-dev/brabo-contracts) no **GitHub Packages**
(público) e instalado pelo alias do pnpm, que não muda nenhum import. A versão é exata,
sem `^`, hoje `1.2.0`:

```json
"@brabo/docker-port": "npm:@viralabs-dev/brabo-docker-port@1.2.0"
```

O `.npmrc` do repo só aponta o registry do escopo (`@viralabs-dev:registry=https://npm.pkg.github.com`).
**O GitHub Packages exige token para instalar, mesmo em pacote público.** No seu computador,
crie um PAT *classic* só com `read:packages` e grave no `~/.npmrc` (nunca no repo, nunca em
log):

```sh
echo '//npm.pkg.github.com/:_authToken=<SEU_PAT>' >> ~/.npmrc && chmod 600 ~/.npmrc
```

No CI, o `actions/setup-node` com `registry-url` e `scope` usa o `GITHUB_TOKEN`
(`permissions: packages: read`). Para subir a versão, use `scripts/ci/subir-contracts.sh` do
[brabo-ci](https://github.com/viralabs-dev/brabo-ci) e o check `contracts-alinhado` confere
`package.json` x lock. A dependência é `devDependency` de propósito: o `tsup` embute o pacote
no bundle, e a imagem final não tem `node_modules`.

## Imagens

- `Dockerfile`: produção. Multi-stage: o build instala a dependência do GitHub Packages (secret do
  BuildKit) e o runtime tem o bundle, o `docker-cli` e mais nada, sem
  `npm`/`corepack`, com `USER node` e um `HEALTHCHECK` em `/health`.
  Build: `docker build --secret id=npmrc,src=$HOME/.npmrc -f Dockerfile -t brabo-broker:prod .`
  (o token do registry entra só como secret do BuildKit, RN-1039; nunca `ARG`/`ENV`).
- `Dockerfile.dev`: desenvolvimento. Instala as dependências no build e roda `pnpm start`
  (`tsup && node dist/index.cjs`): o bundle embute o `@brabo/docker-port`. Também precisa do
  `--secret id=npmrc,src=$HOME/.npmrc` no build.

A imagem publicada é `ghcr.io/viralabs-dev/brabo-broker`, por tag de release e por digest
(`release.yml`). O socket do Docker (`/var/run/docker.sock`) **não** entra na imagem: quem
roda o serviço o monta, e só este serviço pode montá-lo.

## Documentação

A `docs/` guarda as regras de negócio (RNs) do broker, em pt-BR
(`docs/business-rules/broker.md`). O contexto do produto (ADRs, plano de execução e o compose)
mora no [brabo](https://github.com/viralabs-dev/brabo) e no `brabo-infra`, não aqui.

## Repositórios do Brabo

O Brabo é dividido em repositórios por camada (ADR 0252), e a documentação central está no
[brabo](https://github.com/viralabs-dev/brabo) e em https://viralabs-dev.github.io/brabo/prd/.

- **Depende de:** [brabo-contracts](https://github.com/viralabs-dev/brabo-contracts) (o
  `@brabo/docker-port`) e [brabo-ci](https://github.com/viralabs-dev/brabo-ci) (política de PR
  e release).
- **É usado por:** [brabo](https://github.com/viralabs-dev/brabo),
  [brabo-infra](https://github.com/viralabs-dev/brabo-infra) e
  [brabo-qa](https://github.com/viralabs-dev/brabo-qa).

| Repositório | Papel |
|---|---|
| [brabo](https://github.com/viralabs-dev/brabo) | porta de entrada do produto: documentação central, `install.sh` e release |
| [brabo-api](https://github.com/viralabs-dev/brabo-api) | API NestJS (domínio, banco, auth) |
| [brabo-engine](https://github.com/viralabs-dev/brabo-engine) | engine Elixir/OTP (agentes, sessões, filas) |
| [brabo-web](https://github.com/viralabs-dev/brabo-web) | interface React |
| [brabo-runner](https://github.com/viralabs-dev/brabo-runner) | CLI que roda na máquina do usuário |
| [brabo-broker](https://github.com/viralabs-dev/brabo-broker) | único processo com o socket do Docker |
| [brabo-contracts](https://github.com/viralabs-dev/brabo-contracts) | contratos compartilhados entre os repos |
| [brabo-infra](https://github.com/viralabs-dev/brabo-infra) | composes, Kubernetes e o `make dev` |
| [brabo-ci](https://github.com/viralabs-dev/brabo-ci) | workflows reutilizáveis e a política de PR |
| [brabo-qa](https://github.com/viralabs-dev/brabo-qa) | testes de ponta a ponta e de propriedades |
| [brabo-workspace](https://github.com/viralabs-dev/brabo-workspace) | pasta-mãe que clona todos os repos lado a lado |

## Origem

Extraído do monorepo original do Brabo com o histórico de `apps/broker/` e `docker/broker/`
(AT-700, ADR 0252). Veja o [CHANGELOG.md](CHANGELOG.md).

## Apoie

Se o projeto te ajuda, você pode [pagar um café no Ko-fi](https://ko-fi.com/daneiel).

## Licença

MIT. Veja o [LICENSE](LICENSE).
