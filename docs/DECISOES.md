# Decisões — Dashboard Casa Louzada

Decisões duráveis do projeto: as que restringem o que pode ser construído daqui em
diante. Não é diário de execução — o andamento fica em
[HANDOFF_ATUAL.md](./HANDOFF_ATUAL.md).

Cada decisão traz um marcador de estado:

- **implementada** — já vale no código, com evidência;
- **invariante futura** — decidida e obrigatória, ainda não implementada.

---

## Dados

### DEC-001 — Cada fato comercial é um registro individual

**Decisão.** Venda, locação, captação, proposta e avaliação entram como linhas
individuais em `lancamentos`. Não há contadores agregados mantidos à mão.

**Motivo.** Agregado não se audita nem se corrige: um número errado não tem como ser
rastreado até o fato que o originou.

**Impacto.** Todo total do painel é derivado por soma. Corrigir um erro é editar ou
apagar um lançamento.

**Fonte.** `prisma/schema.prisma` (modelo `Lancamento`); `PLANO.md` §2. **implementada**

### DEC-002 — `lancamentos.equipe_id` é gravado no evento

**Decisão.** A equipe é persistida no lançamento, não lida da equipe atual do
corretor.

**Motivo.** Corretor troca de equipe. Sem isso, a troca reescreveria o histórico
inteiro dele retroativamente.

**Impacto.** O lançamento carrega `corretor_id` e `equipe_id`. Quem consultar por
equipe deve usar o campo do lançamento, nunca `corretor.equipe_id`.

**Fonte.** `prisma/schema.prisma`, campo `equipeId` de `Lancamento`; `PLANO.md` §3. **implementada**

### DEC-003 — `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` são independentes

**Decisão.** São dois tipos distintos do enum. Um lançamento é um ou outro, nunca os
dois.

**Motivo.** São métricas comerciais diferentes; somar uma dentro da outra inflaria os
números.

**Impacto.** Os totais das duas linhas do quadro mensal **nunca** se sobrepõem.
Nenhum cálculo pode somar exclusividade dentro de captação de venda.

**Fonte.** enum `tipo_lancamento` em `prisma/schema.prisma` e na migração inicial;
`PLANO.md` §3. **implementada**

### DEC-004 — `saldo_historico` entra somente em acumulados

**Decisão.** Os saldos históricos entram nos big numbers acumulados e **nunca** em
recortes por período — mensal, trimestral ou anual.

**Motivo.** Existem para evitar cadastrar retroativamente centenas de vendas antigas.
Não têm data de fato, só data de corte.

**Impacto.** Qualquer cálculo por período deverá ignorar `saldo_historico`. Confundir
isso duplicaria valores no VGV do mês.

**Fonte.** `prisma/schema.prisma` (modelo `SaldoHistorico`); `PLANO.md` §3 e §4;
`src/lib/metricas.ts`; commit `6cf0627`.
**implementada no núcleo de cálculo e na leitura** — `calcularMetricasEmpresa` usa saldo
apenas nos acumulados, e o VGV mensal, trimestral e anual soma só lançamentos. Desde a
F3.3 os dois vêm do banco, desde a F3.4 a apresentação os formata e desde a F3.5
`/painel/[token]` os exibe.

### DEC-005 — Períodos civis no fuso `America/Sao_Paulo`

**Decisão.** Mês, trimestre e ano são civis, calculados em `America/Sao_Paulo`.

**Motivo.** Corte de mês em UTC erraria a virada por três horas, jogando lançamentos
do dia 1º para o mês anterior.

**Impacto.** Nenhum cálculo de período pode usar o fuso do servidor. O fuso é fixo,
não é o do navegador nem o da máquina de deploy.

**Fonte.** `PLANO.md` §4; `src/lib/datas.ts`; `src/lib/metricas.ts`; commits `592df35`,
`6cf0627` e `8ec6cbc`.
**implementada no núcleo de cálculo** — a F3.1 materializou as janelas civis em
`mesCorrente`, `trimestreCorrente` e `anoCorrente`, decidindo o período corrente por
`hojeEmSaoPaulo` e ancorando os limites na meia-noite UTC, de modo que o fuso do
servidor não interfere. A F3.2 as consome: VGV por período na empresa, e mês corrente
no quadro geral e nos rankings. A F3.3 ligou a origem dos dados, passando um único
`agora` congelado às duas funções puras — não há dois relógios decidindo períodos
diferentes na mesma tela.

### DEC-006 — Corretor se inativa, não se exclui

**Decisão.** Corretores têm `ativo: boolean`. Desligamento marca inativo.

**Motivo.** Excluir apagaria o histórico de lançamentos da pessoa e distorceria os
acumulados da empresa.

**Impacto.** O fluxo administrativo existe: a área de corretores inativa e reativa,
e não há action nem botão de exclusão. O recorte por `ativo` que alimentará as
listagens do painel existe desde a F3.2B, no núcleo: o corretor inativo é excluído do
resultado dos rankings sem perder o histórico.

**Fonte.** `prisma/schema.prisma`, campo `ativo` de `Corretor`;
`src/app/admin/corretores/acoes.ts`; commit `fa49528`; `src/lib/metricas.ts`;
`tests/metricas.test.ts`; commit `8ec6cbc`.
**implementada** — `calcularMetricasEquipes` exclui o corretor inativo dos rankings e
do `totalCorretores`, e os eventos dele continuam contando nos totais da empresa, que
saem dos lançamentos e não passam pelo elenco (DEC-038). Desde a F3.5,
`/painel/[token]` está conectado e apresenta esses rankings com dados reais.

### DEC-007 — Histórico protegido por foreign keys `Restrict`

**Decisão.** `Lancamento` referencia `Corretor` e `Equipe` com `onDelete: Restrict`.
`Lancamento.autor` usa `SetNull`.

**Motivo.** O banco recusa apagar quem tem histórico, em vez de depender de a
aplicação lembrar de verificar.

**Impacto.** Apagar equipe ou corretor com lançamentos falha na camada do banco. É
proposital, e reforça a DEC-006. Já o autor do lançamento pode sumir sem levar o
lançamento junto.

**Fonte.** `prisma/schema.prisma`, relações de `Lancamento`. **implementada**

---

## Painel

### DEC-008 — Painel é somente leitura

**Decisão.** A tela da TV não escreve nada. Todo dado entra pela área
administrativa.

**Motivo.** É uma tela pública dentro do escritório, sem operador; qualquer escrita
seria superfície de ataque e de erro.

**Impacto.** Nenhuma rota de escrita responde sob `/painel`.

**Fonte.** `src/app/painel/[token]/page.tsx`; `PLANO.md` §2. **implementada**

### DEC-009 — Acesso ao painel por token na URL, sem login

**Decisão.** A proteção é um token longo na própria URL, guardado em `PAINEL_TOKEN`.
Não há tela de login no painel.

**Motivo.** A TV precisa abrir sozinha ao ligar, sem ninguém digitar senha.

**Impacto.** O token é trocável a qualquer momento: basta atualizar a variável e a
URL da TV. Quem tiver a URL tem acesso — ela não deve circular fora do escritório.

**Fonte.** `src/app/painel/[token]/page.tsx`; `PLANO.md` §5.1. **implementada**

### DEC-010 — Token errado responde 404

**Decisão.** Token incorreto devolve 404, não 401 nem uma tela de acesso negado.

**Motivo.** Qualquer resposta diferente de 404 confirmaria que a rota existe e que há
algo a ser adivinhado ali.

**Impacto.** A comparação usa `timingSafeEqual`, para o tempo de resposta também não
denunciar nada.

**Fonte.** `src/lib/token-painel.ts`, função `tokenPainelConfere` — extraída na F3.6
e usada tanto pela página quanto pela rota `/painel/[token]/dados`;
`src/app/painel/[token]/page.tsx`. **implementada**

### DEC-011 — Painel é `noindex`

**Decisão.** As rotas sob `/painel` enviam `X-Robots-Tag: noindex, nofollow,
noarchive` e a página declara `metadata.robots`.

**Motivo.** Se a URL secreta vazar em algum lugar, ela não deve virar resultado de
busca.

**Impacto.** Dupla camada — cabeçalho e metadata. Nenhuma das duas deve ser removida
sem substituir a outra.

**Fonte.** `next.config.ts`; `src/app/painel/[token]/page.tsx`. **implementada**

### DEC-012 — Dimensões estruturais relativas à viewport

**Decisão.** O layout do painel é dimensionado em unidades relativas à largura da
tela, não em pixels fixos.

**Motivo.** O mesmo código precisa servir à TV de 80" em 3840×2160 e ao monitor onde
o resultado é conferido, sem manter duas versões.

**Impacto.** Os tamanhos mínimos de leitura do plano (big numbers 220px, VGV 110px,
nomes 44px, rótulos 32px) são alvos **em pixels de uma viewport 4K real**, mas a
implementação continua expressa em `cqw`. Desde a F3.5 a **mesma** composição serve
`/preview` e `/painel/[token]`, então o dimensionamento relativo vale nas duas rotas.
A F4.1 eliminou as duas últimas dimensões fixas que restavam — as hairlines
decorativas, que saíram de `1px` para `0.05cqw`. A F4.3 comprovou num Chrome com
viewport efetiva **3840×2160**, `devicePixelRatio` 1 e `visualViewport.scale` 1, com
`.tv` medindo 3840×2160, que os quatro mínimos são atendidos **sem overflow**:

| Elemento | Medido no navegador | Mínimo |
|---|---|---|
| Big numbers | 220.032px | 220 |
| VGV por período | 110.208px | 110 |
| Nome do corretor | 44.16px | 44 |
| Valores das listas | 48px | 44 |
| Rótulos e legendas | 32.256px | 32 |

**Fonte.** `PLANO.md` §§5.1 e 6; `src/components/painel/painel.module.css`;
`src/components/painel/painel-visual.tsx`; protótipo `22bf943`; painel real
`8684f1d`; F4.1 `f49f912`; microajuste da F4.3 `16490f0`; evidência
visual/dimensional da F4.3 em 2026-08-14. **implementada**

### DEC-013 — Todo cálculo do painel converge para `src/lib/metricas.ts`

**Decisão.** Na F3, a regra de cálculo mora numa camada única, `src/lib/metricas.ts`.
Nenhum componente calcula por conta própria.

**Motivo.** Regra espalhada por componente diverge silenciosamente: dois lugares
somando "captação" de formas diferentes produzem dois números diferentes na mesma
tela.

**Impacto.** É a fronteira onde DEC-003, DEC-004, DEC-005 e DEC-014 são efetivamente
aplicadas.

**Fonte.** `PLANO.md` §8; `src/lib/metricas.ts`; commits `6cf0627` e `8ec6cbc`;
`src/lib/metricas-prisma.ts`, commit `9ec8439`; `src/lib/apresentacao-painel.ts`,
commit `a9fe849`.
**implementada** — o arquivo existe e concentra o cálculo, com duas entradas puras:
`calcularMetricasEmpresa` e `calcularMetricasEquipes`. A leitura dos dados e a
apresentação ficam **fora** dele, por desenho, e as três camadas hoje estão
materializadas: `metricas-prisma.ts` lê o banco e converte para os tipos de domínio, e
`apresentacao-painel.ts` formata e rotula o resultado. Nenhuma das duas soma, conta ou
agrega por conta própria — a regra continua num lugar só.

### DEC-014 — Zero real é diferente de ausência de lançamento

**Decisão.** A tela distingue "o corretor fez zero vendas neste mês" de "não há dado
para este recorte".

**Motivo.** Exibir ausência como zero transforma falha de carga ou de conexão em
informação falsa na parede do escritório.

**Impacto.** Vale também para a queda de rede prevista no plano: em falha, o painel
mantém o último valor conhecido em vez de zerar.

**Fonte.** `PLANO.md` §5.1; DEC-039; DEC-043; DEC-045; `src/lib/metricas.ts`;
`tests/metricas.test.ts`; commits `6cf0627` e `8ec6cbc`;
`src/lib/apresentacao-painel.ts`; `tests/apresentacao-painel.test.ts`; commit
`a9fe849`; `src/app/painel/[token]/page.tsx`, commit `8684f1d`;
`src/lib/retencao-painel.ts`; `src/components/painel/atualizador-painel.tsx`;
`tests/retencao-painel.test.ts`; commit `888f779`.
**implementada** — a distinção existe no núcleo: mês sem
nenhum lançamento devolve `SEM_DADOS` em vez de afirmar desempenho zero, e dentro de um
mês `OK` um corretor sem evento aparece com zero real (DEC-039). Ausência de saldo
histórico segue a mesma regra, como `SEM_SALDO_HISTORICO` com valor `null` (DEC-037).

A **representação** foi resolvida na F3.4 e desde a F3.5 chega à tela: o shape traduz
cada estado sem número em `—`, e `/painel/[token]` desenha isso de verdade. Zero real
continua saindo como zero. A mesma disciplina alcançou o dinheiro — um valor positivo
que a compactação levaria a zero sai como `R$ < 0,1 mi`, e não como `R$ 0,0 mi`
(DEC-043).

A outra metade chegou com a F3.6: em queda de leitura ou de conexão o painel **retém
o último valor conhecido** em vez de zerar. Falha posterior não substitui bloco `OK`
elegível por falso zero nem por ausência, e a retenção é **localizada**, bloco a
bloco, conforme a F3.6 — períodos e equipes só dentro da mesma competência mensal,
acumulados também através da virada (DEC-045). Zero real continua distinto de
ausência, e os estados sem número continuam representados como `—`.

---

## Administração

### DEC-015 — Área administrativa exige autenticação

**Decisão.** Tudo sob `/admin` exige sessão válida.

**Motivo.** É por ali que os dados entram e são corrigidos.

**Impacto.** Duas barreiras: o middleware `src/proxy.ts` e a leitura de sessão na
própria página, para a proteção não depender só do matcher.

**Fonte.** `src/proxy.ts`; `src/app/admin/page.tsx`. **implementada**

### DEC-016 — Um único administrador na primeira versão

**Decisão.** A v1 opera com um usuário. A tabela `usuarios` existe mesmo assim, com
`ativo` e relação com `lancamentos`.

**Motivo.** Adicionar um segundo acesso no futuro não deve exigir migração.

**Impacto.** Não há tela de gestão de usuários na v1. O registro inicial vem pelo
seed.

**Fonte.** `prisma/schema.prisma` (modelo `Usuario`); `PLANO.md` §3. **implementada**

### DEC-017 — Senha em bcrypt, com geração centralizada

**Decisão.** Senha guardada como hash bcrypt de custo 12. `src/lib/senha.ts` é o
único lugar que gera e confere hash.

**Motivo.** Custo e algoritmo iguais em todos os caminhos — aplicação, seed e script
de troca. Duplicar a lógica é como surgem hashes que o login não consegue conferir.

