# brabo-broker

Broker de container: o ÚNICO processo do produto com o socket do Docker do servidor (ADR 0130).

> Partido do `CLAUDE.md` do monorepo `daneiel/brabo` (hoje `brabo-legacy`, `dev` @ `1586158973`) na AT-708 (EP-033, ADR 0252). Copiado, não resumido: o que era de outro repo foi cortado e os caminhos do monorepo viraram a raiz deste repo (ou `brabo-<x>:caminho`). Caminhos sem prefixo que não existem aqui (`docker/`, `deploy/`, `install.sh`, `e2e/`, `scripts/dev/`, `scripts/ci/` fora do `brabo-ci`) moram no `brabo-infra`, no `brabo-qa` ou no `brabo-ci`. O resto das regras mora no `CLAUDE.md` da pasta-mãe (`brabo-workspace`, clonado em `~/dev/brabo/CLAUDE.md`) e no de cada repo irmão.

## Stack (decidida — não proponha alternativas)
- `brabo-broker`: Node/TS, o único processo do produto com o socket do Docker (ADR 0130), imagem própria (ADR 0162).
- Contratos: `@brabo/docker-port` vem do `brabo-contracts` por TAG (fonte TypeScript, bundle embutido pelo `tsup`).

## Repositório, branches e PR (vale para todo repo `brabo-*`)
- Branches permanentes: dev, main — um branch, um ambiente; a esteira é
  `dev → main`. A `qa` foi APOSENTADA por hora (ADR 0235, só no repositório do
  Brabo; arquivada em `refs/archive/qa`, segue em `PROTECTED_BRANCHES` do
  produto e em `NUNCA_ARQUIVAR`). `rc` saiu
  da política (ADR 0030) e o bootstrap parou de criá-la, mas continua em
  `PROTECTED_BRANCHES` DE PROPÓSITO: a lista decide o que a trava de merge
  RECUSA, e repositórios bootstrapados por versões anteriores ainda têm a
  branch. Proteger uma branch que não existe não custa nada; desproteger
  uma que existe custa caro. Não "limpe" essa lista.
  Trabalho nasce de dev com a taxonomia da política (breaking/,
  feature/, bugfix/, perf/, refactor/, chore/, docs/, test/);
  hotfix/ nasce de main. Os AGENTES seguem a mesma régua desde a RN-664: o
  worktree do dev agent nasce de `dev`, a PR dele e a de ADR miram `dev`, e o
  gate julga o diff contra `dev` — os três juntos, nunca um só (o gate
  julgaria um diff que não é o da PR); repositório sem `dev` falha nomeado,
  sem queda para a default. A PR de INFRA (`open_infra_pr`) segue a
  mesma régua desde a RN-729: `feature/infra-setup` nasce de `dev`, mira `dev`
  e leva o autor `infra[bot]`. Formato funcao/descritivo,
  regex ^.{0,30}/\S{0,32}$. EXCEÇÃO nomeada: `dependabot/…` é branch
  PERMITIDA sem critério de caracteres (sem limite de tamanho, qualquer número
  de barras), mas só quando o AUTOR é o próprio Dependabot
  (`ehBranchDoDependabot` em `scripts/ci/pr-police.ts`) — humano com esse
  prefixo reprova em `FUNCAO-DESCONHECIDA`, senão o prefixo vira a porta para
  escapar do formato. Commits em conventional commits, pt-BR.
  A FUNÇÃO da branch decide a VERSÃO (scripts/ci/version.ts): breaking/
  sobe MAJOR, feature/ sobe MINOR, todo o resto é PATCH. Mudança que
  exige ação do operador antes do deploy nasce em breaking/ mesmo quando
  o conteúdo é correção — o v2.5.1 saiu patch porque a chave obrigatória
  do OAuth nasceu em bugfix/, e um patch diz "atualize sem pensar".
  Versão não se corrige à mão depois: o valor de ela ser calculada vem de
  não ser negociada caso a caso.
- Toda mudança entra por PR — push direto em permanente é bloqueado;
  únicas exceções de push: tags (bot de release) e .release/gate.json
  (bot do gate).
