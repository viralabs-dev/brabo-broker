# Dependências, imagens e origem

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

## Origem

Extraído do monorepo original do Brabo com o histórico de `apps/broker/` e `docker/broker/`
(AT-700, ADR 0252). Veja o [CHANGELOG.md](../CHANGELOG.md).