**Impacto.** Nenhum código novo deve chamar `bcrypt` diretamente; use
`gerarHashSenha()` e `conferirSenha()`.

**Fonte.** `src/lib/senha.ts`; `src/lib/auth.ts`. **implementada**

### DEC-018 — Sessão em JWT assinado, em cookie `httpOnly`

**Decisão.** Sessão é um JWT HS256 assinado com `AUTH_SECRET`, guardado em cookie
`httpOnly`, `sameSite=lax`, `secure` em produção, com validade de 7 dias.

**Motivo.** `httpOnly` tira o token do alcance de JavaScript. O JWT permite ao
middleware validar a sessão sem consultar o banco a cada requisição — por isso
`src/lib/sessao.ts` é livre de Prisma e de APIs de Node.

**Impacto.** Trocar `AUTH_SECRET` invalida imediatamente todas as sessões emitidas —
é o botão de revogação, já usado uma vez no saneamento pós-F1. Em contrapartida, não
há revogação individual de sessão.

**Fonte.** `src/lib/sessao.ts`; `src/lib/sessao-servidor.ts`. **implementada**

### DEC-019 — O seed não sobrescreve senha nem estado de usuário existente

**Decisão.** Se o e-mail do administrador já existe, o seed atualiza **apenas o nome**.
`senhaHash` e `ativo` são **preservados** — o seed não escreve nesses campos. Se o
e-mail não existe, a conta é criada normalmente, ativa pelo default do schema.

**Motivo.** O seed é operação de inicialização e reconciliação, e é reexecutável. Sua
repetição não pode desfazer decisão administrativa tomada depois dele. São duas, e cada
uma por sua razão:

- **senha** — sobrescrever devolveria o valor de `SEED_ADMIN_SENHA` por cima de uma
  troca feita pela DEC-020, silenciosamente;
- **`ativo`** — regravar `true` reativaria uma conta desativada de propósito.
  Desativar é hoje a forma de cortar acesso imediatamente, porque
  `exigirAdministradorAtivo()` relê `ativo` no banco a cada operação e o JWT emitido
  sobrevive ao logout até expirar. Um seed que reativa desfaz exatamente a resposta a
  incidente que existe hoje.

**Impacto.** Mudar `SEED_ADMIN_SENHA` e rodar o seed **não** troca a senha de ninguém —
é a razão de existir a DEC-020. Desativar a conta e rodar o seed **não** a reativa; a
reativação, se desejada, é ato administrativo explícito. O nome continua sendo
atualizável, que é o uso legítimo da reexecução.

**Estado operacional.** O deploy atual **não executa o seed**: o `preDeployCommand` do
Render é `npm run db:deploy`, e `build`, `start` e `postinstall` também não o chamam.
`npm run db:seed` é comando manual.

**Fonte.** `prisma/seed.ts`, função `semearAdministrador`;
`tests/integracao/seed-admin.integracao.test.ts`. **implementada**

### DEC-020 — Rotação de senha por script separado e explícito

**Decisão.** A troca de senha de um usuário existente é feita por
`scripts/trocar-senha-admin.ts` (`npm run db:trocar-senha-admin`), com entrada por
variáveis de ambiente — nunca por argumento de linha de comando.

**Motivo.** Argumento de linha de comando vaza no histórico do shell e na lista de
processos. E a operação precisa ser deliberada, não um efeito colateral do deploy.

**Impacto.** O script exige que o usuário exista, falha se não existir, **não é
upsert** e altera exclusivamente `senhaHash`. A senha nova usa variável própria
(`TROCA_SENHA_NOVA`) em vez de reaproveitar `SEED_ADMIN_SENHA`, para uma execução
distraída não reinstalar um valor antigo.

**Fonte.** `scripts/trocar-senha-admin.ts`, commit `c59be18`. **implementada**

### DEC-021 — Segredos nunca entram no Git

**Decisão.** Nenhum segredo real entra no Git. O repositório versiona apenas
`.env.example`, com placeholders.

**Motivo.** O repositório é público. Segredo commitado fica exposto no instante do
push e não some com um commit de remoção.

**Impacto.** Todo segredo é lido de `process.env`; nenhum valor real aparece em
arquivo versionado. No desenvolvimento local isso significa um `.env` ignorado pelo
Git. Em ambientes de deploy, as credenciais devem viver no mecanismo de
environment/secrets do provedor — nunca em arquivo do repositório. O `.env.example`
serve só para documentar os nomes das variáveis.

**Fonte.** `.gitignore` (regra `.env*` com exceção `!.env.example`); `.env.example`. **implementada**

---

## Escopo da v1

### DEC-022 — Metas ficam fora da v1

**Decisão.** A tabela `metas` está desenhada no plano mas não existe no banco.

**Motivo.** Nenhuma tela depende dela, então criar depois é migração aditiva, sem
mexer no que já estiver funcionando.

**Impacto.** Nada no schema nem na migração inicial cria `metas`. Barras de progresso
de meta são F5.

**Fonte.** `PLANO.md` §3; ausência confirmada em `prisma/schema.prisma` e na migração. **implementada**

### DEC-023 — Sem CRM e sem integração automática

**Decisão.** Não há integração automática com CRM nem com Google. Os dados entram
manualmente pela área administrativa, incluindo as avaliações Google.

**Motivo.** O volume comporta entrada manual, e integração exigiria contrato de dados
externo antes de o sistema existir.

**Impacto.** `AVALIACAO_GOOGLE` é um tipo de lançamento como qualquer outro, digitado
à mão.

**Fonte.** `PLANO.md` §1 e §3. **implementada**

### DEC-024 — Sem multi-tenant

**Decisão.** O sistema atende uma imobiliária. Não há noção de organização ou de
isolamento por cliente.

**Motivo.** Multi-tenant contamina todo o modelo de dados e toda consulta; não há
demanda para isso.

**Impacto.** Nenhuma tabela tem coluna de tenant.

**Fonte.** `prisma/schema.prisma`; `PLANO.md` §1. **implementada**

### DEC-025 — Sem múltiplos usuários na v1

**Decisão.** Um acesso administrativo, sem papéis nem permissões.

**Motivo.** Um operador só; papéis seriam complexidade sem uso.

**Impacto.** Ver DEC-016. Não há tela de convite, de papéis nem de permissão.

**Fonte.** `PLANO.md` §3. **implementada**

### DEC-026 — Sem notificações

**Decisão.** Não há e-mail, push nem alerta de qualquer espécie.

**Motivo.** O produto é uma tela na parede; quem precisa do dado está olhando para
ele.

**Impacto.** Nenhuma dependência de serviço de envio. Inclui a recuperação de senha:
não existe "esqueci minha senha" por e-mail — a troca é pela DEC-020.

**Fonte.** `PLANO.md` §5; ausência de dependência de envio em `package.json`. **implementada**

---

## Sequenciamento

### DEC-027 — O protótipo visual é portado, não redesenhado

**Decisão.** Existe um HTML de referência produzido fora do repositório, em uma
sessão do Claude.ai. A implementação visual parte dele.

**Motivo.** O HTML carrega decisões de layout já tomadas e aprovadas. Redesenhar do
zero as descartaria e produziria uma terceira versão do mesmo painel.

**Impacto.** O HTML foi auditado regra a regra antes da implementação — cores, grid,
paddings, tracking, réguas, marcadores e temporização — e o desenho foi portado, não
recriado. O port está feito: `/preview` existe. As divergências deliberadas em
relação ao original estão registradas no handoff. O HTML segue fora do repositório,
como referência de consulta.

**Fonte.** HTML de referência auditado (SHA-256
`9b6b875093b3f4940c698d7bf9af9905835fe9841d847350ff096d53b9d5bd10`);
`src/app/preview/page.tsx`; commit `22bf943`. **implementada**

### DEC-028 — F2 precede F3

**Decisão.** A administração vem antes do painel.

**Motivo.** Sem CRUD não há como alimentar o sistema de verdade, e o painel ficaria
sendo validado contra dados inventados.

**Impacto.** Ao fim da F2 é possível operar o sistema mesmo sem painel pronto — e é
exatamente onde o projeto está: equipes, corretores, lançamentos e saldo histórico
podem ser alimentados, com o painel ainda desligado do banco.

**Fonte.** `PLANO.md` §9; commits `bee7df7` a `485ba36`. **cumprida**

### DEC-029 — F3 depende da F2 e do protótipo

**Decisão.** O painel real só começa com a administração funcionando e o protótipo
portado.

**Motivo.** A F3 junta duas coisas que precisam já existir: dados reais e o layout
aprovado.

**Impacto.** O port do protótipo pode usar dados fictícios; o painel de F3, não. As
duas pré-condições foram satisfeitas — administração pronta e protótipo portado — e a
F3 começou sobre elas. Cálculo, leitura, apresentação e atualização automática
existem e estão ligados à rota da TV.

**Fonte.** `PLANO.md` §9; commits `22bf943` e `485ba36`.
**cumprida** — pré-condições atendidas e a F3 correu na ordem prevista: F3.0 a F3.6
concluídas, e a Fase 3 está concluída

### DEC-030 — F4 depende da F3

**Decisão.** Identidade final e modo TV entram depois do painel funcionando.

**Motivo.** Ajuste fino de tipografia, escala 4K e transições precisa de uma tela real
para ser ajustado.

**Impacto.** A ordem foi respeitada: a **F3 encerrou antes de a F4 começar**, e as
fatias F4.0 a F4.4 foram executadas sobre o painel real já ligado aos dados. Os tokens
de cor existiam desde a F1; o restante da identidade — tipografia, escala, transições
e comportamento offline — veio depois, com a tela funcionando para ajustar contra. A
**F4.5 permanece como última fatia da fase**.

**Fonte.** `PLANO.md` §9; `src/app/globals.css`; F3 encerrada em `de91dce`; fatias da
F4 de `f49f912` a `8b9fce2`. **cumprida**

---

## Decisões de stack que valem lembrar

### DEC-031 — Prisma 7: URLs fora do `schema.prisma`

**Decisão.** Migrações e introspecção leem `datasource.url` do `prisma.config.ts`
(`DIRECT_URL`); a aplicação em runtime conecta pelo driver adapter em `src/lib/db.ts`
(`DATABASE_URL`, pooler).

**Motivo.** É como o Prisma 7 funciona, e o pooler em modo transaction derruba os
advisory locks que o schema engine usa nas migrações.

**Impacto.** São duas URLs, com papéis distintos, e trocá-las de lugar quebra as
migrações de um jeito difícil de diagnosticar. O cliente gerado fica em
`src/generated/prisma`, fora do Git, recriado pelo `postinstall`.

**Fonte.** `prisma.config.ts`; `src/lib/db.ts`; `prisma/schema.prisma`. **implementada**

### DEC-032 — O middleware se chama `proxy`

**Decisão.** O middleware da aplicação é `src/proxy.ts`.

**Motivo.** O Next 16 renomeou a convenção; `middleware.ts` não é mais o nome do
arquivo.

**Impacto.** Procurar por `middleware.ts` não encontra nada. A proteção de `/admin`
mora em `src/proxy.ts`.

**Fonte.** `src/proxy.ts`. **implementada**

### DEC-033 — O ciclo dos quadros usa oito métricas

**Decisão.** Os quadros das três equipes percorrem **oito** métricas, na ordem do
protótipo: vendidos, VGV, locados, captação de venda, exclusividades, captação de
locação, propostas e avaliações Google. Cada etapa dura 20 segundos, o que dá uma
volta completa de 160 s — 2min40s. As três equipes compartilham o mesmo índice
ativo e trocam em sincronia.

**Motivo.** O `PLANO.md` §5.2 diz "Ciclo de 7 métricas × 20 segundos = 2min20s",
mas a frase seguinte enumera oito. O HTML de referência e o port usam oito. A
contagem de sete é o erro; a enumeração é que está certa.

**Impacto.** A F3 preserva esse comportamento, salvo decisão posterior explícita.
Não confundir com o cálculo real: a rotação é apresentação, e a origem dos valores
continua sendo responsabilidade da DEC-013. O quadro "mensal geral" segue com sete
linhas — ali o VGV não entra, porque tem faixa própria.

**Fonte.** HTML de referência auditado; `src/lib/mock-painel.ts`;
`src/components/painel/quadros-equipe.tsx`; commit `22bf943`;
`src/lib/apresentacao-painel.ts`, commit `a9fe849`.
**implementada no protótipo e no shape de apresentação** — desde a F3.4 a ordem das
oito métricas tem uma fonte só: `METRICAS_PAINEL` é derivada de `CHAVES_RANKING`, do
núcleo, e o mock passou a consumi-la em vez de repetir a lista. A F3.4 **não** criou
segunda ordem paralela — uma cópia divergente faria a TV mostrar o rótulo de uma
métrica sobre os números de outra. Os 20 segundos por métrica e a volta de 160 s
continuam como estavam.

### DEC-034 — Editar um lançamento não recalcula a equipe histórica

**Decisão.** Ao editar um lançamento, a equipe gravada nele só muda por decisão
explícita do operador, e apenas entre duas opções:

- **corretor inalterado** — a equipe armazenada é preservada literalmente,
  qualquer que seja a equipe atual dele hoje;
- **corretor trocado, equipe atual igual à armazenada** — preserva, sem perguntar;
- **corretor trocado, equipes diferentes** — o sistema pergunta: *preservar* a
  equipe registrada ou *corrigir* para a equipe atual do novo corretor.

Não existe terceira equipe escolhível, e nenhum campo de equipe é enviado pelo
formulário.

**Motivo.** O sistema não guarda o histórico de qual corretor esteve em qual equipe
em cada data. Logo, a equipe atual de um corretor **não prova** qual era a equipe
verdadeira na data do evento. Recalcular sozinho seria adivinhar, e adivinhar move
crédito de produção entre equipes.

**Impacto.** Corrigir um valor, uma data ou uma observação nunca reescreve crédito
de equipe. A equipe resultante sai sempre da função pura sobre o que o banco diz no
momento do submit; o campo escondido que acompanha a escolha serve só para detectar
que a situação mudou desde a pergunta — se mudou, a resposta antiga é recusada e o
conflito é reapresentado com os dados atuais.

**Fonte.** Q7, aprovada pelo proprietário em 2026-08-12 (Recomendação C);
`src/lib/lancamento-equipe.ts`; `src/app/admin/lancamentos/acoes.ts`;
`tests/lancamento-equipe.test.ts`;
`tests/integracao/lancamentos-edicao.integracao.test.ts`; commit `caa151f`.
**implementada**

### DEC-035 — Saldo histórico só existe para vendas e avaliações, uma linha por tipo

**Decisão.** `saldo_historico` é o saldo de **abertura** dos big numbers. Na v1 ele
existe apenas para `VENDA` e `AVALIACAO_GOOGLE`, com no máximo **uma linha por
tipo**, garantida por índice único no banco.