- Toda branch cujo PR é mergeado é ARQUIVADA automaticamente, SEM carência, por checagem
  SEMANAL (segunda 09:00 de Brasília, AT-661) (`.github/workflows/archive-merged-branch.yml`,
  AT-557): sem PR aberta e sem commit depois do merge; branch sem PR mergeada
  não é tocada — move de
  `refs/heads/<nome>` para `refs/archive/<nome>`, nunca apaga: histórico
  intacto, recuperável com um `git push` de volta. Exceções: dev/qa/main
  (aparecem como `head` de todo PR de promoção), `gh-pages` (deploy do
  site, não é branch de feature) e branch de fork. A política mora em
  `scripts/ci/archive-branch.ts` (testado), ver
  scripts/ci/docs/explanation/branching-policy.md, seção "Merged branches get
  archived".
- PR do Dependabot entra pela `dev`, nunca direto na `main`; na `dev` ele não espera aprovação humana (ADR 0236) e a `main` segue com a escada inteira. Dependência de linguagem só por segurança (`open-pull-requests-limit: 0`), `github-actions` e `docker` semanais, `target-branch: dev`. O `dependabot-para-dev.yml` do `brabo-ci` fecha ou redireciona o PR de segurança que o GitHub abre contra a `main`.
- Merge em branch protegida (`dev`/`main`) é SEMPRE manual do usuário, sem opção de automatizar. A política de PR, escada, promoção e carimbo de tag vem dos workflows reutilizáveis do `brabo-ci`, fixados por SHA com `# vX` no `uses:`. Imagem de terceiro por digest com a tag inline. Segredo nunca é impresso; teste nunca roda contra o Postgres da instalação.

## Convenções (repositório, dados e domínio)
- Volume nomeado do Docker nasce com o dono do caminho que existir NA IMAGEM;
  quando o caminho NÃO existe, ele nasce `root` e o processo non-root fica de
  fora. Por isso `/data/git-repos` e `/data/project-workspaces` são criados e
  `chown`-ados ANTES do `USER` nos QUATRO Dockerfiles — os dois de produção e
  os dois de dev (`docker/api/Dockerfile`, `docker/engine/Dockerfile`). Só a
  produção fazia isso, e o preço foi medido: em dev, `git init --bare` do
  `LocalGitProvider` morria com `permissão negada: /data/git-repos/<slug>.git`
  e o `permissions.json` de cada projeto não tinha onde ser escrito — ou seja,
  provisionar repositório era impossível na máquina de quem desenvolve o
  produto. Ao acrescentar volume nomeado novo, crie o diretório na imagem;
  esquecer não dá erro de build, dá 403 em runtime. Vale também para os
  `node_modules` de `api` e `web` (AT-172: `EACCES` no `pnpm install`), e o
  ponto de montagem DENTRO do bind-mount do host o Docker cria como root —
  isso a imagem não alcança, e quem o cria antes é o `preflight.mjs`. Os do
  ENGINE (`_build`/`deps`/`.mix`/`.hex`) já nasciam com o dono certo — medido
  do zero na AT-182, o `docker/engine/Dockerfile` os cria antes do `USER`. Volume JÁ criado continua
  com o dono antigo: a correção vale para volume novo, e destravar um ambiente
  existente exige `docker volume rm` (ou um `chown` pontual como root).

