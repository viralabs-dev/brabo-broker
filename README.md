# brabo-broker

The Brabo container broker: the **only** process of the product that talks to the
server's Docker daemon (ADR 0130). It accepts no container specification: it receives a
`projectId` and one of the five operations of the `DockerPort`, reads the Architect's decision
from the api and composes the specification itself. No published port; only the api reaches it.

## Development

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test       # inclui contencao-do-brabo.spec.ts, a prova da contenção
pnpm build      # tsup -> dist/index.cjs (bundle com @brabo/docker-port embutido)
```

The tests start no container: the `DockerPort` is a double in all of them.

## Dependencies

`@brabo/docker-port` comes from [brabo-contracts](https://github.com/viralabs-dev/brabo-contracts)
by **tag**, as TypeScript source with no build:

```sh
pnpm add -D "github:viralabs-dev/brabo-contracts#v1.0.0&path:/packages/docker-port"
```

Never pin to a branch. The dependency is a `devDependency` on purpose: `tsup` embeds the
package in the bundle, and the final image has no `node_modules`.

## Images

- `Dockerfile` — production. Multi-stage: the build resolves the dependency through git (`git`
  only exists in the build stage) and the runtime has the bundle, the `docker-cli` and nothing else,
  with `npm`/`corepack` removed, `USER node` and a `HEALTHCHECK` on `/health`.
  Build: `docker build -f Dockerfile -t brabo-broker:prod .`
- `Dockerfile.dev` — development. Installs the dependencies at build time and runs `pnpm start`
  (`tsup && node dist/index.cjs`): the bundle embeds `@brabo/docker-port`, which comes as `.ts`,
  and Node does not strip types inside `node_modules`.

The Docker socket (`/var/run/docker.sock`) does **not** go into the image: whoever runs the
service mounts it, and only this service may mount it.

## Documentation

`docs/` holds the broker's business rules (RNs), in English only
(`docs/business-rules/broker.md`). The product context (ADRs, the execution plan and the compose) lives in the
origin monorepo, `daneiel/brabo`, and not here.

## Origin

Extracted from the `daneiel/brabo` monorepo with the history of `apps/broker/` and
`docker/broker/` (AT-700, ADR 0252). See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