- `VENDA` — quantidade > 0 e `valorTotal` > 0;
- `AVALIACAO_GOOGLE` — quantidade > 0 e `valorTotal` sempre `0.00`;
- `dataCorte` obrigatória, como data civil;
- o tipo de um saldo cadastrado **não muda**.

**Motivo.** Os outros cinco tipos do enum não têm acumulado anterior a registrar
nesta versão. A unicidade vive no banco porque conferir antes de inserir abriria
corrida entre o `SELECT` e o `INSERT`. Avaliação é contagem, não dinheiro — guardar
valor ali convidaria a somá-lo depois.

**Impacto administrativo.** A área administrativa cria, edita e remove o saldo.
Ausência é diferente de zero: um tipo sem linha aparece como "Não cadastrado", nunca
como `0`, e nenhuma linha zerada é criada automaticamente. A exclusão existe
justamente por isso — sem ela, um saldo criado por engano só poderia ser zerado, o
que afirmaria um acumulado que ninguém apurou.

**Impacto no cálculo.** Como o saldo entra nos acumulados e nunca em
recortes de período, isso é responsabilidade da F3 (ver DEC-004). Nada na F2 soma
saldo com lançamento.

**Fonte.** Q8, aprovada pelo proprietário em 2026-08-12; `prisma/schema.prisma`;
`prisma/migrations/20260812120000_saldo_historico_tipo_unico/`;
`src/lib/validacao/saldo-historico.ts`; commit `485ba36`. O uso nos acumulados está em
`src/lib/metricas.ts`, commit `6cf0627`, e a leitura em `src/lib/metricas-prisma.ts`,
commit `9ec8439`.
**implementada na administração, no cálculo, na leitura e no shape** — a fronteira da
F3.3 lê `saldo_historico` restringindo o `where` a `VENDA` e `AVALIACAO_GOOGLE`, os dois
únicos tipos com saldo de abertura na v1, e o shape da F3.4 já formata os acumulados
que saem dali. Desde a F3.5 a rota da TV os desenha.

---

## Painel — decisões da F3.0

Aprovadas pelo proprietário em 2026-08-12, antes de qualquer código de F3. Elas
restringiram como a camada de cálculo viria a ser construída nas fatias seguintes.

### DEC-036 — `dataCorte` é inclusivo, e o acumulado soma só o que veio depois

**Decisão.** Cada linha de `saldo_historico` é a fonte autoritativa do acumulado
daquele tipo **até o seu próprio `dataCorte`, inclusive**. Portanto:

```
acumulado(tipo) = saldo(tipo) + lançamentos(tipo) com dataReferencia > dataCorte(tipo)
```

- `dataReferencia <= dataCorte` — aquela faixa **já está representada** pelo saldo;
- `dataReferencia > dataCorte` — entra individualmente no acumulado.

Cada tipo usa o `dataCorte` da **sua própria** linha. O saldo `VENDA` alimenta dois
números — quantidade de imóveis vendidos e VGV acumulado — ambos com o corte da linha
`VENDA`. O saldo `AVALIACAO_GOOGLE` alimenta a contagem de avaliações, com o corte
dele.

**Motivo.** Somar saldo com *todos* os lançamentos contaria duas vezes a produção do
período que o saldo já resume. O `dataCorte` existe justamente para marcar onde o
resumo termina e os eventos individuais começam.