## Broker e container (regras)
- este repo: workspace novo, Node/TS — o ÚNICO processo do produto que
  fala com um daemon Docker no SERVIDOR (ADR 0130), e o único serviço com
  `/var/run/docker.sock` montado. Não monte esse socket em mais nenhum. Sem
  framework web (são seis rotas, medido em 2026-09-25, `node:http` puro), imagem própria em
  `docker/broker/`, e o binário `docker` DENTRO da imagem (`docker-cli`, só o
  cliente) — preço declarado da decisão de usar um mecanismo só dos dois lados.
  **Ele não aceita especificação de container**: recebe um `projectId` e uma
  das cinco operações da `DockerPort`, vai à api LER a decisão do Arquiteto
  (`GET /internal/projects/:projectId/container-spec`) e COMPÕE imagem, rede,
  recursos e o único mount. Não existe campo em que se escreva `privileged`,
  `cap_add`, `network: host` ou um `-v` livre — se a spec viajasse no corpo, a
  contenção de um processo root-equivalente no host dependeria de o CHAMADOR
  estar correto. A api NÃO manda caminho nenhum (o `-v` é resolvido pelo daemon
  contra o filesystem do HOST; um caminho de dentro do container da api montaria
  uma pasta VAZIA). Desde o ADR 0144 (RN-503) ele tem DUAS raízes —
  `PROJECT_WORKSPACES_HOST_ROOT` (a pasta GERENCIADA, modo `container`) e
  `BRABO_PROJECTS_HOST_BASE` (a base dos projetos MONTADOS, derivada de
  `BRABO_PROJECTS_BASE` no compose, ADR 0141) — e ele NÃO adivinha qual usar: a
  api manda um localizador DISCRIMINADO (`localizacao`: `gerenciada` |
  `montada` | `indisponivel`) dizendo contra qual raiz o SEGMENTO relativo
  vale. O invariante é o mesmo de sempre — o que atravessa a rede continua
  sendo só a metade que a raiz do broker não cobre. `start` recusa NOMEANDO a
  raiz que falta, e NUNCA cai na outra: a gerenciada é nomeada por
  `workspace_dir_name` e a base é nomeada pelo usuário, então o mesmo nome
  aponta para pastas diferentes e o container subiria com o código de outro
  projeto. Ele atende `container` E `mounted`, e recusa `runner` (a pasta mora
  numa máquina que este host não enxerga); a lista é de PERMITIDOS, então modo
  novo no enum nasce recusado com mensagem. Contenção em cinco camadas
  independentes — sem porta publicada, rede `internal: true` que só a api
  alcança, `BRABO_SERVICE_TOKEN` em tempo constante, cinco operações, spec
  computada. Desde a RN-512 (ADR 0146) sobe POR PADRÃO no compose local e
  permanece sob `profiles: ["container-broker"]` no de produção e no de
  INSTALAÇÃO — a divergência entre o de dev e os outros dois é a decisão, não
  descuido; no de instalação quem liga o profile é o `install.sh`, perguntando
  (ADR 0162, RN-575). A imagem de PRODUÇÃO (`docker/broker/Dockerfile.prod`) é
  a QUINTA publicada no GHCR desde o ADR 0162, com os mesmos gates das outras
  quatro (Trivy, non-root, healthy read-only sem rede no `ci.yml`; digest,
  assinatura e verificação no `release.yml`) — e o Kubernetes NÃO a conhece, de
  propósito: não há Deployment de broker, e `argumentosDeSetImage` emite só as
  quatro que a base do kustomize declara. A imagem de
  DEV instala as dependências no BUILD e NUNCA em runtime, e isso é
  consequência direta da rede: sem egress não há registry alcançável, e a
  resposta a "o pnpm não baixa" é SEMPRE tirar o registry do caminho quente
  (o pnpm instalado no build em `/usr/local/bin`, do tarball do registry
  conferido contra o sha512 gravado no Dockerfile, na MESMA versão do
  `packageManager` — sem corepack, que o Node 25+ não traz (AT-360); `pnpm
  install` como passo de build), NUNCA dar rede ao serviço. Os TRÊS
  volumes nomeados de `node_modules` são montados por cima do que a imagem
  instalou, e o Docker só semeia volume VAZIO — então
  `docker/broker/entrypoint.sh` reconcilia os três contra uma cópia guardada
  FORA de `/workspace`, carimbada com o sha256 do `pnpm-lock.yaml` do build:
  mexer numa dependência do broker exige `up -d --build broker`, e o
  entrypoint AVISA quando a imagem ficou para trás em vez de recusar subir. O
  serviço tem healthcheck (`wget` contra `127.0.0.1:8090/health`, de DENTRO —
  ele não publica porta): sem ele, `up --wait` dava `Healthy` a um container
  que morria cinco segundos depois, e foi assim que a queda chegou a ser
  anunciada como "reset completo"
