---
id: rn-broker
title: 'Regras de negócio — Broker'
sidebar_label: Broker
description: 'As RNs hospedadas na raiz broker.'
keywords: [regras de negócio, broker]
---

# Broker

## A busca do RAG deixa rastro, e o rastro congela os pesos (RN-479..481)

### RN-494 — O portão da imagem (RN-105) vale nos TRÊS modos de execução {#rn-494}

**REVISA a [RN-169](https://github.com/viralabs-dev/brabo-api/blob/dev/docs/business-rules/api.md#rn-169) (item 1) e a
[RN-421](https://github.com/viralabs-dev/brabo-api/blob/dev/docs/business-rules/api.md#rn-421)**: a dispensa do portão RN-105 para projeto `mounted`/
`runner` — "esses modos não sobem container próprio, então a decisão do
Arquiteto nunca vai acontecer" — está REVOGADA. `ReadProjectCodeUseCase
.portaoDoContainer` deixa de checar `executionMode`: os TRÊS modos agora
exigem `artifact.project_image` decidido (pelo Arquiteto, `choose_project_image`,
ou pela Infra elegendo uma candidata, `container_start` — ADR 0133/RN-491)
antes de liberar as sete rotas de leitura da aba Code.

A dispensa original confundia duas perguntas: "este projeto sobe container
no SERVIDOR?" (não, em `mounted`/`runner`, e isso não muda aqui) e "faz
sentido exigir que ALGUÉM tenha decidido a imagem do projeto antes de abrir
a leitura de código?" (sim, nos três modos — a decisão é sobre o que o
projeto EXECUTA, não sobre onde o container físico sobe). Manter a dispensa
deixava a aba Code de `mounted`/`runner` abrir sem que ninguém tivesse
pensado na imagem do projeto; a regra uniforme fecha essa lacuna.

**Custo aceito, com todas as letras**: todo projeto `mounted`/`runner`
EXISTENTE sem `artifact.project_image` decidido — inclusive projetos reais
de dogfooding como `exp001`/`exp002` — PERDE acesso à aba Code no instante
em que este PR é deployado, até que o Arquiteto (ou a Infra) decida uma
imagem para ele. Essa é uma AÇÃO DO OPERADOR exigida depois do deploy, não
uma correção transparente — por isso a branch nasce `breaking/`, e a versão
sobe MAJOR.

**O ciclo de vida (`project_containers`) também para de recusar por modo**:
`RegistrarTransicaoDeContainerUseCase` não responde mais 400 para
`mounted`/`runner` — a tabela pode registrar linha para os três modos, o
mesmo funil de `provisioning` (que já lia a decisão de imagem, agora exigida
também para eles). O que continua IMPOSSÍVEL para `mounted`/`runner` é
chegar em `running` DE VERDADE: isso é aplicado num lugar só,
`ContainerBrokerPort.start()`, que recusa
(`ModoDeExecucaoNaoSuportadoError`, política deliberada — o broker, no
servidor, não enxerga a pasta do usuário onde o código de `mounted`/
`runner` mora) — e `ExecuteContainerStartUseCase` já trata essa recusa
como falha normal (`container.start_failed`, motivo nomeado), nunca crash,
nunca silêncio. Na prática, pelo caminho normal (aprovação de
`container_start`), NENHUMA linha chega a nascer em `project_containers`
para esses dois modos, porque o broker recusa ANTES de qualquer transição
ser chamada. Duplicar essa checagem de modo em `propose-action.use-case.ts`
ou em `ExecuteContainerStartUseCase` foi considerado e DESCARTADO: o
broker já falha alto e nomeado, e a checagem duplicada só criaria um
segundo lugar para divergir do primeiro — mesmo raciocínio do comentário de
`ModoDeExecucaoNaoSuportadoError` (`apps/broker/src/operacoes.ts`), que já
apontava para este PR.

O lado web deixa de tratar `mounted`/`runner` como caso à parte:
`ProjectCodeTab` perguntava o modo do projeto e abria o shell direto,
sem sequer chamar `GET /projects/:id/container`, quando o modo não era
`container`. Isso SIMPLIFICOU o componente — os três modos agora seguem o
mesmo caminho de `useQuery`/estados (carregando, erro, `sem_decisao`,
decidido), sem `modoLocal` nem `enabled` condicional por modo.

- **Onde:** `apps/api/src/application/use-cases/git/read-project-code.use-case.ts`
  (`portaoDoContainer`, dispensa removida),
  `apps/api/src/application/use-cases/containers/registrar-transicao-de-container.use-case.ts`
  (400 por modo removido), `apps/api/src/application/use-cases/iam/convert-project-execution-mode.use-case.ts`
  (comentário de ordenação corrigido), `apps/web/src/routes/ProjectCodeTab.tsx`
  (gate uniforme, `modoLocal` removido)
- **Teste:**
  `apps/api/test/application/use-cases/git/read-project-code.use-case.spec.ts`
  (bloco "o portão do container": `mounted`/`runner` respondem 409 sem
  decisão e leem normalmente decididos),
  `apps/api/test/application/use-cases/containers/ciclo-de-vida-do-container.use-case.spec.ts`
  (`mounted`/`runner` registram `provisioning` em vez de 400),
  `apps/web/src/routes/ProjectCodeTab.test.tsx` (os três modos tratados
  igual)
- **Decisão arquitetural:** [ADR 0135](https://github.com/viralabs-dev/brabo/blob/dev/docs/adr/0135-portao-de-imagem-nos-tres-modos.md)
- **Origem:** plano do dono do produto, Parte 1 / PR 1.7 — decisão #5 do
  plano original ("Portão RN-105 passa a valer nos TRÊS modos"), já aceita
  antes deste PR existir

## O broker reinicia só o processo do app (RN-1025)

### RN-1025 — `POST /containers/:projectId/app/restart` reinicia o processo do app no lugar {#rn-1025}

A sexta operação do broker, sobre o contrato `DockerPort.reiniciarApp`
(RN-1024, ADR 0264, que revisa as "cinco operações" da ADR 0228). Ela reinicia
SÓ o processo do app dentro do container do projeto em execução: sem `stop`/`start`,
então os comandos `exec` das lanes em andamento não são tocados.

- **O comando nunca vem do pedido.** A rota ignora o corpo. O
  `comandoDoApp` é o do `container-spec` da api (a decisão VIGENTE),
  buscado do mesmo jeito que o `start` o busca. Projeto sem comando vigente
  recebe um 409 nomeado (`SemComandoDoAppError`), e a porta não é chamada. Projeto
  `runner` recebe o mesmo 409 das outras rotas (o container não está neste
  host).
- **A resposta é o resultado tipado, sem texto livre e sem log.** `200` com
  `{"reiniciou": true}`, ou `{"reiniciou": false, "motivo": "sem_container" |
  "tempo_esgotado" | "falha_no_exec"}`, ou `{"reiniciou": false, "motivo":
  "app_saiu", "exitCode": <n>}`. O comando do app pode carregar segredo, então
  nenhum trecho de log trafega. Reinício que falha continua `200`: a falha é a
  resposta, não um erro do broker. O limite de tempo (`TIMEOUT_DO_REINICIO_MS`, 30 s)
  é da porta, e ela responde `tempo_esgotado`.
- **Os mesmos portões das vizinhas:** token de serviço (401), só `POST` (405),
  roteador fechado (`/containers/:id/app/restart` é o único caminho com `app`).

- **Onde:** `apps/broker/src/operacoes.ts:354` (`reiniciarApp`),
  `apps/broker/src/operacoes.ts:367` (`SemComandoDoAppError`),
  `apps/broker/src/servidor.ts:146` (rota), `apps/broker/src/servidor.ts:209` (despacho)
- **Teste:** `apps/broker/src/servidor.spec.ts` ("POST /containers/:id/app/restart (RN-1025)")
- **Decisão arquitetural:** ADR 0264

## O token do registry só entra como secret do BuildKit (RN-1039)

### RN-1039 — O token do GitHub Packages nunca vai para camada, `ARG` ou `ENV` {#rn-1039}

O `@brabo/docker-port` é instalado do GitHub Packages (`@viralabs-dev/brabo-docker-port`,
AT-770), e o registry exige token até para pacote público. O token só existe durante o
`RUN` que instala, como secret do BuildKit.

- **Dockerfile:** todo `pnpm install` é `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc`.
  Nenhum `ARG`/`ENV` leva token, e o `~/.npmrc` nunca é copiado para a imagem.
- **Repo:** o `.npmrc` versionado tem só `@viralabs-dev:registry=https://npm.pkg.github.com`.
- **CI:** o `GITHUB_TOKEN` vira um arquivo temporário, entregue por `secret-files` (ou
  `docker build --secret`), nunca por `build-args`.

- **Onde:** `Dockerfile`, `Dockerfile.dev`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **Teste:** `src/token-do-registry.spec.ts:23` (`describe`)
- **Decisão arquitetural:** ADR 0270

## A prova de compose do QA (RN-1326, RN-1327)

### RN-1326 — O broker só roda o compose do projeto depois da allowlist, e nunca como está {#rn-1326}

`POST /containers/:id/qa/:chave/compose` (sem corpo; o caminho vem da `localizacao` da api) lê o clone limpo
`<raiz>/<segmento>/.brabo-qa/clone-limpo`, somente leitura. Antes de qualquer `up`: `include`, `extends` e `env_file`
fora do contexto são recusados no TEXTO cru (o `config` os resolveria ou leria, ex. `/proc/self/environ`); o JSON de
`docker compose config` passa pela allowlist (`build` com contexto dentro do clone, `image`, `environment`, `ports` só em
`127.0.0.1`, `depends_on`, `healthcheck`, `command` e poucos mais). `privileged`, `cap_add`, `network_mode`, `pid`, `ipc`,
`devices`, `extra_hosts`, volume de host e porta fora de `127.0.0.1` voltam em `recusas` com o nome do campo; qualquer outra
chave volta como `<serviço>.<campo>`. Recusado, nada sobe (`subiu: false`, origem `projeto`). O `docker` roda com ambiente
limpo (sem `BRABO_SERVICE_TOKEN`, que o compose interpolaria). Sem plugin, sem clone, sem raiz visível ou sem imagem de
sonda: `503` origem `infra` ("sem prova de compose").

- **Onde:** `src/prova-de-compose.ts:118` (`recusasDoTexto`), `src/prova-de-compose.ts:136` (`recusasDoConfig`), `src/operacoes.ts:244` (`provaDeComposeQa`)
- **Teste:** `src/prova-de-compose.spec.ts` ("allowlist (cada campo recusado pelo nome)")
- **Decisão arquitetural:** ADR 0297

### RN-1327 — A prova limpa sempre, tem teto de 10 min e 4 GiB e é uma por projeto {#rn-1327}

Um override gerado pelo broker dá a cada serviço `mem_limit`, `cpus`, `pids_limit` e `no-new-privileges` (e `cap_drop: [ALL]`
nos serviços com `build`; banco só de imagem mantém as capacidades padrão). `up --build --wait` e as sondas de `/docs` e
`/openapi.json` (container `wget` na rede do projeto, até 5 tentativas) dividem os 10 minutos; estourou o tempo, ou as imagens
somam mais de 4 GiB depois do build, o resultado é origem `infra`. Em qualquer saída (sucesso, recusa, falha, exceção, teto)
roda `down -v --rmi local --remove-orphans` e `builder prune`; falha de limpeza é logada. Segunda prova do mesmo projeto
enquanto há uma viva: `409`. O teto de disco é conferido depois do build, não imposto durante.

- **Onde:** `src/prova-de-compose.ts:291` (`provaDeCompose`)
- **Teste:** `src/prova-de-compose.spec.ts` ("prova de compose (Docker dublê)")
- **Decisão arquitetural:** ADR 0297

## O broker lê o host e remove o órfão (RN-1375 a RN-1377)

### RN-1375 — `GET /host/recursos` só lê, sem parâmetro e sem spec {#rn-1375}

Sétima operação do broker (ADR 0298). Devolve `{ portas, containers, redes }` de `DockerPort.recursosDoHost()`: `portas` cobre todo
container `running` do host, e para o que não é `brabo.managed=true` leva só a porta (`projectId: null`; nome e imagem de terceiro
não saem); `containers` e `redes` cobrem só o gerenciado, com `projectId`. Exige o token de serviço, aceita só `GET` (outro método
é `405`), ignora query string e não consulta a api. A api usa a leitura para escolher a porta do app.

- **Onde:** `src/servidor.ts:96` (`tratar`, ramo `/host/recursos`), `src/operacoes.ts:310` (`recursosDoHost`)
- **Teste:** `src/servidor.spec.ts` ("GET /host/recursos (RN-1375)")
- **Decisão arquitetural:** ADR 0298

### RN-1376 — `POST /containers/:id/orfao/remove` só age quando a api responde 404 {#rn-1376}

Oitava operação. O broker pergunta à api pela `container-spec` do projeto; só a resposta `404` (`ProjetoDesconhecidoError`) libera
`DockerPort.removerPorProjeto(projectId)`, que remove por rótulo (`brabo.managed=true` + `brabo.project.id`) containers, serviços de
QA e redes, e devolve `{ containers, redes }` dos nomes removidos. O corpo é descartado: nada do chamador escolhe o que sai.

- **Onde:** `src/operacoes.ts:332` (`removerOrfao`), `src/servidor.ts:154` (`rotaDeContainer`, `orfao/remove`)
- **Teste:** `src/servidor.spec.ts` ("POST /containers/:id/orfao/remove (RN-1376, RN-1377)")
- **Decisão arquitetural:** ADR 0298

### RN-1377 — Projeto vivo ou api fora do ar: o órfão não é removido {#rn-1377}

Se a api conhece o projeto, a resposta é `409` (origem `politica`, "use `remove`") e nada é tocado. Se a api não responde (`502`,
`ApiIndisponivelError`) ou responde erro, o erro sobe e nada é tocado: na dúvida, não se remove. O `projectId` é validado como
segmento (`422` se inválido). O `409` nomeado `porta_ocupada` do ADR 0298 depende de `PortaDoHostOcupadaError` no contracts e não
está na TAG `1.4.0-dev.1`; fica para a TAG seguinte.

- **Onde:** `src/operacoes.ts:315` (`ProjetoVivoError`), `src/operacoes.ts:332` (`removerOrfao`)
- **Teste:** `src/servidor.spec.ts` ("projeto vivo é 409", "api fora do ar é 502")
- **Decisão arquitetural:** ADR 0298


## Serviços e `env` no container de trabalho (AT-1015, RN-1518 do contracts)

Não há RN própria do broker: a regra é a RN-1518 do `brabo-contracts` (o `docker-port` sobe os serviços no `localhost` do container de trabalho e injeta o `env`). O broker só repassa o que a api manda no contexto: `services` (descartando os `shared`, que são só da instância de QA) e `env` entram na spec do trabalho, e o `env` entra também na spec da instância de QA. Os dois campos são opcionais; sem eles a spec é idêntica à de antes. Como todo campo da spec, passam por `especificacaoValidada` (imagem com digest, régua do `env`), e a recusa chega ao usuário como erro de spec inválida com o nome do campo.

- **Onde:** `src/operacoes.ts` (`especificacaoDoProjeto`, `servicosDaApi`), `src/api-client.ts` (`ContextoDoProjeto.services`/`env`)
- **Teste:** `src/operacoes.spec.ts` ("AT-1015")

### Alteração (AT-1015): serviço de dados morto e `campo` da spec inválida

Nenhuma RN nova do broker (regras: RN-1540 e a recusa de `usuario`/`dados` do `brabo-contracts`). `respostaDeErro` (`src/servidor.ts`) mapeia `ServicoDeDadosMorreuError` para `422` com `origem: "politica"`, `code: "servico_de_dados_morreu"`, `servico`, `exitCode` (`null` se o container sumiu) e `ultimasLinhas` (já mascaradas pelo docker-port), e `EspecificacaoInvalidaError` para `422` com `campo`. Testes: `src/servidor.spec.ts` ("AT-1015").