**Impacto.** Supera a fórmula antiga do `PLANO.md` §4 ("saldo + todos os lançamentos,
sem recorte"), corrigida no próprio plano. **Não** supera a DEC-004: saldo continua
entrando somente em acumulados. Esta decisão define *como* ele entra.

Um lançamento anterior ao corte **continua existindo e continua válido** — pode
inclusive aparecer num recorte por período. Ele apenas não é somado de novo no
acumulado. Nada disso vira validação cruzada entre lançamento e saldo, nem proibição
de lançamento retroativo, nem "data de início da operação".

**Fonte.** Q-F3, aprovada em 2026-08-12; `PLANO.md` §4; `src/lib/metricas.ts`;
`tests/metricas.test.ts`; commit `6cf0627`.
**implementada no núcleo de cálculo** — a regra real é o filtro
`lancamento.dataReferencia > dataCorte`, com o corte de cada tipo vindo da própria
linha de saldo. Coberta por testes de evento antes do corte, exatamente no corte e
depois dele.

### DEC-037 — Sem saldo histórico, o acumulado é indisponível, não zero

**Decisão.** Se não existir linha de `saldo_historico` para o tipo, o big number
correspondente é **indisponível** (`—`), nunca zero e nunca "só os lançamentos".

- sem saldo `VENDA` → imóveis vendidos acumulados **e** VGV acumulado indisponíveis;
- sem saldo `AVALIACAO_GOOGLE` → avaliações acumuladas indisponíveis.

**Motivo.** Mostrar apenas os lançamentos sob o rótulo de acumulado produziria um
número plausível e errado — parcial, sem nada na tela indicando que é parcial. É pior
do que não mostrar.

**Impacto.** Vale **somente** para os big numbers acumulados. Os recortes por período
não dependem de saldo e seguem normalmente. É a aplicação da DEC-014 a este caso, e o
mesmo princípio que a administração já usa ao exibir "Não cadastrado" em vez de `0`.

**Fonte.** Q-F3, aprovada em 2026-08-12; DEC-014; DEC-035; `src/lib/metricas.ts`;
commit `6cf0627`; `src/lib/apresentacao-painel.ts`, commit `a9fe849`.
**implementada no núcleo de cálculo e no shape de apresentação** — sem saldo do tipo, o
acumulado sai do núcleo como `SEM_SALDO_HISTORICO` com valor `null`, e desde a F3.4 o
shape o traduz em `—`, sem prefixo de moeda. Faltar o saldo de um tipo não contamina o
outro: o big number correspondente é o único que perde o número. Desde a F3.5 a página
desenha isso na rota real.

### DEC-038 — Corretor transferido aparece nos dois quadros, sem duplicar produção

**Decisão.** O crédito de um evento é sempre `Lancamento.equipeId`, nunca
`Corretor.equipeId` atual (DEC-002). O elenco mensal de uma equipe ativa é a união
de:

- **A** — corretores **ativos** atualmente lotados naquela equipe;
- **B** — corretores **ativos** com pelo menos um lançamento do mês creditado
  historicamente àquela equipe.

**Consequência deliberada.** Um corretor transferido no meio do mês pode aparecer em
**dois** quadros: na equipe A com a produção cujo `equipeId` é A, e na equipe B com a
produção cujo `equipeId` é B.

Isso **não é duplicação de produção**: nenhum evento é contado duas vezes. É a mesma
pessoa aparecendo em dois contextos históricos distintos.

**Corretor inativo** não aparece como linha em ranking nenhum, mas seus eventos
continuam contando nos totais da empresa e continuam pertencendo à equipe gravada.

**Motivo.** A alternativa seria reescrever ou esconder histórico para deixar a TV
visualmente mais simples, e isso falsearia o desempenho das duas equipes.

**Fonte.** Q-F3, aprovada em 2026-08-12; DEC-002; DEC-006; `src/lib/metricas.ts`;
`tests/metricas.test.ts`; commit `8ec6cbc`.
**implementada no núcleo de cálculo** — elenco mensal como união, crédito por
`Lancamento.equipeId`, transferido presente nos dois quadros sem duplicar evento, e
inativo fora dos rankings mas ainda contando nos totais da empresa.

### DEC-039 — Mês sem nenhum lançamento não afirma desempenho zero

**Decisão.** Regra conservadora de apresentação para o mês corrente:

- **nenhum** lançamento no mês → a janela mensal fica em `SEM_DADOS`; o quadro mensal
  e os rankings **não afirmam** desempenho zero, e a apresentação usará `—`;
- **pelo menos um** lançamento no mês → a janela fica `OK`. Dentro de uma janela `OK`,
  uma métrica sem lançamento é **zero real** e exibível, e um corretor ativo sem evento
  naquela métrica também aparece com zero real.

**Isto não é inferência estatística.** Não se afirma que zero lançamentos indica
ausência "com alta certeza": é uma regra conservadora de apresentação — sem nenhum
lançamento no mês, não se afirma zero.

**Limitação conhecida e aceita.** O sistema **não distingue alimentação parcial**. Se
há propostas cadastradas mas nenhuma avaliação, isso tanto pode ser zero avaliações
reais quanto avaliações ainda não lançadas. O schema não tem "mês fechado", "dados
conferidos" nem status de preenchimento, e essa informação **não será inventada**.
Resolver isso exigiria modelagem operacional nova, fora da F3 atual e da v1.

**Fonte.** Q-F3, aprovada em 2026-08-12; DEC-014; `src/lib/metricas.ts`; commits
`6cf0627` e `8ec6cbc`; `src/lib/apresentacao-painel.ts`, commit `a9fe849`;
`src/app/painel/[token]/page.tsx` e `src/components/painel/painel-visual.tsx`, commit
`8684f1d`.
**implementada do núcleo ao painel real** — `EstadoPeriodo` existe, mês sem nenhum
lançamento devolve `SEM_DADOS`, e dentro de um mês `OK` os zeros são reais. O shape
traduz `SEM_DADOS` mensal em `—` nos três lugares que dependem do mês, e desde a F3.5 a
TV desenha isso: VGV mensal em `—`, as sete linhas do quadro mensal em `—` e todos os
valores dos rankings em `—`, **com o elenco das equipes preservado** — quem produziu é
conhecido mesmo sem produção a exibir, e esconder os quadros apagaria dado verdadeiro.
VGV trimestral e anual continuam com valor real: são janelas próprias, e um mês vazio
não diz nada sobre elas. Num mês `OK`, zero segue sendo zero exibível.

Na F3.6, `SEM_DADOS` atravessa a atualização automática como **dado válido**: não é
confundido com falha de leitura e, chegando dentro de uma leitura válida,
**substitui** o estado anterior em vez de ser retido contra (DEC-045).

### DEC-040 — O painel v1 exige exatamente três equipes ativas

**Decisão.** O desenho do painel tem quatro colunas fixas: quadro mensal geral mais
três quadros de equipe. A v1 exige, portanto, **exatamente três equipes ativas**.

Se `equipesAtivas.length !== 3`, a área dos quadros de equipe entra em
`CONFIGURACAO_INVALIDA`. É proibido: escolher as três primeiras, descartar equipe
silenciosamente, redistribuir o grid por conta própria ou tratar a diferença como
produção zero.

Os números que não dependem da cardinalidade visual — big numbers e VGV por período —
continuam sendo exibidos, desde que suas leituras sejam válidas.

**Motivo.** Qualquer acomodação automática mentiria: ou esconderia uma equipe, ou
inventaria um layout que ninguém aprovou.

**Impacto.** A F3.2 não altera CSS. A validação existe no núcleo; o comportamento
visual de `CONFIGURACAO_INVALIDA` fica para a apresentação do painel real.

**Fonte.** Q-F3, aprovada em 2026-08-12; `src/components/painel/painel.module.css`;
`src/lib/metricas.ts`; commit `8ec6cbc`; `src/lib/metricas-prisma.ts` e
`tests/integracao-painel/painel.integracao.test.ts`, commit `9ec8439`;
`src/lib/apresentacao-painel.ts`, commit `a9fe849`;
`src/components/painel/decidir-area-equipes.ts`,
`src/components/painel/painel-visual.tsx` e
`src/components/painel/painel.module.css`, commit `8684f1d`.
**implementada do núcleo ao painel real** — `EstadoEquipes` existe, e com número de
equipes ativas diferente de três o resultado vem `CONFIGURACAO_INVALIDA` com a lista de
equipes **vazia**, o que impede renderizar subconjunto. A F3.3 provou contra o banco
real que uma quarta equipe ativa derruba apenas a área de equipes: os números da
empresa continuam sendo entregues.

Na F3.4 o estado ganhou representação discriminada no shape — `{ estado:
"CONFIGURACAO_INVALIDA" }`, **sem** a propriedade `equipes`, de modo que não há lista a
renderizar por engano. Ele tem **precedência sobre `SEM_DADOS`**: com a lista vazia,
anunciar "mês sem dados" descreveria o problema errado, que é de cadastro e não de
produção.

Na F3.5 isso chegou à tela. Nesse estado a rota **não** chama `QuadrosEquipe` e
renderiza "Configuração de equipes inválida"; o estado irmão, `INDISPONIVEL`, renderiza
"Dados das equipes indisponíveis". Em ambos a área ocupa as três colunas reservadas às
equipes, sem lista vazia e sem equipe fictícia, e o quadro "Mensal geral" continua na
primeira coluna com os números da empresa que seguem válidos.

Na F3.6, `CONFIGURACAO_INVALIDA` segue sendo estado de domínio válido também na
atualização automática: uma leitura válida com esse estado **substitui** as equipes
anteriores na tela — ele não é alvo da retenção, que guarda apenas contra falha de
leitura (DEC-045).

### DEC-041 — A camada de métricas recebe o cliente Prisma por parâmetro

**Decisão.** A leitura de métricas aceita explicitamente um `PrismaClient`:

```
obterMetricasPainel(prisma, agora?)
```

e **não** importa o singleton de `src/lib/db.ts` por dentro.

**Motivo.** `src/lib/db.ts` lê `DATABASE_URL` do ambiente da aplicação — a de
produção. Os testes de integração têm um cliente próprio, criado por
`tests/helpers/banco-teste.ts`, que só conecta depois de exigir protocolo PostgreSQL,
host local, database `casalouzada_test` e role `casalouzada_test`. Com injeção
explícita, a integração exercita **a mesma camada**, passando `criarPrismaTeste()`.

**Impacto.** Não se cria DAL genérica nem interface abstrata de banco. Passar o
cliente por parâmetro é suficiente.

**Fonte.** Q-F3, aprovada em 2026-08-12; `src/lib/db.ts`;
`tests/helpers/banco-teste.ts`; `src/lib/metricas-prisma.ts`;
`tests/metricas-prisma.test.ts`; `tests/integracao-painel/painel.integracao.test.ts`;
commit `9ec8439`.
**implementada** — `obterMetricasPainel(prisma, agora?)` existe em
`src/lib/metricas-prisma.ts`, com o cliente entrando por parâmetro; o módulo não
importa `src/lib/db.ts` nem o singleton `prisma`. A suíte de integração passa
`criarPrismaTeste()` para a mesma função que a aplicação usa, e nenhuma DAL ou
interface abstrata de banco foi criada. Desde a F3.5 (`8684f1d`) a aplicação real
fecha o par: `/painel/[token]` importa o cliente de `src/lib/db.ts` e o injeta na
chamada — `obterMetricasPainel(prisma, agora)` —, de modo que rota e teste exercitam a
mesma função com clientes diferentes.

A F3.6 manteve a disciplina: `lerPainel(prisma, agora)`, em
`src/lib/leitura-painel.ts`, também recebe o `PrismaClient` por parâmetro, e tanto a
página quanto a rota `/painel/[token]/dados` injetam explicitamente o cliente de
`src/lib/db.ts`. Nenhuma DAL paralela foi criada.

### DEC-042 — Os estados do painel são dimensões separadas, não um enum único

**Decisão.** Não existe um `EstadoJanela` global juntando `OK`, `SEM_DADOS`,
`INDISPONIVEL` e `SEM_SALDO_HISTORICO`: são perguntas diferentes sobre coisas
diferentes. As dimensões são quatro:

| Dimensão | Valores |
|---|---|
| Estado de leitura | `OK`, `INDISPONIVEL` |
| Estado de período | `OK`, `SEM_DADOS` |
| Estado de acumulado | `OK`, `SEM_SALDO_HISTORICO` |
| Estado da área de equipes | `OK`, `CONFIGURACAO_INVALIDA` |

**Propagação.** Cada estado afeta só o que lhe diz respeito:

- `INDISPONIVEL` — falha de leitura ou de banco. **Nunca** vira zero.
- `SEM_SALDO_HISTORICO` — afeta apenas o big number do tipo sem saldo. Faltar o saldo
  de `VENDA` não invalida avaliações se o saldo de avaliações existe.
- `SEM_DADOS` mensal — afeta a janela mensal: quadro mensal e rankings. **Não**
  transforma big numbers em `SEM_DADOS`.
- `CONFIGURACAO_INVALIDA` — afeta a área de equipes. **Não** apaga big numbers, VGV
  por período nem o quadro mensal geral, se esses puderem ser calculados corretamente.

**Motivo.** Um enum único obrigaria a escolher um estado por tela e faria uma falha
localizada apagar dado correto.

**Impacto.** Os nomes acima são semânticos, não assinaturas TypeScript congeladas. A
separação conceitual, essa sim, é obrigatória.

**Fonte.** Q-F3, aprovada em 2026-08-12; `src/lib/metricas.ts`; commits `6cf0627` e
`8ec6cbc`; `src/lib/metricas-prisma.ts`, commit `9ec8439`;
`src/lib/apresentacao-painel.ts`, commit `a9fe849`; `src/app/painel/[token]/page.tsx`,
`src/components/painel/painel-visual.tsx` e
`src/components/painel/decidir-area-equipes.ts`, commit `8684f1d`.
**implementada do cálculo até a rota real** — as
quatro dimensões existem como tipos separados. Três no núcleo: `EstadoPeriodo` (`OK` /
`SEM_DADOS`), `EstadoAcumulado` (`OK` / `SEM_SALDO_HISTORICO`) e `EstadoEquipes` (`OK` /
`CONFIGURACAO_INVALIDA`). A quarta, `EstadoLeitura` (`OK` / `INDISPONIVEL`), passou a
existir na F3.3, na fronteira — que é onde ela faz sentido.

A propagação localizada também está materializada: o resultado da leitura tem três
blocos com dependências próprias — `empresa.periodos` (lançamentos),
`empresa.acumulados` (lançamentos e saldo histórico) e `equipes` (lançamentos,
corretores e equipes). Falhar o saldo histórico **não** apaga o VGV por período nem o
quadro mensal; falhar corretores ou equipes **não** apaga os números da empresa; só
falhar lançamentos derruba os três, porque os três dependem deles. No ramo
`INDISPONIVEL` não existe a propriedade `dados`, então nenhuma falha de leitura chega
adiante parecendo zero.

Desde a F3.4 as quatro dimensões atravessam a terceira camada, e desde a F3.5 chegam à
**rota real**. Na tela: `INDISPONIVEL` de big number ou de VGV chega como `—`;
`SEM_DADOS` mensal chega como `—` no VGV mensal, no quadro mensal e nos rankings;
`SEM_SALDO_HISTORICO` chega como `—` no big number do tipo sem saldo; e
`CONFIGURACAO_INVALIDA` tem tratamento próprio da área de equipes, com título em vez de
quadros. O `—` sai sempre sem prefixo de moeda.

**Nenhuma delas colapsa em zero**, e cada bloco só admite os estados que podem
alcançá-lo: um big number nunca fica `SEM_DADOS`, e o VGV por período nunca fica
`SEM_SALDO_HISTORICO`.

Desde a F3.6 a independência dos blocos atravessa também a **retenção**: `periodos`,
`acumulados` e `equipes` são retidos separadamente, e uma falha de leitura localizada
não apaga bloco correto independente — nem na leitura, nem na atualização. A
distinção de camadas ficou explícita: `INDISPONIVEL` é falha de leitura
**localizada**, que chega dentro de uma resposta válida e é tratada bloco a bloco;
falha de transporte, HTTP, parse ou contrato é falha da **atualização inteira**, e
nesse caso o estado anterior permanece completo (DEC-045, DEC-046).

---

## Painel — decisões da F3.4

### DEC-043 — Dinheiro compacto da TV preserva precisão e não colapsa positivo em zero

**Decisão.** O dinheiro exibido no painel é compactado por uma política única, na
camada de apresentação:

1. a entrada é sempre **string decimal canônica** (`"1250000.00"`), como o resto do
   caminho monetário do projeto;
2. o valor **não passa** por `Number`, `parseFloat`, `parseInt` nem qualquer aritmética
   de ponto flutuante — vira centavos em `bigint` e sai como texto;
3. **magnitude inicial**: abaixo de 1 bilhão usa `mi`; a partir de 1 bilhão usa `bi`.
   Valores abaixo de um milhão continuam em `mi` (`R$ 0,9 mi`). Depois do
   arredondamento a magnitude é reavaliada, podendo haver promoção para a faixa
   seguinte;
4. **precisão**: abaixo de 100 na unidade escolhida, uma casa decimal; de 100 para
   cima, nenhuma — `R$ 42,5 mi` e `R$ 431 mi`;
5. **arredondamento** meio-para-cima, exato, feito só com `bigint`;
6. depois de arredondar, a **magnitude é reavaliada**, porque o arredondamento pode
   empurrar o número para a faixa seguinte: `99,95 mi` → `R$ 100 mi` e `999,5 mi` →
   `R$ 1,0 bi`;
7. **zero exato** é `R$ 0,0 mi`;
8. um valor **positivo** que a compactação levaria a zero sai como `R$ < 0,1 mi`, e
   **nunca** como `R$ 0,0 mi`.

**Motivo.** Os dois últimos itens são o ponto. A validação aceita qualquer lançamento
com valor maior que zero, e não existe piso: uma venda real de R$ 1.000 arredondaria
para `0,0 mi` e ficaria, na parede do escritório, visualmente idêntica a "não vendeu
nada". São fatos diferentes, e a tela não pode confundi-los — é a mesma disciplina da
DEC-014 aplicada à resolução da escala.

O corte não é limiar escolhido à mão: `R$ 50.000` é exatamente onde o arredondamento
meio-para-cima em `mi` com uma casa deixa de produzir zero. A regra sai da própria
aritmética, e não de uma constante mágica que precisaria ser mantida em sincronia.

**Impacto.** Isto é **política de apresentação**, não regra de cálculo nem meta: o
valor somado continua exato em centavos, e nada aqui altera o que a F3.2 calcula ou a
F3.3 lê. `formatarDinheiroComposto` e `formatarDinheiroTexto` derivam do mesmo
algoritmo privado — não há dois caminhos que possam divergir. Ausência continua sendo
`—` sem moeda, e não se confunde com `< 0,1`: uma é falta de dado, a outra é um número
real pequeno demais para a escala.

**Fonte.** `src/lib/apresentacao-painel.ts`; `tests/apresentacao-painel.test.ts`;
commit `a9fe849`; `src/app/painel/[token]/page.tsx`, commit `8684f1d`.
**implementada no shape de apresentação e consumida pela rota real** — a política não
mudou na F3.5; o que mudou é que `/painel/[token]` passou a desenhar o shape que a
implementa, então os valores compactos chegam à parede do escritório. A F3.6 também
não alterou nenhuma regra monetária: o dinheiro que atravessa o contrato de
atualização já chega formatado por esta política.

---

## Painel — decisões da F3.6

### DEC-044 — Atualização automática usa Route Handler e fetch periódico

**Decisão.** A atualização do painel é feita pelo cliente contra uma Route Handler
dedicada:

- `GET /painel/[token]/dados` devolve a leitura completa em JSON;
- um Client Component (`AtualizadorPainel`) faz o `fetch`;
- intervalo de 60 segundos; timeout de 15 segundos (`AbortSignal.timeout`);
- `visibilitychange` provoca uma tentativa imediata quando a aba volta a ficar
  visível;
- `cache: "no-store"` na requisição e `Cache-Control: no-store` na resposta;
- no máximo **uma** request em voo;
- o token permanece no path — lido por `useParams`, nunca passado por prop — e é
  validado **antes** de qualquer toque no banco, com 404 para token inválido.

**Motivo.** A política de retenção precisa **observar** o resultado de cada
atualização — sucesso, falha de transporte, timeout, HTTP não-200, payload
inválido — para decidir o que entra na tela. `router.refresh()` não foi usado porque
sua API não fornece ao controlador um resultado/promise de sucesso ou falha por
atualização para alimentar essa política. Server Action não foi usada como transporte
de leitura.

**Impacto.** A leitura inicial continua no servidor; o refresh é responsabilidade
exclusiva do cliente. Sem WebSocket, SSE, Service Worker ou storage — a F3.6 não
abre nenhuma dessas frentes.

**Fonte.** `src/app/painel/[token]/dados/route.ts`;
`src/components/painel/atualizador-painel.tsx`; `src/lib/token-painel.ts`;
`tests/rota-dados-painel.test.ts`; commit `888f779`. **implementada**

### DEC-045 — Último valor conhecido é retido por bloco

**Decisão.** A retenção opera sobre os blocos da leitura separadamente — `periodos`,
`acumulados` e `equipes` na F3.6, mais `propostas` e `reservas` desde a E4:

- `periodos` e `equipes` só retêm o valor anterior **dentro da mesma competência
  mensal**; na virada de mês, a indisponibilidade nova é aceita como
  indisponibilidade;
- `acumulados` podem atravessar a virada de mês, porque não têm recorte mensal
  (DEC-036);
- `propostas` e `reservas` também atravessam a virada, pelo mesmo motivo: elas
  descrevem o que está **em aberto agora**, não a produção de um mês (E4, DEC-056). Uma
  leitura `OK` com lista **vazia** substitui normalmente — vazio ali significa "não há
  nada em aberto", e reter as anteriores deixaria na parede itens que já saíram;
- leitura `OK` **sempre substitui** o que estava na tela;
- estados de domínio (`SEM_DADOS`, `SEM_SALDO_HISTORICO`, `CONFIGURACAO_INVALIDA`)
  são dados válidos e **sempre passam** — não são alvo de retenção;
- ausência anterior não é patrimônio: só bloco `OK` é retido;
- o último valor conhecido vive **somente na memória da aba** — sem `localStorage`,
  `sessionStorage` ou cache persistente.

Falha completa da atualização — transporte, HTTP, parse de JSON ou payload fora do
contrato — mantém o estado anterior **inteiro**.

**Motivo.** Preservar dado bom sem esconder mudanças reais de mês ou de cadastro. Um
VGV de agosto sob o rótulo "setembro" seria um número verdadeiro debaixo de uma
legenda falsa; um acumulado desde sempre continua descrevendo a mesma coisa depois da
virada.

**Impacto.** O selo discreto `atualizado HH:MM` usa a hora do bloco `OK` mais antigo
ainda exibido; sem nenhum bloco `OK`, não há selo. Desde a E4 ele considera os **cinco**
blocos: a rotação põe as listas na parede tanto quanto os big numbers, e um selo que as
ignorasse dataria só metade do que se vê. Recarregar a página durante uma
indisponibilidade perde a retenção em memória — offline persistente é F4, não defeito
da F3.6.

**Fonte.** `src/lib/retencao-painel.ts`; `tests/retencao-painel.test.ts`; commit
`888f779`, estendida em `c24a0c9`. **implementada**

### DEC-046 — Payload de atualização é validado em runtime antes da retenção

**Decisão.** `LeituraPainel` é um contrato JSON explícito entre o servidor e o
cliente, e `ehLeituraPainel` o valida manualmente em runtime, sem Zod nem dependência
nova:

- estrutura e tipos de cada campo;
- dimensões exatas — 8 métricas de chave única, 3 VGV, 3 big numbers, 7 linhas do
  quadro mensal, 3 equipes nos estados que carregam quadros;
- rankings presentes para cada métrica do ciclo;
- coerência entre `estadoLeitura` e o conteúdo apresentado.

Payload recusado **não entra no reducer** e não altera a tela: o estado anterior sai
intacto, por referência.

**Motivo.** TypeScript não valida JSON recebido da rede. Um payload malformado ou
incoerente que entrasse na retenção poderia apagar dado bom da parede — exatamente o
que a DEC-014 proíbe.

**Fonte.** `src/lib/contrato-atualizacao-painel.ts`;
`tests/contrato-atualizacao-painel.test.ts`; commit `888f779`. **implementada**

---

## Painel — decisões da F4.0

Resolvidas pelo proprietário em 2026-08-13, depois de a F4.1 já ter sido publicada em
`f49f912`. Nenhuma delas está implementada: são invariantes que restringem as fatias
seguintes da F4.

### DEC-047 — A marca oficial substitui o wordmark tipográfico no painel

**Decisão.** O cabeçalho da TV usará o **lockup horizontal claro** da marca Casa
Louzada no lugar do texto tipográfico `CASA LOUZADA`. Os dois **não** aparecem
simultaneamente: exibir o lockup completo e, ao lado, outro `CASA LOUZADA` digitado
colocaria a identidade competindo com ela mesma.

O **símbolo oficial isolado** — preferencialmente na variante bege — é a base do
favicon/ícone. Não existe favicon oficial separado a ser fornecido.

A marca chegou como **PNGs transparentes** fornecidos pelo proprietário. Sobre eles é
permitido exclusivamente **recortar margens transparentes**, para adequação técnica.
É proibido redesenhar, vetorizar por aproximação, alterar geometria, trocar cores ou
reconstruir a marca de qualquer outra forma — inclusive por SVG artesanal
"equivalente".

**Motivo.** A marca oficial já contém símbolo e nome, e é a fonte visual
autoritativa. Qualquer reconstrução produz uma segunda marca parecida, não a marca.

**Impacto.** Implementado pela **F4.2**, que trouxe os arquivos oficiais para o
repositório e trocou o wordmark do cabeçalho:

- o lockup horizontal está em `public/marca/casa-louzada-horizontal-claro.png` e o
  símbolo em `public/marca/casa-louzada-simbolo-bege.png`;
- `src/app/icon.png` é o favicon derivado do símbolo oficial, e o
  `src/app/favicon.ico` genérico do scaffold foi **removido**;
- `src/components/painel/painel-visual.tsx` desenha o lockup horizontal, e o wordmark
  textual `CASA LOUZADA` **deixou de ser desenhado** — os dois nunca aparecem juntos;
- **nenhuma outra variante da marca foi versionada**: os dois PNGs acima são o que
  existe no repositório;
- **nenhuma reconstrução, vetorização ou recoloração foi feita** — os PNGs oficiais
  são servidos como estão.

As proibições acima continuam valendo para qualquer uso futuro da marca.

**Fonte.** Marca oficial entregue pelo proprietário em PNG transparente; escolha do
uso visual delegada por ele à revisão técnica e aprovada em 2026-08-13; commit
`7e0e35d` — `style: aplica marca oficial ao painel`.
**implementada na F4.2 — `7e0e35d`**

### DEC-048 — Offline não persiste números do painel

**Decisão.** O mecanismo offline da F4 **nunca** armazenará o payload de métricas para
ressuscitá-lo depois de um reload ou de um boot.

Depois de o mecanismo offline ter sido provisionado **pelo menos uma vez com rede**,
uma navegação que falhe por ausência de rede ou por indisponibilidade 5xx poderá
exibir uma **tela institucional** Casa Louzada. Essa tela tenta recuperar a aplicação
automaticamente e, quando ela voltar a responder, devolve o navegador ao painel para
uma **leitura fresca** — nunca para números guardados.

Resposta `404` causada por token inválido **não** é indisponibilidade e não pode ser
mascarada pela tela offline (DEC-010).

**Motivo.** Um número antigo, de idade desconhecida, na parede do escritório viola a
distinção entre dado real e dado não disponível (DEC-014). A tela institucional
comunica indisponibilidade sem inventar desempenho.

**Impacto.** Implementado pela **F4.4**, em `public/painel/sw.js`,
`public/painel/offline.html`, `src/components/painel/registrar-sw.tsx` e a montagem em
`src/app/painel/[token]/page.tsx`:

- o cache `casalouzada-painel-offline-v1` guarda **somente** a tela institucional e a
  marca que ela desenha — **nenhum `/painel/[token]/dados`, nenhum JSON e nenhum HTML
  normal do painel**, e nenhuma URL com token;
- falha de rede ou resposta **500–599** numa navegação devolvem a tela institucional;
- **`404` continua sendo `404`**: o teste é pelo status, nunca por `response.ok`, que
  é falso para 404 e mascararia token inválido como indisponibilidade (DEC-010);
- a tela mantém a URL do painel e **se recupera sozinha**, num ciclo de 15 segundos e
  também no evento `online`, recarregando assim que a aplicação responde abaixo de 500;
- o **primeiro boot** de um perfil que nunca instalou o mecanismo **continua dependendo
  de rede** — não se deve afirmar offline mágico antes do provisionamento;
- **o boot offline depois do provisionamento foi comprovado**: com o navegador
  encerrado por completo e a aplicação fora do ar, um novo processo sobre o mesmo
  perfil abriu a tela institucional, e registro e cache haviam persistido;
- a retenção da F3.6 permanece como está: em memória da aba, perdida no reload
  (DEC-045). O offline **não** a estende.

**Fonte.** DEC-014; DEC-045; decisão do proprietário em 2026-08-13; commit `8b9fce2` —
`feat: adiciona fallback offline ao painel`; evidência funcional em Chrome real de
2026-08-14. **implementada na F4.4 — `8b9fce2`**

### DEC-049 — Phantom Alien 4K é o hardware alvo, mas sua plataforma precisa ser comprovada

> **SUPERADA QUANTO À ESCOLHA DO HARDWARE pela [DEC-065](#dec-065--o-phantom-alien-4k-foi-avaliado-e-rejeitado-como-plataforma-do-painel).**
> O texto abaixo fica **preservado como registro histórico** do que valia entre
> 2026-08-13 e 2026-08-16. O `Phantom Alien 4K IPTV` **deixou de ser o hardware alvo**
> depois da avaliação física da F4.5A. O **princípio continua valendo integralmente**:
> nenhuma característica de plataforma é inferida sem evidência direta do aparelho — e
> ele passa a valer para a plataforma substituta, ainda não escolhida.

**Decisão.** O equipamento pretendido para conduzir a TV é o `Phantom Alien 4K IPTV`.

Seu sistema operacional, firmware, navegador disponível e capacidade de modo
quiosque/autostart **não são conhecidos** e **não serão inferidos**. A F4.5 começa
obrigatoriamente por uma inspeção do aparelho real.

**Motivo.** Escrever o procedimento operacional a partir de suposição produziria um
roteiro que ninguém consegue executar no equipamento que existe.

**Impacto.** Antes de `OPERACAO_TV.md` valer como procedimento definitivo, é preciso
provar **no equipamento**:

- sistema e firmware;
- navegador disponível e versão;
- abertura correta do painel;
- saída efetiva em 3840×2160;
- suporte às APIs web que a aplicação usa;
- possibilidade de inicialização automática, ou mecanismo equivalente;
- comportamento ao desligar e religar.

Não registrar Android, Chrome ou qualquer outro software sem evidência direta do
aparelho. Isso supera, para este hardware, a recomendação genérica de mini PC com
Chrome em quiosque do `PLANO.md` §5.1: ela continua sendo uma alternativa, não uma
descrição do que está em mãos.

A incerteza **não bloqueia** F4.2, F4.3 nem F4.4; bloqueia apenas o encerramento
operacional da F4.5.

**Fonte.** Hardware informado pelo proprietário em 2026-08-13.
**cumprida na parte da inspeção e SUPERADA na parte da escolha do hardware (DEC-065) —
a inspeção da F4.5A foi executada; o princípio de não inferir plataforma sem evidência
permanece invariante e transfere-se para a plataforma substituta**

### DEC-050 — O equipamento é desligado fora do expediente

**Decisão.** TV e equipamento **não operam 24/7**: serão desligados fora do
expediente. Não se implementa Screen Wake Lock preventivamente.

Durante o expediente, a primeira solução para suspensão de tela é a **configuração
operacional** do equipamento, da TV e do navegador. Wake Lock só entra na aplicação
se o ensaio real da F4.5 provar que essa configuração é insuficiente.

**Motivo.** Não introduzir API de browser sem necessidade demonstrada — ainda mais
uma cuja disponibilidade no aparelho alvo é desconhecida (DEC-049).

**Impacto.** Nenhum código de Wake Lock na F4.2, F4.3 ou F4.4. O assunto se fecha na
F4.5, com o resultado do ensaio: ou a configuração operacional basta e nada é
adicionado, ou a insuficiência fica registrada e a API é justificada por ela.

**Fonte.** Decisão do proprietário em 2026-08-13.
**invariante futura — fechamento operacional em F4.5**, agora na **F4.5C**, sobre a
plataforma substituta (DEC-065): o ensaio que julgaria a suficiência da configuração
operacional deixou de ser no `Phantom Alien 4K IPTV`, e nada foi decidido sobre Wake
Lock por conta disso.

### DEC-051 — Venda é um evento único, com participações

**Decisão.** Uma venda comercial é **um** lançamento `VENDA` — nunca uma linha por
corretor para atribuir crédito. O crédito passa a morar numa entidade própria,
`ParticipacaoVenda`, com um registro por corretor participante:

| Campo | Papel |
|---|---|
| `id` | uuid |
| `lancamentoId` | a venda a que a participação pertence |
| `corretorId` | quem participou |
| `equipeId` | **snapshot** da equipe do corretor no momento do fato |
| `ordem` | posição determinística dentro da venda, a partir de 1 |
| `criadoEm` | carimbo |

Constraints de banco: `UNIQUE (lancamento_id, corretor_id)` — o mesmo corretor não
participa duas vezes da mesma venda — e `UNIQUE (lancamento_id, ordem)` — a ordem é
única dentro da venda. A contiguidade da ordem (`1..N`, sem buracos) é validada pela
aplicação. Toda `VENDA` precisa de **pelo menos uma** participação; como "no mínimo um
filho" não tem constraint declarativa simples em SQL, essa invariante é garantida
pela aplicação — criação e edição gravam lançamento e participações **na mesma
transação** — e coberta por teste de integração.

FKs: `lancamentoId` com `onDelete: Cascade` — a participação é parte do fato, e o
hard delete de lançamento já existente leva as participações junto;
`corretorId` e `equipeId` com `onDelete: Restrict`, como o resto do histórico
(DEC-007).

**Sobre `Lancamento.corretorId` e `Lancamento.equipeId`.** O **estado final** é
**excludente**: depois do **cutover da E3**, toda `VENDA` tem os dois campos
**`NULL`**, e todo o crédito e a autoria histórica da venda moram
**exclusivamente** em `ParticipacaoVenda` — cada participação com `corretorId`,
`equipeId` histórico e `ordem`. Os demais tipos continuam usando exclusivamente os
dois campos do lançamento, obrigatórios como sempre, e **nunca** usam
`ParticipacaoVenda`. Não existe estado **permanente** de duas fontes: manter os
campos antigos preenchidos numa VENDA seria uma segunda representação do mesmo
crédito, e duas representações permanentes divergem. Pelo mesmo motivo foi rejeitado
espelhar o participante de ordem 1 nos campos antigos; e foi rejeitado generalizar
participações para todos os tipos, que não têm o caso de uso.

O cutover garante o estado final com um `CHECK` **semanticamente** equivalente a:

```text
(tipo = 'VENDA'  AND corretor_id IS NULL     AND equipe_id IS NULL)
OR
(tipo <> 'VENDA' AND corretor_id IS NOT NULL AND equipe_id IS NOT NULL)
```

A sintaxe SQL exata é decisão da fatia que o instala, conforme os nomes reais de
enum e colunas — o que está fixado aqui é o contrato. As FKs atuais continuam
`Restrict` quando os campos estão preenchidos.

**Sequenciamento — E2 aditiva, E3 cutover.** *Plano executado: E2 em `c6464b5`,
`fe00fd2` e `18a6599`; E3 em `2a50965`.* O código de métricas de então lia
`Lancamento.corretorId`/`equipeId`; zerá-los antes de a camada de cálculo consumir
participações quebraria o painel. Por isso o corte foi dividido, e a **representação
dupla durante a transição foi temporária e controlada** — a proibição acima vale para
o estado final permanente, não para a janela entre E2 e E3, que já se fechou.

**E2 — aditiva, sem cutover:**

1. criar a estrutura de `ParticipacaoVenda`, com as unicidades e FKs;
2. para cada `VENDA` existente, copiar `Lancamento.corretorId` e
   `Lancamento.equipeId` para **uma** participação de `ordem = 1` (backfill inicial);
3. **provar** o backfill inicial;
4. **manter** os campos antigos `NOT NULL`, preenchidos e como fonte executável —
   o `CHECK` final **não** é instalado na E2, e a administração **não** expõe UI de
   múltiplos participantes ainda: registrar venda compartilhada antes de a métrica
   saber interpretá-la produziria número errado na TV.

**E3 — cutover atômico**, junto com a administração multi-participante, o cálculo
(DEC-052), a leitura e os testes:

5. criar participação de `ordem = 1` para qualquer `VENDA` **ainda sem** participação
   — cobre, de forma idempotente, vendas criadas entre E2 e E3, usando os campos
   históricos ainda preenchidos;
6. **provar cobertura integral**;
7. adaptar aplicação e métricas para consumir participações;
8. tornar `Lancamento.corretorId`/`equipeId` nullable;
9. gravar `NULL` nos dois campos de **todas** as `VENDA`;
10. aplicar e validar o `CHECK` estrutural acima.

A informação histórica não se perde em nenhum passo: ela só sai dos campos antigos
**depois** de materializada na participação. Nenhuma venda desaparece, nenhuma muda
de equipe, e nenhum "resíduo" fica para trás: ao final da E3, `ParticipacaoVenda` é
a única fonte de crédito de VENDA.

**Edição.** Editar uma venda passa a gerir participações. O fluxo de conflito de
equipe da Q7 (DEC-034) permanece como está para os tipos de participante único; para
`VENDA`, o snapshot de equipe é decidido por participação.

**Motivo.** Vendas compartilhadas existem no negócio, e duplicar a linha de venda por
corretor quebraria a DEC-001 (cada fato é um registro) e contaria a mesma venda e o
mesmo VGV duas vezes na empresa.

**Preserva / supera.** Preserva a DEC-001 — a venda continua sendo um registro
individual. **Supera parcialmente a DEC-002**: para eventos de participante único a
equipe continua gravada no próprio `Lancamento`; para `VENDA`, o snapshot muda de
lugar — vai para cada `ParticipacaoVenda.equipeId` — porque uma venda agora pode
envolver mais de uma equipe. O princípio da DEC-002 fica intacto: **equipe histórica
nunca é derivada do corretor em tempo de consulta**; muda só a entidade que carrega o
snapshot.

**Fonte.** Decisão do proprietário em 2026-08-14; `PLANO.md` §3.

**Estado de implementação.** **IMPLEMENTADA.** A estrutura veio na **E2A**
(`c6464b5`): `ParticipacaoVenda` com as duas unicidades e as FKs (`Cascade` para o
lançamento, `Restrict` para corretor e equipe), mais o backfill inicial de uma
participação `ordem = 1` por VENDA existente. O **cutover saiu na E3** (`2a50965`),
como publicação atômica — schema, migration, núcleo, leitura, admin e testes no mesmo
commit.

No estado atual: `ParticipacaoVenda` é a **única fonte** do crédito de VENDA;
`Lancamento.corretorId` e `equipeId` são `NULL` em toda venda e obrigatórios nos demais
tipos, com o `CHECK lancamentos_venda_credito_check` garantindo os dois lados; a
administração grava lançamento e participações **na mesma transação**, de modo que
nenhuma venda observável fica sem elenco; e cada participação carrega o snapshot
histórico da equipe, que a edição nunca rederiva.

**Identidade das participações.** Numa edição, o participante que permanece continua
sendo **a mesma `ParticipacaoVenda`**: `id`, `corretorId`, `equipeId` e `criadoEm`
atravessam intactos, e só a `ordem` muda pela recompactação. O identificador nunca vem
do cliente — a action cruza o `corretorId` submetido com as participações que releu da
própria venda.
**implementada — estrutura na E2A (`c6464b5`); cutover na E3 (`2a50965`)**

### DEC-052 — Crédito e VGV da venda compartilhada

**Decisão.** Para uma venda de valor `V` com `N` participantes:

- **Empresa** — número de vendas: **+1**; VGV: **`V` uma única vez**, qualquer que
  seja o número de participantes e de equipes.
- **Corretor** — cada participante recebe **+1** em vendidos e a sua **fração
  igualitária** de `V` no VGV individual.
- **Equipe** — cada equipe **distinta** presente nas participações recebe **+1** em
  vendidos: dois participantes da mesma equipe rendem um só +1 para ela; equipes
  diferentes recebem +1 cada. O VGV da equipe é a **soma das frações dos
  participantes daquela equipe**.

A divisão é sempre **igualitária** — nunca se pede percentual. O dinheiro continua
exato: divisão inteira em centavos `bigint`, e os centavos residuais são
distribuídos **um por participante, em `ordem` crescente**. `R$ 100,00` por 3 dá
`33,34 / 33,33 / 33,33`. Invariante: **a soma das frações é exatamente `V`**, em
centavos, sempre — e, por consequência, a soma dos VGVs de equipe de uma venda
também é `V`.

A fração **não é persistida**: ela é derivável de forma determinística de
(`valor`, `N`, `ordem`) e é calculada no núcleo. Persisti-la criaria uma segunda
verdade que precisaria ser reescrita a cada edição do valor ou do elenco da venda.

**Elenco.** A regra de elenco mensal da DEC-038 se estende: para `VENDA`, "produção
do mês creditada à equipe" significa **participação** do mês creditada a ela. Um
participante ativo entra no elenco da equipe da sua participação, mesmo lotado hoje
em outra.

**Motivo.** O total da empresa não pode inflar com o número de participantes, e o
reconhecimento individual e por equipe precisa somar de volta ao todo — sem
percentual manual, que é fonte de erro e de negociação que o painel não arbitra.

**Preserva.** DEC-013 — a regra mora inteira em `src/lib/metricas.ts`, numa fonte
única; leitura e apresentação não somam, não dividem e não deduplicam venda.
DEC-036/DEC-004 — acumulados e períodos não mudam de fórmula: a empresa continua
somando `V` uma vez. A implementação deste cálculo entra **junto com o cutover da
E3** (DEC-051): até lá o código atual segue lendo os campos do lançamento.

**Fonte.** Decisão do proprietário em 2026-08-14, com o exemplo canônico da venda de
R$ 900.000 com participantes A e B da equipe X e C da equipe Y (empresa: 1 venda e
R$ 900 mil; cada corretor: 1 venda e R$ 300 mil; equipe X: 1 venda e R$ 600 mil;
equipe Y: 1 venda e R$ 300 mil).

**Estado de implementação.** **IMPLEMENTADA na E3** (`2a50965`), em
`src/lib/metricas.ts`. A empresa conta a venda e o valor **uma vez**, qualquer que seja
o elenco; cada participante recebe +1 vendido e a sua fração igualitária; cada equipe
recebe a soma das frações dos seus participantes, e a soma de todas fecha exatamente o
valor. O elenco mensal (DEC-038) passou a considerar as participações: um participante
ativo entra no quadro da equipe da **participação**, mesmo lotado hoje em outra.

A divisão é inteira em centavos `bigint`; os centavos residuais vão para os primeiros
por **`ParticipacaoVenda.ordem` crescente** — nunca pela ordem incidental do array, já
que tudo é indexado pela própria `ordem`. `R$ 100,00` entre três dá
`33,34 / 33,33 / 33,33`. A fração continua **não persistida**: deriva de
(valor, N, ordem) no núcleo, toda vez.

**Regra de ordem aprovada pelo proprietário em 2026-08-14, e implementada:** na
criação, a `ordem` é a posição do participante no formulário; na edição, os que
permanecem mantêm a ordem **relativa**, o participante novo entra **ao final**, e a
remoção **recompacta** para `1..N` preservando a relativa dos remanescentes. Não há
reordenação manual na v1 — sem arrastar, sem subir/descer, sem campo de ordem.
**implementada na E3 (`2a50965`)**

### DEC-053 — Proposta tem status e valor próprios, fora do VGV

**Decisão.** `PROPOSTA` continua sendo um lançamento, e ganha dois campos próprios:

- `valorProposta` — dinheiro **opcional**, num campo separado de `valor`;
- `statusProposta` — `AGUARDANDO` (padrão inicial), `ACEITA` ou `REJEITADA`.

**Contrato de integridade**, por tipo:

| | `statusProposta` | `valorProposta` | `imovelRef` | `valor` |
|---|---|---|---|---|
| `PROPOSTA` | **obrigatório** | opcional | **obrigatório** | permanece `NULL` |
| demais tipos | **`NULL`** | **`NULL`** | regra atual | regra atual |

A E2 garante isso por validação de aplicação e, quando viável, por proteção
equivalente no banco — a sintaxe exata é decisão da E2, não desta DEC.

`valorProposta` **não é VGV** e não entra em nenhum agregado monetário: nem VGV
mensal, trimestral, anual ou acumulado, nem ranking de VGV. `PROPOSTA` não vira tipo
monetário no sentido de `TIPOS_MONETARIOS` — o campo `valor` continua exclusivo de
`VENDA` e `LOCACAO`.

Toda proposta registrada continua contando na métrica mensal e no ranking de
propostas, **qualquer que seja o status**. O status alimenta somente a lista
operacional "Propostas em andamento" do painel, que exibe apenas `AGUARDANDO`
(DEC-056).

**Backfill.** Propostas existentes recebem `statusProposta = AGUARDANDO` — o padrão —
e podem ser atualizadas pela administração. A obrigatoriedade do imóvel vale para
novas submissões e edições; proposta legada sem imóvel permanece válida como
histórico.

**Motivo.** O proprietário quer ver o pipeline de propostas na TV, com valor
informativo quando houver — sem que esse valor contamine o VGV, que é produção
concluída.

**Preserva.** DEC-003 e o quadro mensal como estão; DEC-013 — a seleção da lista
operacional é regra de domínio no núcleo.

**Fonte.** Decisão do proprietário em 2026-08-14.

**Estado de implementação.** A parte E2 está implementada. **Schema e backfill em
`c6464b5`** (colunas `valor_proposta` e `status_proposta`, propostas existentes com
`AGUARDANDO`); **administração e integridade em `fe00fd2`** — status obrigatório e
editável entre os três estados, `valorProposta` opcional e fora de qualquer agregado
monetário, imóvel exigido em criação e edição, campos zerados nos demais tipos, e o
`CHECK` `lancamentos_proposta_campos_check` no banco. O `CHECK` **não exige
`imovel_ref`** de propósito: a proposta legada sem imóvel continua válida como
histórico, conforme esta decisão. A **lista operacional "Propostas em andamento" da TV
foi implementada na E4** (`c24a0c9`): só `AGUARDANDO`, no máximo três, mais recentes
primeiro, com imóvel e corretor — e a proposta legada sem imóvel **entra normalmente**,
exibindo "Imóvel não informado". Toda proposta continua contando na métrica mensal
qualquer que seja o status; o filtro vale só para a lista.
**implementada — modelo e admin na E2 (`c6464b5` + `fe00fd2`), lista da TV na E4 (`c24a0c9`)**

### DEC-054 — Saldo histórico pode ser mínimo conhecido

**Decisão.** Cada linha de `saldo_historico` ganha uma precisão:

`PrecisaoSaldoHistorico` — `EXATO` ou `MINIMO_CONHECIDO`.

Com `MINIMO_CONHECIDO`, o valor cadastrado é um **piso**: o proprietário não tem o
histórico completo, mas sabe que houve pelo menos aquilo. O cálculo não muda — novos
eventos posteriores ao corte continuam somando normalmente (DEC-036) — e a
**apresentação** passa a prefixar o acumulado com "+ de": saldo de 500 vendas mínimo
conhecido com 27 vendas posteriores exibe **"+ de 527"**; mesmo mecanismo para o VGV
("+ de R$ 800 mi"), compondo com o dinheiro compacto da DEC-043.

**Compatibilidade — backfill obrigatório.** Toda linha de `SaldoHistorico` que
exista antes da migration da E2 recebe **`EXATO`** como valor de backfill/default de
migração — é o que preserva a semântica que essas linhas sempre tiveram. **Nenhum
saldo existente é convertido automaticamente para `MINIMO_CONHECIDO`**: só passa a
exibir "+ de" o saldo que o administrador alterar explicitamente para essa precisão.

**Invariante preservada.** `saldo_historico` continua entrando **somente** nos
acumulados — nunca em mês, trimestre, ano ou ranking (DEC-004, DEC-035). A precisão
é um qualificador de exibição do acumulado, não uma nova participação de cálculo.

**Motivo.** Sem isso, o proprietário teria de inventar um número exato que não
possui, ou deixar o acumulado indisponível (DEC-037) — e "+ de 500" é a verdade que
ele tem.

**Fonte.** Decisão do proprietário em 2026-08-14; DEC-035; DEC-036; DEC-043.

**Estado de implementação.** **Campo e backfill em `c6464b5`** — `precisao` existe com
default `EXATO`, e toda linha anterior à migration recebeu `EXATO`. **Administração em
`fe00fd2`**: a precisão é escolhida na criação e alterável entre `EXATO` e
`MINIMO_CONHECIDO` nos dois sentidos, aparece na listagem e é exigida pela validação,
sem default silencioso. **A apresentação "+ de" foi implementada na E4** (`c24a0c9`): o
cálculo não muda, a precisão viaja junto do acumulado e a tela prefixa "+ de" — antes do
`R$` quando há moeda. A precisão do saldo de `VENDA` qualifica **imóveis vendidos e VGV
acumulado**; a de `AVALIACAO_GOOGLE`, **as avaliações**. Nunca aparece em mês,
trimestre, ano, quadro mensal ou ranking. `SEM_SALDO_HISTORICO` continua `—`: o tipo do
acumulado é união discriminada e o ramo sem valor não carrega precisão, o que torna
"+ de —" **inexprimível**, não apenas evitado.
**implementada por completo na v1 — modelo e admin na E2 (`c6464b5` + `fe00fd2`), apresentação na E4 (`c24a0c9`)**

### DEC-055 — Reserva de locação é entidade operacional, não produção

**Decisão.** Reserva de locação **não é** produção concluída e **não usa**
`Lancamento.tipo = LOCACAO`. Nasce uma entidade separada, `ReservaLocacao`:

`id`, `corretorId`, `equipeId` (snapshot no momento da criação, como nos
lançamentos), `imovelRef` (obrigatório), `status`, `dataReferencia`, `observacao?`,
`criadoPor`, `criadoEm`, `atualizadoEm` — com `StatusReservaLocacao` em `ATIVA`,
`FINALIZADA` ou `CANCELADA`. **Toda reserva nasce com `status = ATIVA`**; os outros
dois estados só entram por edição explícita posterior.

Reserva **não** incrementa Locados, **não** entra em VGV e **não** entra em ranking
de produção. Quando o negócio se concretiza, o operador registra a `LOCACAO`
normalmente e marca a reserva como `FINALIZADA` — **sem automação implícita** entre
as duas coisas na v1.

No painel, somente reservas `ATIVA` aparecem, na lista "Reservas de locação", mais
recentes primeiro, no máximo **3** (DEC-056).

**Motivo.** O proprietário quer visibilidade do que está reservado sem inflar as
métricas de produção — uma reserva pode não virar contrato.

**Preserva.** DEC-001 (a locação concluída continua sendo um lançamento), DEC-002
(snapshot de equipe no fato) e DEC-014 (reserva não conta como desempenho).

**Fonte.** Decisão do proprietário em 2026-08-14.

**Estado de implementação.** **Modelo em `c6464b5`** (tabela `reservas_locacao` e o
enum `status_reserva_locacao`); **administração em `18a6599`**, em
`/admin/reservas-locacao`. Comportamento implementado: reserva **nasce `ATIVA`** —
não há campo de status na criação, e a action grava o valor explicitamente; a **equipe
é snapshot** lido do corretor pelo servidor no momento da criação, e corretor e equipe
são **imutáveis na edição**; o status é editável entre os três estados, nos dois
sentidos; **não há hard delete** no admin — `CANCELADA` é o estado de uma reserva que
deixou de valer; e **finalizar não cria `LOCACAO`**, nem qualquer outro lançamento. A
**lista de reservas `ATIVA` na TV foi implementada na E4** (`c24a0c9`): só `ATIVA`, no
máximo três, mais recentes primeiro, com imóvel e corretor. `FINALIZADA` e `CANCELADA`
ficam de fora **sem afetar contagem nenhuma** — nunca houve contagem de reserva.
**implementada — modelo e admin na E2 (`c6464b5` + `18a6599`), lista da TV na E4 (`c24a0c9`)**

### DEC-056 — A faixa superior alterna entre métricas e destaques operacionais

**Decisão.** A faixa superior do painel passa a ter **dois** estados, e somente dois:

- **Tela A** — a atual, preservada: Imóveis vendidos, VGV acumulado, Avaliações
  Google. 20 segundos.
- **Tela B** — duas listas operacionais lado a lado, 20 segundos:
  **Propostas em andamento** (até 3 propostas `AGUARDANDO`, mais recentes primeiro,
  mostrando imóvel + corretor) e **Reservas de locação** (até 3 reservas `ATIVA`,
  mais recentes primeiro, mostrando imóvel + corretor).

Rotação `A → B → A → B`, sem terceira tela.

Lista vazia mostra **"Nenhuma proposta em andamento"** ou **"Nenhuma reserva
ativa"** — nunca `0`. São listas operacionais, não métricas de desempenho: `0` aqui
afirmaria um desempenho que a lista não mede (DEC-014).

A **seleção e a ordenação** das listas — filtro por status, mais recentes primeiro,
corte em 3, desempate determinístico — são regra de domínio e moram no núcleo
(DEC-013). A leitura e o contrato de atualização da F3.6 (DEC-044 a DEC-046) foram
estendidos para transportar as listas.

**Motivo.** A TV é o lugar onde o pipeline operacional fica visível para a equipe,
e a alternância preserva os acumulados sem disputar espaço com eles.

**Fonte.** Decisão do proprietário em 2026-08-14; DEC-013; DEC-014; DEC-053;
DEC-055.

**Estado de implementação.** **IMPLEMENTADA na E4** (`c24a0c9`). O que existe hoje:

- **A/B** — duas telas e só duas, com a Tela A inicial e `proximaTela` total e cíclica;
  não há terceiro estado possível;
- **20 segundos** por tela, num timer que depende só da tela ativa — o refresh de 60 s
  troca o conteúdo por baixo sem reiniciar o ciclo;
- **máximo 3** por lista, com `MAXIMO_DESTAQUES = 3` como fonte única do corte;
- **vazio é textual** — "Nenhuma proposta em andamento" / "Nenhuma reserva ativa" —, e
  `0` não aparece em lugar nenhum das listas;
- **seleção, ordenação e corte no núcleo** (`src/lib/metricas.ts`): filtro de status,
  `dataReferencia` decrescente, `criadoEm` decrescente e `id` crescente como desempates.
  A leitura Prisma não filtra status, não ordena operacionalmente e não aplica `take`, e
  os componentes não filtram, não ordenam e não cortam;
- **contrato e retenção estendidos**: `LeituraPainel` tem cinco blocos; uma leitura `OK`
  com lista vazia substitui a anterior, `INDISPONIVEL` retém a última lista conhecida, e
  as listas são retidas **mesmo atravessando a virada de mês**, porque descrevem o que
  está em aberto agora e não a produção de um mês.

**implementada na E4 (`c24a0c9`), sobre E2/E3**

### DEC-057 — O go-live provisório por URL precede a F4.5

**Decisão.** A prioridade imediata passa a ser a **entrega da v1 por URL**. A F4.5 —
operação em hardware real — fica **ADIADA, não cancelada**: ela não bloqueia a
entrega e será retomada depois do go-live.

Ordem de entrega aprovada:

| Etapa | Escopo |
|---|---|
| E1 | contratos e modelo de dados — **concluída em `078f360`** |
| E2 | migration **aditiva** + administração de propostas, saldo e reservas — **concluída em `c6464b5`, `fe00fd2` e `18a6599`** |
| E3 | venda compartilhada + métricas + **cutover final** (DEC-051) — **concluída em `2a50965`** |
| E4 | painel operacional A/B e apresentação dos novos estados — **concluída em `c24a0c9`** |
| E5 | gate completo — **concluída**: `RELEASE_CANDIDATE_READY_FOR_E6 = YES`, sem commit de código |
| E6 | go-live no Render + smoke público — **concluída**: `adabe2d` implantado no go-live, 5 migrations aplicadas |

Depois da entrega, retoma-se a F4.5. A escolha de plano/infraestrutura de produção é
do E6. F5 continua futura e não se declara iniciada.

**Motivo.** O valor imediato está em o painel existir numa URL acessível; o ensaio
do aparelho físico pode vir depois sem atrasar isso.

**Preserva.** DEC-049 e DEC-050 integralmente — nada sobre a plataforma do
`Phantom Alien 4K IPTV` muda ou é inferido; apenas o momento da F4.5 muda. A F4
continua **em andamento** e só se encerra com a F4.5.

**Fonte.** Decisão do proprietário em 2026-08-14.

**Estado de implementação. CUMPRIDA — o go-live provisório por URL está CONCLUÍDO.** As
seis etapas terminaram: a **E5** certificou o release candidate
(`RELEASE_CANDIDATE_READY_FOR_E6 = YES`) sem publicar código, e o **E6** executou a
operação — rotação da credencial exposta e prova da revogação, criação do Web Service no
Render, cadastro das variáveis de produção sem expor valor, deploy manual único do
commit `adabe2d` com as **quatro migrations aplicadas na ordem** pelo `pre-deploy`,
smoke público e validação da URL.

A Entrega v1 está **em produção** em `https://dashboard-casalouzada.onrender.com`; o
painel da TV fica em `https://dashboard-casalouzada.onrender.com/painel/<TOKEN>`, e o
token **não** é publicado. A infraestrutura escolhida foi **Render** (Web Service,
Virginia, Starter, Node 24.19.0), com **auto-deploy OFF** — toda versão futura exige
deploy manual até nova decisão.

Com o go-live feito, a **F4.5 está liberada para retomada** e **não iniciada**. A F4
continua **em andamento** e só se encerra com ela. **F5 segue futura e não iniciada.**
**cumprida — go-live concluído; F4.5 liberada para retomada, ainda não iniciada**

## Segurança — decisões da auditoria S1

A auditoria S1 encerrou quatro achados obrigatórios (SEC-001 a SEC-004), todos
corrigidos e verificados em produção. As decisões abaixo são as que **permanecem
valendo** depois disso — não o relato do trabalho, que está no handoff.

### DEC-058 — As tabelas do produto são isoladas da Data API do Supabase

**Decisão.** As oito tabelas de `public` ficam com **Row Level Security habilitado** e
**sem policy alguma**, e os roles `anon` e `authenticated` **não têm privilégio nenhum**
sobre elas — nem direto, nem por default privilege do creator `postgres`. `FORCE ROW
LEVEL SECURITY` **não** é usado.

**Motivo.** `anon` e `authenticated` **são roles PostgreSQL**, criados pela plataforma, e
são os que a Data API (PostgREST) assume ao atender requisição vinda da internet com a
chave pública do projeto. O que eles **não** são é parte do caminho da aplicação: o
acesso do produto ao banco é Next.js → Prisma → PostgreSQL, com role próprio, e nunca
passa por eles. Com RLS desligado e grants amplos — o padrão da plataforma —, quem
tivesse essa chave lia e escrevia em `usuarios` e `lancamentos` sem passar pelo Next.js,
pelo `src/proxy.ts`, pela guarda administrativa ou pelo token do painel. A aplicação
**não usa a Data API**: não há `@supabase/supabase-js`, nem chamada a `rest/v1`, nem
variável `SUPABASE_*`. Não havia consumidor legítimo a preservar.

São duas barreiras independentes de propósito: sem GRANT não há o que ler, e sem policy
o RLS nega. Uma só bastaria hoje; duas continuam valendo quando a outra cair, porque os
grants do schema `public` são reinstaláveis por fora.

**Impacto.** As duas barreiras são independentes, e é preciso ser exato sobre o que cada
uma faz. Criar uma policy permissiva **não devolve acesso por si só**: enquanto os grants
continuarem revogados, `anon` e `authenticated` não têm o privilégio que o PostgreSQL
exige antes mesmo de avaliar RLS. O que uma policy permissiva faria é **remover uma das
duas barreiras** — e, se os grants viessem a ser restaurados depois (o que é plausível,
já que são o padrão da plataforma e reinstaláveis por fora), a Data API voltaria a ter
caminho até as tabelas.

Por isso **manter zero policies segue sendo decisão deliberada**: é a barreira que não
depende de ninguém lembrar de conferir grants, e é simples de verificar — ou existe
policy, ou não existe.

A omissão do `FORCE` também é deliberada — é ela que mantém o dono das tabelas e quem tem
`BYPASSRLS` enxergando tudo, e portanto a aplicação funcionando sem policy nenhuma. A
Data API **continua no ar**; o que mudou é o alcance dela. Desligá-la é hardening
opcional, não pendência.

**Fonte.** `prisma/migrations/20260815190000_seguranca_data_api/migration.sql`, cuja
seção final relê o catálogo e aborta a migration se RLS, ACL, default ACL ou policies
não estiverem como prometido. **implementada**

### DEC-059 — As conexões PostgreSQL exigem TLS com verificação de certificado

**Decisão.** As duas conexões da aplicação usam TLS com validação contra o **CA oficial
do Supabase**, entregue como Secret File do Render em `/etc/secrets/supabase-ca.crt`.
Nunca usar modo que desabilite verificação — nem `rejectUnauthorized: false`, nem
`sslaccept=accept_invalid_certs`, nem omitir o CA.

**Motivo.** Antes disso as duas connection strings não tinham `sslmode`, e o driver não
negocia TLS por conta própria. A auditoria mediu isso no próprio socket
(`socket.encrypted === false`): o **protocolo PostgreSQL e os dados da aplicação
atravessavam a internet entre o Render e o Supabase sem a proteção de TLS**, expostos a
observação e adulteração por quem estivesse no caminho de rede — incluindo o handshake
de autenticação, que trafegava sem confidencialidade nem integridade de transporte.

O que a auditoria **não** determinou foi o método de autenticação negociado, e portanto
não se afirma aqui que a senha tenha sido transmitida em forma bruta. O ponto é
suficiente sem isso: sem TLS não há garantia de sigilo nem de integridade para nada que
passe pela conexão.

O certificado do pooler é assinado por uma CA privada da Supabase, então o trust store
público do sistema não basta: sem o CA fornecido, `verify-full` falha.

**Impacto — e a armadilha que isto evita.** Cada conexão tem **um consumidor diferente,
com sintaxe diferente**, e trocá-las é pior que não configurar nada:

| Conexão | Consumidor | Sintaxe |
|---|---|---|
| `DATABASE_URL` | runtime, `pg` via `@prisma/adapter-pg` | `sslmode=verify-full` + `sslrootcert=<caminho do CA>` |
| `DIRECT_URL` | Prisma CLI/migrations, engine Rust | `sslmode=require` + `sslaccept=strict` + `sslcert=<caminho do CA>` |

O engine Rust do Prisma **aceita e ignora silenciosamente** `sslmode=verify-full` e
`sslrootcert`: a URL parece correta em revisão de código e não valida coisa alguma. Quem
liga a verificação ali é `sslaccept=strict` — comprovado por diferencial, já que com CA
incorreto a conexão passa a falhar com `P1011`.

O **SSL Enforcement do Supabase continua desligado**: o servidor ainda aceitaria conexão
sem TLS. Isso é hardening — impediria regressão de configuração —, e não uma parte
faltante desta decisão. Habilitá-lo provoca reboot do banco.

**Fonte.** Configuração do serviço no Render (valores não versionados); Secret File
`supabase-ca.crt`; provas de TLS 1.3 com certificado autorizado nas duas conexões,
inclusive dentro do `pre-deploy`. **implementada**

### DEC-060 — Runtime e migrations usam roles PostgreSQL distintos

**Decisão.** A `DATABASE_URL` usa o role dedicado **`casalouzada_runtime`**; a
`DIRECT_URL` continua com a credencial administrativa **`postgres`**. O runtime **nunca
deve voltar a usar `postgres`**.

Atributos duráveis do role de runtime: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOREPLICATION`, `NOINHERIT`, **`BYPASSRLS`**, zero memberships
administrativas e **zero ownership**. Privilégios de tabela exatamente estes:

| tabela | SELECT | INSERT | UPDATE | DELETE |
|---|:--:|:--:|:--:|:--:|
| `equipes` | sim | sim | sim | não |
| `corretores` | sim | sim | sim | não |
| `lancamentos` | sim | sim | sim | sim |
| `participacoes_venda` | sim | sim | não | sim |
| `reservas_locacao` | sim | sim | sim | não |
| `saldo_historico` | sim | sim | sim | sim |
| `usuarios` | sim | não | não | não |
| `_prisma_migrations` | não | não | não | não |

Nenhuma tabela recebe **TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN**.

**Motivo.** O `postgres` do projeto Supabase pode criar roles, criar bancos, iniciar
replicação, alterar qualquer objeto do schema e ignorar RLS. O runtime não precisa de
nada disso: ele lê e escreve sete tabelas. Usá-lo como conexão da aplicação
transformava qualquer vazamento de credencial, ou qualquer injeção futura, em
comprometimento administrativo do banco.

A matriz é derivada do código, não de conveniência: `usuarios` é **somente leitura**
porque o runtime só lê (login e guarda) — a troca de senha é o script
`db:trocar-senha-admin`, que usa a `DIRECT_URL`; `participacoes_venda` não recebe UPDATE
porque a reconciliação de elenco apaga e recria; e não há DELETE de equipe, corretor ou
reserva porque encerrar é `ativo = false` / status, não exclusão.

**Impacto.** O `BYPASSRLS` é o único atributo positivo, e é intencional: o RLS da
DEC-058 existe para barrar a Data API, não o servidor da aplicação.

A alternativa — runtime sem `BYPASSRLS` — exigiria **introduzir policies permissivas
específicas para o role de runtime**, e é isso que se quer evitar, por três razões: elas
não expressariam isolamento real por linha, já que o produto não é multi-tenant e a
autorização é decidida no servidor antes de chegar ao banco; acrescentariam objetos a
manter e revisar; e apagariam a leitura simples da arquitetura atual — **Data API
bloqueada, runtime autorizado** —, que hoje se verifica olhando se existe policy.

Vale registrar o que isso **não** é: adicionar policies numa migration futura não
invalidaria a migration do SEC-001. Aquela prova afirma o estado ao final da própria
execução, e uma migration posterior pode alterar o estado sem tornar retroativamente
falso o que foi verificado. O que uma mudança dessas exigiria é uma **decisão
arquitetural nova e deliberada**, substituindo esta — não é impedimento técnico, é
escolha a ser refeita conscientemente.

Manter a `DIRECT_URL` administrativa é o que permite que o runtime seja tão restrito —
migrations continuam podendo o que precisam.

Ao trocar a senha do role, contar com o **cache de credencial do Supavisor**: a mudança
leva alguns segundos para refletir no pooler, e uma primeira tentativa pode falhar com
`password authentication failed` sem que nada esteja errado. Validar a conexão **antes**
de disparar deploy.

**Fonte.** Role `casalouzada_runtime` em produção; provas de `current_user`, TLS e
capabilities negativas antes e depois do deploy. **implementada**

### DEC-061 — Acesso do runtime a tabelas novas é explícito e versionado

**Decisão.** Não existe default privilege concedendo ao role de runtime. **Tabela nova
nasce inacessível a ele.** A migration que introduzir um objeto deve conceder
explicitamente o mínimo que ele exige, e esse `GRANT` fica versionado junto do `CREATE
TABLE`.

**Motivo.** A alternativa — `ALTER DEFAULT PRIVILEGES` para o runtime — reintroduziria,
em menor escala, exatamente o mecanismo que a DEC-058 acabou de remover: concessão
automática e invisível. O custo desta decisão é uma linha por migration; o ganho é que o
privilégio aparece no diff, onde pode ser revisado, e que o esquecimento **falha
fechado** — a tela quebra em desenvolvimento, em vez de a tabela nascer aberta em
produção.

**Impacto.** Quem criar tabela precisa lembrar do `GRANT`, e é para lembrar mesmo: é uma
decisão de segurança por objeto, não um detalhe de infraestrutura. Vale também para o
`_prisma_migrations`, que permanece sem nenhum privilégio para o runtime.

**Fonte.** Ausência deliberada de default privileges para `casalouzada_runtime`;
DEC-060. **implementada**

### DEC-062 — O redirect pós-login só admite o namespace `/admin`

**Decisão.** O parâmetro `proximo` do login só produz destino dentro de `/admin`.
Qualquer outra entrada — inclusive caminho interno legítimo como `/login` — vira
`/admin`. A decisão é tomada sobre a **URL canonicalizada**, e o que se redireciona é a
forma canônica, **nunca o texto recebido do cliente**.

**Motivo.** A regra anterior era por proibição: exigia começar com `/` e não começar com
`//`. `/\evil.example` cumpre as duas condições, e a especificação de URL trata a
contrabarra como barra em esquemas web — o destino resolvia para outra origem, e o
administrador recém-autenticado caía num site de terceiro pronto para pedir a senha de
novo. Listas de proibidos falham sempre pelo mesmo motivo: exigem adivinhar de antemão
toda forma de escrever um endereço externo.

**Impacto.** O candidato é resolvido pelo mesmo parser que o navegador usa, contra uma
origem sentinela sob `.invalid` que existe só para medir: se a origem sobreviveu à
resolução, o texto era mesmo relativo. Resolver também canonicaliza, e é isso que faz
`/admin/../login` ser julgado como `/login` — o que ele de fato é — em vez de aprovado
por começar com o texto `/admin`. A fronteira exige o separador, então `/administrator`
não se confunde com `/admin`.

A decisão vive em `src/lib/destino-login.ts`, e não na Server Action, porque módulo
`use server` tem contrato próprio de exports e não comporta função pura exportada só
para teste.

**Fonte.** `src/lib/destino-login.ts`; `src/app/login/acoes.ts`;
`tests/destino-login.test.ts`. **implementada**

### DEC-063 — HSTS global com max-age de um ano, sem includeSubDomains e sem preload

**Decisão.** A aplicação envia `Strict-Transport-Security: max-age=31536000` em todas as
respostas, por uma regra única no `headers()` do `next.config.ts` cujo `source` é
`/:caminho*`. Sem `includeSubDomains` e sem `preload`.

**Motivo.** O host redireciona `http` para `https`, mas o redirecionamento só acontece
depois que uma requisição em claro saiu. Enquanto não conhece a política, o navegador
emite esse primeiro salto — e a URL do painel carrega o token no **path**, que viaja
nele. É esse o dado sensível em jogo. O cookie de sessão **não** é: ele é gravado com
`secure` em produção (`src/lib/sessao-servidor.ts`), e navegador não envia cookie
`Secure` por `http`. Depois de aprender a política, o navegador troca para `https` por
conta própria, antes de enviar.

**Limite.** Sem `preload`, o cabeçalho não protege a primeira visita de um navegador que
ainda não conhece a política — ele precisa recebê-lo ao menos uma vez por HTTPS. Isso é
limite conhecido da mecânica, não defeito da configuração, e é a razão de o
redirecionamento continuar necessário.

**Impacto.** `includeSubDomains` fica fora porque a política pertence ao host que a
emite e a diretiva a estenderia apenas aos **descendentes** desse host — nunca a outros
projetos vizinhos sob `onrender.com`, que emitem a sua própria. Como não existe
subdomínio próprio abaixo do host atual, não há quem herde: a diretiva não compraria
nada e só criaria compromisso a honrar se algum subdomínio nascer sem HTTPS. Reavaliar
se a topologia de domínio mudar. `preload` não faz parte desta decisão: pede inclusão
numa lista embutida nos navegadores, exige decisão própria e não deve entrar por cópia
do exemplo genérico da documentação do Next.

A regra do painel (`X-Robots-Tag`, DEC-011) fica intacta e convive com a nova na mesma
resposta: as duas regras se aplicam juntas nas rotas do painel, com chaves distintas.

**Fonte.** `next.config.ts`; `tests/cabecalhos-http.test.ts`. Verificado em produção no
deploy `dep-da0fume7bikc73f2dc40`. **implementada**

### DEC-064 — A aplicação não pode ser embutida

**Decisão.** Nenhuma origem pode enquadrar a aplicação. A política é
`Content-Security-Policy: frame-ancestors 'none'`, enviada em todas as respostas pela
mesma regra global do `next.config.ts` que carrega o HSTS. `X-Frame-Options: DENY`
acompanha como encosto legado, para navegador que não leia `frame-ancestors`; quem lê as
duas ignora a segunda.

**Motivo.** Não existe caso legítimo de embutir a aplicação — nem por origem de
terceiro, nem pela própria. Não há iframe, object ou embed em ponto nenhum do produto, e
o painel da TV abre como página inteira. Daí `DENY` em vez de `SAMEORIGIN`: permitir o
mesmo domínio custaria a mesma linha e não compraria nada.

O cookie de sessão é `SameSite=Lax` (DEC-018) e já não acompanha iframe cross-site, o
que cobria o cenário autenticado. Mas essa mitigação depende do cookie e não impede o
enquadramento em si — a página continuava podendo ser desenhada dentro de um frame
alheio. A política impede, com ou sem sessão. As duas coisas somam; nenhuma substitui a
outra.

**Escopo.** A CSP contém **somente** `frame-ancestors 'none'`. Restringir script e
estilo é problema separado: pede um desenho próprio de CSP, compatível com a estratégia
de rendering e de build do projeto, e a escolha entre as abordagens disponíveis é ciclo
próprio. Nada disso entra de carona nesta regra — o teste mede a política diretiva a
diretiva e falha se qualquer outra aparecer.

HSTS (DEC-063) e `X-Robots-Tag` do painel (DEC-011) são políticas independentes e seguem
intactas: a primeira na mesma regra global, a segunda na regra específica do painel.

**Fonte.** `next.config.ts`; `tests/cabecalhos-http.test.ts`. Verificado em produção no
deploy `dep-da0ggsk9v7es739aj24g`. **implementada**

## Plataforma de operação da TV

### DEC-065 — O Phantom Alien 4K foi avaliado e rejeitado como plataforma do painel

**Decisão.** O `Phantom Alien 4K IPTV` **não será a plataforma definitiva de operação do
painel**. A F4.5 continua aberta e passa a ter outro objetivo: **selecionar e validar uma
plataforma substituta**, que **não está escolhida** e sobre a qual **nada se presume**.

Esta decisão **supera a DEC-049 apenas na escolha do hardware**. O princípio central da
DEC-049 — não registrar sistema, navegador, resolução ou capacidade de quiosque sem
evidência direta do aparelho — **continua valendo integralmente** e passa a reger a
plataforma substituta.

**Motivo.** A avaliação física foi executada (F4.5A) e caracterizou o aparelho o
suficiente para a decisão. Os fatos observados no equipamento:

| Item | Observado no aparelho |
|---|---|
| Sistema | Android 7.0 |
| Patch de segurança | 1 de dezembro de 2018 |
| Kernel | `3.18.24_hi3798mv2x` |
| Build | `NRD90M release-keys` |
| Arquitetura | ARM 32 bits — `Linux armv7l` |
| Navegador | Chrome 112.0.0.0 |
| UI de resolução do aparelho | somente **720P** e **1080P** — não existe opção 4K na UI |
| Saída HDMI no momento da medição | **1080P 60Hz** selecionada; as opções 2160P disponíveis são **30/25/24Hz** |

Os motivos do descarte são estes, e são **observacionais**: plataforma antiga, Android 7,
patch de segurança de 2018, Chrome 112, UI limitada a 1080p, 2160p disponível apenas até
30 Hz, e operação por navegador que não atende de forma limpa ao objetivo atual.

**Isto não é alegação de defeito.** O aparelho não foi declarado quebrado nem
defeituoso; ele é **inadequado ao objetivo definido** — um painel permanente em
3840×2160, com navegador mantido e operação autônoma.

**O que a avaliação provou no aparelho.** `/preview` abre; `/painel/<TOKEN>` abre e
exibe os dados reais. O token **não é publicado**. APIs comprovadas: `fetch`,
`localStorage`, `Promise`/`async`, optional chaining, container queries e Fullscreen API.

**O que a avaliação NÃO provou.** Service Worker, Cache Storage e Wake Lock ficaram
**inconclusivos**: a sonda foi aberta em contexto HTTP inseguro, onde esses recursos não
são oferecidos pelo navegador por regra de contexto seguro. **Não se declara ausência de
suporte** — a medição não permite essa conclusão. Também **não se afirma** qual sinal a
TV efetivamente recebeu: o que foi observado é a seleção na UI do aparelho, não o modo
negociado no display.

**Achado de viewport — do Phantom / Chrome Android observado.** Na configuração medida,
`screen` = 1280 × 720, `viewport` = 1280 × 624, `devicePixelRatio` = 1: a barra do Chrome
ocupava parte da área vertical. O painel usa `100vh`, e naquele navegador o layout foi
montado para uma altura maior que a área efetivamente visível, cortando a faixa inferior.

Isto fica registrado como **achado daquele aparelho e daquele navegador**, e **não** como
defeito universal do painel. **Nenhuma correção de código foi feita**: o hardware foi
descartado e o substituto ainda não foi testado — corrigir agora seria otimizar para uma
plataforma que não vai operar o painel, com risco de nem sequer ser o comportamento da
que vier. O achado é insumo da F4.5C, onde a plataforma escolhida for medida.

**Critérios para a seleção (F4.5B).** São **critérios de escolha**, não a especificação
de um produto — nenhuma marca ou modelo é escolhida neste ciclo:

- navegador moderno e mantido;
- atualização suportada;
- saída **3840×2160 a 60 Hz**;
- capacidade de fullscreen/quiosque;
- autostart ou restauração automática;
- Service Worker;
- Cache Storage;
- comportamento previsível após reboot;
- controle de suspensão/tela;
- rede estável;
- possibilidade de operar o painel sem intervenção diária além de ligar e desligar.

**Impacto.** A F4.5 é reestruturada em cinco fatias: **F4.5A** (avaliação do Phantom) —
**concluída, resultado HARDWARE REJEITADO**; **F4.5B** (seleção da plataforma
substituta) — pendente; **F4.5C** (validação física da substituta) — pendente;
**F4.5D** (operação autônoma) — pendente; **F4.5E** (gate físico final) — pendente. A
F4 continua **em andamento** e só se encerra com a F4.5.

**Preserva.** DEC-050 integralmente — o equipamento continua desligado fora do
expediente e o Wake Lock continua sem justificativa, agora a ser julgado na F4.5C sobre
a plataforma substituta. DEC-048 integralmente — o offline segue sem persistir número, e
o mecanismo continua a ser reprovado no navegador real da plataforma que vier. A
recomendação genérica de mini PC com Chrome em quiosque do `PLANO.md` §5.1 continua
sendo **uma alternativa entre outras**, e não a escolha da F4.5B.

**Fonte.** Inspeção física do aparelho em 2026-08-16 (F4.5A) e decisão do proprietário na
mesma data. **decisão registrada — F4.5B a F4.5E pendentes**

## Conexões de banco

### DEC-066 — Três conexões de banco, uma por consumidor, sem fallback

**Decisão.** O projeto tem **três** variáveis de conexão, cada uma com **um**
consumidor, e nenhuma delas substitui outra:

| Variável | Consumidor | Driver | Conexão | Role |
|---|---|---|---|---|
| `DATABASE_URL` | runtime da aplicação (`src/lib/db.ts`) | node-postgres via `@prisma/adapter-pg` | pooler | `casalouzada_runtime` |
| `DIRECT_URL` | Prisma CLI — migrations e introspecção (`prisma.config.ts`) | engine Rust | direta | administrativo |
| `ADMIN_DATABASE_URL` | scripts administrativos em Node — `db:seed` e `db:trocar-senha-admin` | node-postgres via `@prisma/adapter-pg` | direta | administrativo |

Os dois scripts administrativos **falham fechado**: sem `ADMIN_DATABASE_URL` eles
abortam **antes de abrir conexão**, e **não** caem para `DIRECT_URL` nem para
`DATABASE_URL`.

**Motivo.** Dois problemas independentes, e cada um sozinho já justifica a separação.

O primeiro é de **privilégio**. Desde o SEC-004 (DEC-060) o role de runtime tem
`usuarios` **somente leitura**. Um script de seed ou de troca de senha que caísse na
`DATABASE_URL` falharia por permissão — um erro obscuro, longe da causa.

O segundo é o que motivou esta decisão, e é uma **armadilha silenciosa**. As duas
sintaxes de TLS descritas na DEC-059 não são estilo: elas pertencem a drivers
diferentes e **cada driver ignora a do outro**.

| Driver | Liga a verificação com | Ignora |
|---|---|---|
| engine Rust do Prisma | `sslaccept=strict` (+ `sslcert` como CA) | `sslmode=verify-full`, `sslrootcert` |
| node-postgres | `sslmode=verify-full` + `sslrootcert` | `sslaccept`; e trata `sslcert` como certificado de **cliente**, não como CA |

Reaproveitar a `DIRECT_URL` — que é do CLI — dentro de um script Node produz, na
melhor hipótese, um erro de conexão; na pior, uma conexão que **sobe parecendo
verificada e não valida certificado nenhum**. É o mesmo tipo de engano que a DEC-059
já registrava numa direção, agora fechado na outra.

**Como isso apareceu.** Não foi teoria. Durante a rotação emergencial da senha
administrativa (O1-S0, 2026-08-16), o `scripts/trocar-senha-admin.ts` recebia a
`DIRECT_URL` operacional e **falhava**: o node-postgres tentava usar o CA como
certificado de cliente. A execução só passou depois de a URL ser traduzida à mão para
a sintaxe do node-postgres. Uma tradução manual necessária em todo uso é a definição
de contrato inconsistente — daí esta decisão.

**Impacto.**

- `src/lib/db.ts` fica como está: runtime é `DATABASE_URL`, sem fallback (já era
  assim);
- `prisma.config.ts` fica como está: `DIRECT_URL ?? DATABASE_URL` continua sendo o
  contrato do CLI;
- `prisma/seed.ts` e `scripts/trocar-senha-admin.ts` passam a exigir
  `ADMIN_DATABASE_URL`, **sem fallback**, e a mensagem de erro nomeia a variável e
  explica por que as outras duas não servem — **sem nunca imprimir valor**;
- `scripts/banco-teste.ts` injeta as **três** apontando para o banco local, onde a
  distinção não tem efeito: não há pooler, não há TLS e o role é um só;
- `ADMIN_DATABASE_URL` é **local/operacional**. O Web Service **não** precisa dela
  para servir a aplicação: o runtime usa `DATABASE_URL` e o `pre-deploy`
  (`prisma migrate deploy`) usa o CLI com `DIRECT_URL`. Cadastrá-la no Render
  colocaria uma credencial administrativa no ambiente do processo web sem consumidor
  — exatamente o que o SEC-004 removeu de lá.

**Prova.** `tests/contrato-conexao-admin.test.ts` roda os dois comandos sem
`ADMIN_DATABASE_URL` e **com** `DATABASE_URL` e `DIRECT_URL` definidas como
chamariz apontando para uma porta morta: exige falha, exige que a mensagem nomeie a
variável ausente e exige **ausência de qualquer sinal de tentativa de rede** — é isso
que distingue "falhou fechado" de "tentou e não conseguiu".
`tests/integracao/trocar-senha-admin.integracao.test.ts` prova o comando inteiro
contra o banco local: senha nova confere, **anterior deixa de conferir**, hash muda,
`id`/`nome`/`email`/`ativo` sobrevivem, e-mail desconhecido não cria conta, senha curta
é recusada sem tocar no hash, e nada disso aparece em stdout.

**Preserva.** DEC-059 integralmente — as duas sintaxes de TLS continuam sendo o que
eram; esta decisão apenas impede que uma seja usada no lugar da outra. DEC-060
integralmente — o runtime segue com privilégio mínimo, e é justamente por isso que ele
não pode ser o caminho dos scripts administrativos.

**Fonte.** `prisma/seed.ts`; `scripts/trocar-senha-admin.ts`; `.env.example`;
`scripts/banco-teste.ts`; `tests/contrato-conexao-admin.test.ts`;
`tests/integracao/trocar-senha-admin.integracao.test.ts`. Evidência de campo na
execução O1-S0 de 2026-08-16. **implementada — ainda não publicada em produção; o
release em produção continua sendo `25e62b5`**