- Spec ampliada (ADR 0228/0229, RN-928..930): o `sleep infinity` deixou de ser
  incondicional. `comandoDoApp` (da `container-spec`, nunca do corpo) usa o
  supervisor constante `SUPERVISOR_DO_APP` com o comando como argumento;
  `portas` (só `-p 127.0.0.1:H:C`), `dns` e `hostsExtras` são validados em
  `spec-de-container.ts`. O papel `qa` (`spec.qa`) é a instância efêmera
  `brabo-qa-<workspace>-<chave>`, sem `--restart`, e `stop`/`remove`/`inspect`/
  `exec` aceitam `alvo: { papel: 'qa', chave }` (a porta segue com CINCO
  operações; só `brabo.papel=qa` é alcançado). Rotas novas do broker, no
  roteador fechado: `/containers/:projectId/qa/:chave/{start,remove,exec}` —
  tudo o mais segue 404. Contrato api -> broker: campos `comandoDoApp`, `ports`
  (`host`, `container`, `protocol`), `dns`, `extraHosts` (`name`, `ip`) e, com
  `?papel=qa&task=<chave>`, `qa: { chave, services: [{ name, image, env?, tmpfs?,
  user?, command?, shared? }] }` (`user` = `<uid>:<gid>` nunca 0, `command` = argv
  depois da imagem, RN-941; o serviço próprio se chama `<instância>-<serviço>`).
- `brabo-contracts:packages/docker-port`: a porta de Docker e o adaptador de CLI, consumidos
  por `brabo-runner` e este repo. Runtime, e por isso NÃO cabe em
  `brabo-contracts:packages/shared` (100% tipo, invariante travado por teste). Sem passo de
  build: os dois consumidores o EMPACOTAM (`tsup`, `bun build --compile`), e é
  por isso que a api não pode consumi-lo — `pnpm deploy` copia o pacote de
  verdade e o Node recusa type stripping dentro de `node_modules`
- FASE 25b DEIXOU de ser corte no compose LOCAL (RN-512, ADR 0146 ponto 3): o
  broker sai do `profiles` ali e sobe com `pnpm dev`, e permanece sob
  `profiles: ["container-broker"]` só em PRODUÇÃO — os dois composes divergem
  de propósito, não uniformize. A justificativa original ("nada o chama... em
  troca de nada", ADR 0130) morreu: são quatro chamadores reais desde os ADRs
  0133/0136, e o ADR 0144 fez `mounted` subir PELO broker, então com o profile
  desligado o modo padrão terminava em `BrokerIndisponivelError`. A assimetria
  é o que o socket significa de cada lado: quem roda `pnpm dev` já o tem (está
  rodando `docker compose`), em produção ele é fronteira de privilégio e o
  operador não é o desenvolvedor. Isso muda QUANDO o broker roda, nunca O QUE
  ele aceita — as cinco camadas de contenção seguem intactas. Consequência:
  `DOCKER_GID` passa a importar para toda máquina de desenvolvimento, e
  `preflight.mjs` RELATA o estado dele a cada subida (errar não quebra o boot,
  quebra o uso, e o sintoma aparece só no `container_start`). Desde a RN-599
  o compose de DEV também dá default a `BROKER_URL` (`http://broker:8090`, o
  serviço do mesmo arquivo) — produção e instalação seguem `${BROKER_URL:-}`,
  e essa divergência também é a decisão, não uniformize —, e o preflight
  RELATA a pasta gerenciada no mesmo molde do `DOCKER_GID`: sem
  `PROJECT_WORKSPACES_HOST_DIR` o broker fica sem
  `PROJECT_WORKSPACES_HOST_ROOT` e o modo `container` não sobe container; o
  `~` é acusado porque o Compose o expande no bind-mount e NÃO na variável do
  broker. Relata, nunca recusa nem grava o `.env`. Em PRODUÇÃO, sem
  o profile ligado, `container_start` continua terminando `failed` com
  `BrokerIndisponivelError`. Na INSTALAÇÃO por Release
  (`docker-compose.install.yml`) o serviço `broker` EXISTE desde o ADR 0162
  (RN-575), desligado sob o MESMO profile, e quem o liga é o `install.sh`,
  PERGUNTANDO — só um "s" digitado liga, o `DOCKER_GID` é MEDIDO de dentro de
  um container com a própria imagem do broker (recusa nomeada, nunca o 999 de
  palpite), e `COMPOSE_PROFILES`/`BROKER_URL`/`DOCKER_GID`/
  `PROJECT_WORKSPACES_HOST_ROOT` vão juntos para o `.env` ou nenhum vai. É o
  argumento da RN-512 (quem instala na PRÓPRIA máquina já tem o socket), com
  consentimento no lugar do "sobe por padrão" do dev porque quem instala nunca
  leu este repositório. `BRABO_BROKER_IMAGE` é obrigatória ligado ou não — o
  Compose interpola o arquivo inteiro antes de filtrar por profile (medido). E
  desde o ADR 0161 (RN-573/574) a TELA sabe se há broker: `brokerConfigurado`
  (`ContainerBrokerPort.configurado()`, a mesma fonte do estado observado) vem
  em `GET .../projects-base` e em cada linha de `GET .../containers`, o
  assistente para de pré-selecionar `mounted` sem broker confirmado e a
  `/containers` recusa antes do clique a subida de `container`/`mounted`. As
  duas metades são a MESMA decisão do mantenedor ("os dois"). O
  que mudou (ADR 0133, RN-491) é que o MECANISMO deixou de ser corte:
  `container_start` é `proposed_action` de verdade (`maintainer`) — e desde
  o ADR 0190 (RN-671) é SEMEADA `auto_approve` no aceite do handoff da Infra,
  com o SERVIDOR do Infra Lead propondo a primeira subida sozinho no kickoff
  quando há roteamento — com a rede HERDADA da `artifact.project_image` do
  Arquiteto (`egress` incluído, sem clique; `none` sem decisão dele — ADR
  0208, RN-723, preço declarado na borda 5 do ADR 0189) (`container`/`mounted`; `runner` segue pelo modelo e
  com aprovação) —, e
  `ExecuteContainerStartUseCase` chama `ContainerBrokerPort.start` de
  verdade quando aprovada — o Infra Lead elege uma das candidatas do
  roteamento do Arquiteto (`artifact.module_routing`, ADR 0131) e a eleição
  emite nova versão de `artifact.project_image` (reusando
  `DecidirImagemDoProjetoUseCase`, `decidedBy: 'infra-lead'`), porque o
  broker compõe a partir DESSE artefato, nunca do roteamento. Das cinco
  operações do ADR 0128/0130, agora as CINCO têm chamador — `inspect` (a
  rota de ciclo de vida, observado ao lado do registrado), `start` e, desde
  o ADR 0134 (RN-492), `exec`: quando há um container `running` REGISTRADO,
  o comando de terminal do dev agent atravessa engine → api → broker e roda
  DENTRO dele, via `docker exec`, em vez de `System.cmd` local — a lacuna
  que a RN-491 tinha deixado declarada ("dev agents NÃO passam a trabalhar
  dentro do container") fechou. Desde o ADR 0136 (RN-495, PR 1.8), `stop` e
  `remove` também têm chamador: a página global de containers
  (`/containers`) propõe `container_stop`/`container_remove` — dois tipos
  novos, sempre um HUMANO clicando "Parar"/"Remover" numa linha da tela,
  nunca um agente. `container_stop` segue o calibre de
  `container_start` (`maintainer`, pode ser configurado auto-aprovável), mas
  NUNCA é semeado — a semente do ADR 0190 é só a da subida; `container_remove` — o mais destrutivo dos três, descarta
  o container e exige reprovisionar do zero — entra no MESMO teto absoluto
  de git push/comando privilegiado (RN-418): nunca auto-aprovável, "sempre
  permitir" recusado na fonte. A tela em si tem seu próprio teto: perguntar
  o OBSERVADO ao broker é uma chamada de rede por projeto, então só linhas
  `provisioning`/`running` são elegíveis, com um teto explícito de 20
  chamadas por carregamento (`TETO_DE_VERIFICACOES_POR_CARGA`) — o que fica
  de fora diz por quê (`naoVerificado`), nunca confundido com o broker ter
  sido perguntado e recusado (`naoObservado`).
  `RegistrarTransicaoDeContainerUseCase` ganhou o primeiro chamador fora de
  teste, transicionando `provisioning → running` (ou direto para `running`
  a partir de `stopped`, que a máquina de estados do ADR 0081 não deixa
  reprovisionar) — `container_remove` acrescenta o segundo hop real,
  `running → stopped → removed`, refletindo que `ContainerBrokerPort.remove`
  já era `docker rm --force` (remove mesmo `running`, numa chamada só) sem
  alargar a máquina de estados com um atalho `running → removed` que só
  existiria para este caso. O que seguia cortado até o ADR 0137 (RN-497,
  PR 1.3): `mounted`/`runner` continuavam sem container nenhum subindo NO
  SERVIDOR — o portão dos três modos fechou (RN-494/ADR 0135, PR 1.7: os
  três modos agora exigem imagem decidida para a aba Code, e
  `RegistrarTransicaoDeContainerUseCase` não recusa mais por modo), mas quem
  impedia `mounted`/`runner` de chegar em `running` era só o broker
  (`ModoDeExecucaoNaoSuportadoError`). O ADR 0137 fechou essa metade DO OUTRO
  LADO: `mounted`/`runner` sobem container de verdade NA MÁQUINA DO USUÁRIO,
  pelo `brabo-runner`. E o ADR 0144 (RN-503) fechou a metade que faltava para
  `mounted`, do lado do SERVIDOR: a base única do ADR 0141 tornou aquela pasta
  alcançável pelo daemon do host, então `mounted` passa a subir pelo BROKER
  como `container` — a ramificação vira por DESTINO (`container` e `mounted` →
  broker, `runner` → runner), e as três ações de ciclo de vida mudam juntas. O
  broker ganhou uma SEGUNDA raiz (`BRABO_PROJECTS_HOST_BASE`) e a api passou a
  mandar um localizador DISCRIMINADO em vez de um nome solto, sem que nenhum
  caminho absoluto atravesse a rede. `runner` é o único modo que segue sem
  container NO SERVIDOR — a pasta dele mora numa máquina que o broker não
  enxerga. A pergunta "quantos módulos, um container só" segue como está,
  `project_id UNIQUE` em `project_containers`, sem mudança aqui. O que
  faltava fechar era o OUTRO fallback: até a RN-507 (ADR 0145), um projeto
  `runner` verificado e conectado tinha comando roteado ao CLI mesmo SEM
  container `running` de pé — o runner caía sozinho no host puro,
  silenciosamente. `Engine.Runners.RunnerReadiness` unifica os TRÊS modos sob
  o MESMO predicado, e `container_start` deixa de atender `runner` (o
  payload dela, com eleição de imagem, nunca fazia sentido pra um caminho
  sem roteamento contra o qual eleger) — `container_start_via_runner` é o
  tipo novo, exclusivo desse modo

## Documentação é parte da definição de pronto (permanente)
- A doc deste repo mora em `docs/` (fonte pt-BR; `en`, `ru` e `zh-Hans` em `docs/i18n/`). Ao alterar código, atualize a doc da área NA MESMA mudança e mostre o diff dela junto com o do código. Não pergunte se deve: faça. NUNCA crie `website/docs/`: o site é agregado pelo `brabo`, que lê a `docs/` de cada repositório.
- Mudança de comportamento observável → entrada em `CHANGELOG.md` (Unreleased). Versão própria a partir da 1.0.0, e toda tag nasce de workflow (nunca versionar à mão).
- Regra de negócio nova → RN-XXX com `caminho:N` (`símbolo`) e o teste que a cobre, na `docs/business-rules*` deste repo; a numeração é UMA só no produto (nunca reinicie), a âncora `{#rn-NNN}` é o contrato e não muda quando a RN muda de arquivo. Aloque o número varrendo as branches locais e o remoto (colide com frente paralela).
- Mudança estrutural (fronteira de camada, banco, modelo de consistência, dependência pesada) → ADR novo com o próximo número; ADR aceito NUNCA é editado (o novo o referencia). Os ADRs moram no repo `brabo` (a porta de entrada do produto).
- Nunca inventar conteúdo de doc: sem informação suficiente, use `> **TODO(humano):** <pergunta específica>.`. Diagramas em Mermaid no próprio Markdown, nunca imagem.
- Este arquivo também é doc: toda mudança verifica se ele precisa mudar (Stack, convenções, "O que NÃO fazer"). Ele é lido em toda sessão e não passa de 40 mil caracteres (`wc -m`, nunca `wc -c`); o que só vale para uma área sai daqui para `.claude/rules/` com `paths:`.

## Estado, decisões abertas e lacunas que são DESTE repo
- FASE 25b e o ciclo de vida do container (o broker por padrão só no compose
  de DEV, `container_start`/`_stop`/`_remove`, a ramificação por DESTINO): o
  texto inteiro mora em `.claude/rules/broker-e-containers.md`, carregado quando a
  sessão lê broker, `docker/` ou o código de container da api e do engine.
- **O piloto automático confia na contenção do container, e ela tem bordas
  que a prova NÃO cobre (ADR 0189).** Provado em
  `src/contencao-do-brabo.spec.ts`: uma pasta só, em `/work`,
  estritamente abaixo da raiz do broker, sem socket nem privilégio. Declarado e
  NÃO remendado (a decisão foi descrever): no compose de PRODUÇÃO nada no host
  confere que `BRABO_PROJECTS_BASE` não contém o checkout/a pasta do `.env`
  (o preflight só roda no `pnpm dev`, e a api compara com o próprio `cwd`); o
  `install.sh` confere a base só no consentimento, sem teste; no modo `runner`
  nada compara a pasta com um checkout do Brabo na máquina do usuário;
  `segmentoDeProjetoValidado` aceita `.` (a api nunca o produz); e a rede
  `egress` alcança as portas publicadas da máquina. Fechar qualquer uma é
  decisão do dono, não correção de passagem
- A chamada ao broker tem teto POR OPERAÇÃO desde a RN-604 (`tetoDaOperacao`,
  `container-broker.client.ts`), e a cadeia do `exec` é broker < api <
  engine — mexer no teto de um salto sem o de cima reabre o defeito, e os
  testes dos dois lados conferem a ordem. Desde a RN-757 (AT-440) a cadeia
  tem um QUARTO salto, o de fora: a ação `terminal` auto-aprovada é executada
  dentro do `propose_action`, e o engine a espera por
  `TERMINAL_ACTION_TIMEOUT_MS` (agora 120s, era 15s) + 120s — broker (T) <
  api (T + 45s) < `container-exec` (T + 90s) < `propose_action` (T + 120s),
  abaixo dos 300s do `fetch`; o estouro chega ao modelo nomeando o teto, e
  esse teto passar de ~180s reabre o corte. O estouro do `exec` é decidido pelo RELÓGIO, não
  pelo `killed` — o cliente `docker exec` sai 0 ao receber o SIGTERM —, e o
  grupo do comando é morto DENTRO do container pelo PID que o embrulho grava
  (RN-807); não volte a confiar só em `killed`. Segue aberto, por DECISÃO do
  mantenedor (AT-234, opção D, RN-605): imagem grande não sobe na primeira
  tentativa. O pull é passo explícito do `start` (`image inspect` → `pull`)
  sob o MESMO `TIMEOUT_DE_CONTROLE_MS` de 30s, e o estouro é
  `PullExcedeuTetoError` (504, origem `infra`) — antes saía "código -1" com
  `origem: null`. Matar o CLI CANCELA o pull (medido): a imagem NÃO segue
  baixando por trás. Não suba o teto de passagem: as outras três saídas
  (teto próprio, `start` assíncrono, pull antecipado) foram medidas e
  recusadas. Os tetos de quem espera o `start` contam as SEIS chamadas de
  controle (`CHAMADAS_DE_CONTROLE_NO_START`): 195s na api, 185s no
  `RunnerRouter`, 225s no `propose_action` do engine para as ações de
  container que a api executa auto-aprovadas. E `timeoutMs` acima de ~255s
  esbarra nos 300s de cabeçalhos do `fetch` do Node

## O que NÃO fazer
- Não instalar libs sem justificar no plano. Não refatorar código de fase concluída sem pedido explícito.
