# Handoff Atual — Dashboard Casa Louzada

## Identificação

| Item | Valor |
|---|---|
| Repositório | `github.com/shumbertshuanys/dashboard-casalouzada` (público) |
| Branch | `main` |
| Commit de referência | `9ec8439` — `feat: adiciona leitura Prisma das métricas` |
| Data do handoff | 2026-08-13 |

## Estado executivo

A **Fase 1** está concluída: o projeto Next.js roda, o banco tem schema e migrações
aplicadas, o seed cria as três equipes e o administrador, e o login funciona com
sessão em cookie assinado.

O **protótipo visual** está concluído e versionado: `/preview` desenha o painel
inteiro a partir de dados fictícios.

A **Fase 2 — Administração está concluída**. Equipes, corretores, lançamentos e
saldo histórico podem ser gerenciados pela área administrativa, e o sistema já pode
ser alimentado de verdade.

Da **F3 — Painel**, quatro fatias estão concluídas. A **F3.0 — decisões e contratos**
registrou nas DEC-036 a DEC-042 as regras aprovadas pelo proprietário em 2026-08-12. A
**F3.1 — janelas civis** (`592df35`) entregou `JanelaCivil`, `mesCorrente`,
`trimestreCorrente` e `anoCorrente` em `src/lib/datas.ts`. A **F3.2 — núcleo puro de
métricas** foi publicada em dois commits: `6cf0627` (empresa) e `8ec6cbc` (equipes e
rankings). A **F3.3 — leitura Prisma** foi publicada em `9ec8439`.

`src/lib/metricas.ts` existe e tem duas entradas —
`calcularMetricasEmpresa(lancamentos, saldos, agora?)` e
`calcularMetricasEquipes(lancamentos, corretores, equipes, agora?)`. As duas consomem
as janelas da F3.1 e **continuam puras**: recebem os dados já lidos e não conhecem
Prisma, banco nem ambiente. A F3.3 não alterou uma linha delas.

`src/lib/metricas-prisma.ts` é a fronteira banco → domínio, entregue pela F3.3. Ela
lê as quatro tabelas, converte cada linha para os tipos da F3.2 e chama as duas
entradas puras — sem duplicar nenhum cálculo. A entrada é
`obterMetricasPainel(prisma, agora?)`.

O que a F3.3 **não** fez foi ligar a tela. `/painel/[token]` continua respondendo
"Painel em construção" e **não consome** `obterMetricasPainel`, e `/preview` segue
desenhando a partir de `src/lib/mock-painel.ts`.

A próxima fatia é a **F3.4 — shape de apresentação**, não iniciada. Ligar a rota aos
dados reais é a F3.5.

## Fases

| Fase | Estado | Evidência |
|---|---|---|
| F1 — Fundação | **Concluída** | `b463e86` |
| Protótipo visual | **Concluído** | `22bf943` |
| F2.0 — Infraestrutura da administração | **Concluída** | `bee7df7` |
| F2.1 — Equipes | **Concluída** | `e75a543`, com microcorreção em `6b4ff7d` |
| F2.2 — Corretores | **Concluída** | `fa49528` |
| F2.3 — Lançamentos (criação e listagem) | **Concluída** | `5ae39e5` |
| F2.4 — Lançamentos (edição e exclusão) | **Concluída** | `caa151f` |
| F2.5 — Saldo histórico | **Concluída** | `485ba36` |
| **F2 — Administração** | **Concluída** | — |
| F3.0 — Decisões e contratos do painel | **Concluída** | DEC-036 a DEC-042; sem código |
| F3.1 — Janelas civis | **Concluída** | `592df35` |
| F3.2 — Núcleo puro de métricas | **Concluída** | `6cf0627` + `8ec6cbc` |
| F3.3 — Leitura Prisma | **Concluída** | `9ec8439` |
| F3.4 — Shape de apresentação | **Não iniciada** — próxima | — |
| F3.5 — Painel real | **Não iniciada** | `/painel/[token]` sem banco |
| F3.6 — Atualização automática | **Não iniciada** | — |
| F4 — Identidade e modo TV | **Não iniciada** | depende da F3 |
| F5 — Refinamentos | **Futura** | metas, comparativos, fotos, exportação |

## Fundação técnica

- **Next.js 16.3.0 (App Router) + TypeScript**, **Tailwind CSS v4**.
- **Prisma 7.9.1 sobre PostgreSQL**, com driver adapter em `src/lib/db.ts`. As URLs
  saíram do `schema.prisma`: migrações leem `DIRECT_URL` pelo `prisma.config.ts` e a
  aplicação usa `DATABASE_URL` em runtime (DEC-031).
- **Sessão em JWT HS256** em cookie `httpOnly`, validade de 7 dias.
- **Middleware** em `src/proxy.ts` — no Next 16 a convenção passou a ser `proxy`
  (DEC-032).
- **Guarda administrativa** em `src/lib/admin/guarda.ts`: `exigirAdministradorAtivo()`
  consulta o banco e exige `ativo === true` **no momento da operação**. O middleware
  só confere a assinatura do JWT, que vale 7 dias; sem a guarda, uma conta desativada
  continuaria entrando. Toda página que lê dado e toda Server Action chama a guarda
  por conta própria — o layout não é fronteira de autorização.
- **Helpers**: `src/lib/datas.ts` (data civil sempre em UTC, com `hojeEmSaoPaulo`
  como único ponto que conhece o fuso do negócio e, desde a F3.1, as janelas civis de
  mês, trimestre e ano) e `src/lib/dinheiro.ts` (dinheiro como string decimal, sem
  ponto flutuante em nenhum caminho de persistência).
- **Núcleo de cálculo**: `src/lib/metricas.ts`, desde a F3.2. Puro — recebe os dados
  por parâmetro, sem Prisma nem ambiente.
- **Fronteira de leitura**: `src/lib/metricas-prisma.ts`, desde a F3.3. `server-only`,
  com o `PrismaClient` injetado por parâmetro (DEC-041). Faz quatro leituras Prisma,
  converte `Decimal` em string decimal canônica por `toFixed(2)` e chama o núcleo puro.
  Não repete nenhum cálculo: não há soma, contagem, `groupBy` nem `aggregate` ali.

## Administração implementada

Somente o que está no código.

### Equipes — `/admin/equipes`

Listar (ativas e inativas), criar, editar, definir ordem de exibição, ativar e
desativar. **Não há hard delete**: corretores e lançamentos guardam a equipe do
momento do registro. Nome é único no banco, e o conflito vira mensagem de domínio
que distingue equipe ativa de desativada.

### Corretores — `/admin/corretores`

Listar com filtros por equipe e situação, criar, editar, mover de equipe, inativar e
reativar. **Sem exclusão.** Criar ou transferir exige equipe ativa; permanecer na
própria equipe vale mesmo se ela tiver sido desativada, senão corrigir um CRECI
obrigaria a transferir quem ficou numa equipe encerrada.

**Mover um corretor de equipe não reescreve lançamento nenhum** — o histórico
permanece creditado onde foi registrado.

### Lançamentos — `/admin/lancamentos`

- **Criação rápida**, feita para lançar vários eventos em sequência: tipo e data
  ficam, o resto é limpo a cada registro.
- **Uma submissão é uma linha.** Nenhum evento derivado.
- **A equipe é gravada no evento**, lida da equipe atual do corretor imediatamente
  antes da criação. Não existe campo de equipe no formulário.
- **A autoria** vem de `exigirAdministradorAtivo()`, nunca do cliente.
- **Listagem** com filtros por data, corretor, equipe e tipo, e **paginação de 50**.
  A equipe exibida é a do evento, não a lotação de hoje. Sem totalizador.
- **Edição** e **exclusão individual** (hard delete, só na tela de edição).
- **Dinheiro exato**: string decimal em todo o caminho; na leitura, `toFixed(2)`
  antes de formatar, porque o `Decimal` do Prisma corta zeros à direita.
- **Sete tipos**, com `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` independentes
  (DEC-003). Só `VENDA` e `LOCACAO` carregam valor; nos outros cinco ele é `null`.

### Saldo histórico — `/admin/saldo-historico`

Somente `VENDA` e `AVALIACAO_GOOGLE`, com **no máximo uma linha por tipo**, garantida
por índice único. Criar, editar e excluir. `VENDA` exige quantidade e valor
positivos; `AVALIACAO_GOOGLE` exige quantidade e grava `valorTotal = 0.00`. O tipo de
um saldo cadastrado não muda.

**Ausência é diferente de zero**: um tipo sem linha aparece como "Não cadastrado",
nunca como `0`, e nenhuma linha zerada é criada automaticamente.

## Equipe histórica na edição de lançamento (Q7)

Aprovada pelo proprietário em 2026-08-12 e implementada. Registrada na DEC-034.

- **Corretor inalterado** — a equipe armazenada é preservada **literalmente**,
  qualquer que seja a equipe atual dele hoje. Corrigir valor, data ou observação
  nunca reescreve crédito de equipe.
- **Corretor trocado, equipe atual igual à armazenada** — preserva, sem perguntar.
- **Corretor trocado, equipes diferentes** — o sistema exige decisão entre
  **PRESERVAR** a equipe registrada ou **CORRIGIR** para a equipe atual do novo
  corretor. **Nenhuma terceira equipe** é escolhível.

O motivo é que o sistema **não guarda** o histórico de qual corretor esteve em qual
equipe em cada data; a equipe atual não prova qual era a verdadeira na data do
evento.

A equipe atual é **reconsultada no servidor** a cada submissão. Se ela mudar entre a
pergunta e a confirmação, a resposta anterior é recusada, nada é gravado e o conflito
é reapresentado com os dados atuais.

## Saldo histórico (Q8)

Aprovada pelo proprietário em 2026-08-12 e implementada. Registrada na DEC-035.

Saldo histórico é **saldo de abertura**. Só `VENDA` e `AVALIACAO_GOOGLE`, uma linha
por tipo. `VENDA` com quantidade > 0 e `valorTotal` > 0; `AVALIACAO_GOOGLE` com
quantidade > 0 e `valorTotal` = `0.00`.

Ele entra **somente nos big numbers acumulados** e **nunca** em recorte de período —
mês, trimestre, ano, quadro mensal ou ranking. Essa regra de cálculo é da F3
(DEC-004); nada na F2 soma saldo com lançamento.

## Rotas existentes

Dezessete páginas versionadas:

| Área | Rotas |
|---|---|
| Pública / autenticação | `/` (redireciona para `/admin`), `/login` |
| Administração | `/admin`, `/admin/equipes`, `/admin/equipes/novo`, `/admin/equipes/[id]/editar` |
| | `/admin/corretores`, `/admin/corretores/novo`, `/admin/corretores/[id]/editar` |
| | `/admin/lancamentos`, `/admin/lancamentos/novo`, `/admin/lancamentos/[id]/editar` |
| | `/admin/saldo-historico`, `/admin/saldo-historico/novo`, `/admin/saldo-historico/[id]/editar` |
| Painel | `/painel/[token]` (esqueleto), `/preview` (protótipo com dados fictícios) |

Não existe `src/app/api/` — nenhuma Route Handler foi criada.

## Migrations

Duas migrations versionadas:

1. `20260811014943_inicial` — cinco tabelas e o enum `tipo_lancamento`.
2. `20260812120000_saldo_historico_tipo_unico` — troca o índice simples de
   `saldo_historico.tipo` por um índice **único**. Estrutural: nenhuma coluna,
   tabela, trigger ou dado.

> **A segunda migration foi testada e aplicada somente no `casalouzada_test`.** Ela
> está versionada no Git, e publicar no Git **não é** aplicar em produção. Antes de
> ativar em produção a versão correspondente, ela precisa ser aplicada lá com gate
> apropriado. Ver Pendências.

## Testes

Cada baseline é o snapshot de uma entrega: vale como registro do que foi medido
naquele gate, e não como promessa de estabilidade futura. Ficam os quatro, em
sequência.

### Baseline do fechamento da F2.5

Verificado no gate de publicação da F2.5 — são as contagens **daquele** momento, não
a contagem atual:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 168 testes, 44 suítes, 0 falhas |
| `npm run test:fusos` | 504 aprovações (3 × 168), 0 falhas |
| `npm run test:integracao` | 88 testes, 33 suítes, 0 falhas |

### Baseline da entrega da F3.1

Medido durante a F3.1, snapshot intermediário entre a F2.5 e a F3.2:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 188 testes, 49 suítes, 188 aprovados, 0 falhas, 0 pulados |
| `npm run test:fusos` | 188/188 em `UTC`, 188/188 em `America/Sao_Paulo`, 188/188 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `tests/datas.test.ts` isolado | 30 testes, 30 aprovados, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |

Os 20 testes e 5 suítes que separam esse baseline do da F2.5 são os da F3.1, todos em
`tests/datas.test.ts`.

### Baseline da entrega da F3.2

Bateria completa executada sobre a árvore da F3.2, **antes** da microcorreção textual
final:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 266 testes, 70 suítes, 266 aprovados, 0 falhas, 0 pulados |
| `npm run test:fusos` | 266/266 em `UTC`, 266/266 em `America/Sao_Paulo`, 266/266 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `tests/metricas.test.ts` isolado | 78 testes, 21 suítes, 78 aprovados, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | 18 rotas, exit 0 |
| `git diff --check` | exit 0 |

Os 78 testes de `metricas.test.ts` são 38 da F3.2A mais 40 da F3.2B.

#### Verificação pós-microcorreção textual

Depois dessa bateria houve uma microcorreção que alterou **dois comentários** em
`src/lib/metricas.ts` e **o título de um teste** — zero lógica, zero assertions. Sobre
a árvore final foram executados apenas:

| Comando | Resultado verificado |
|---|---|
| `tests/metricas.test.ts` isolado | 78 testes, 78 aprovados, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `git diff --check` | exit 0 |

A bateria completa **não** foi repetida depois da microcorreção; o que consta acima é
o que de fato rodou.

### Baseline da entrega da F3.3

Bateria completa executada sobre a árvore que veio a ser publicada em `9ec8439`,
**antes** do commit. Ela **não** foi repetida depois do commit — o commit não alterou
nenhum byte da árvore medida, o que os blobs staged comprovaram:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 289 testes, 82 suítes, 289 aprovados, 0 falhas, 0 pulados |
| `npm run test:fusos` | 289/289 em `UTC`, 289/289 em `America/Sao_Paulo`, 289/289 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `npm run test:integracao:painel` | 15 testes, 6 suítes, 15 aprovados, 0 falhas, 0 pulados |
| `tests/metricas-prisma.test.ts` isolado | 23 testes, 12 suítes, 23 aprovados, 0 falhas, 0 pulados |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | 18 rotas, exit 0 |
| `git diff --check` | exit 0 |

Os 23 testes e 12 suítes que separam este baseline do da F3.2 são os de
`tests/metricas-prisma.test.ts`. A integração existente permaneceu em 88/33: a F3.3
não tocou em nenhuma suíte anterior.

`npm test` é rápido e não toca banco. `test:fusos` roda a suíte unitária em `UTC`,
`America/Sao_Paulo` e `Asia/Tokyo`, para provar que nenhum teste depende do relógio
da máquina. `test:integracao` roda contra o banco local.

`test:integracao:painel` é separado de propósito, num diretório próprio que os globs
existentes não alcançam: `obterMetricasPainel` lê as tabelas **inteiras**, então
fixture de outra suíte entraria nas contas. A suíte exige o banco em repouso antes de
começar e falha alto se não estiver, em vez de limpar dado que não é seu. **As duas
suítes de integração nunca devem rodar em paralelo.** Destino local validado nas duas:
`127.0.0.1:5432/casalouzada_test`.

## Banco de teste

- PostgreSQL 17 **local**, database `casalouzada_test`, role `casalouzada_test` com
  **`NOCREATEDB`**.
- A connection string vive só em `.env.test.local`, ignorado pelo Git.
- `tests/helpers/banco-teste.ts` exige, antes de conectar: protocolo PostgreSQL, host
  local, database e role esperados. Erro de leitura nunca repassa o valor lido.
- Toda operação destrutiva de teste roda exclusivamente ali.
- Como a role não pode criar shadow database, `prisma migrate dev` não funciona. A
  migration da F2.5 foi gerada por `prisma migrate diff` e aplicada com
  `prisma migrate deploy`. **Foi decisão manter a role restrita** em vez de conceder
  `CREATEDB`.

## Segurança e credenciais

O histórico aqui tem duas partes, e a segunda não está encerrada.

**Depois da F1**, todas as credenciais foram rotacionadas fora do Git — banco,
`DATABASE_URL`, `DIRECT_URL`, `PAINEL_TOKEN`, `AUTH_SECRET` e a senha
administrativa —, com cada revogação comprovada por teste.

**Depois disso, durante a P1**, uma credencial do banco de produção foi **exposta
acidentalmente em transcript** por um erro de tratamento de erro. Estado atual:

- não há evidência de que essa credencial tenha sido versionada no Git em momento
  algum;
- **ela ainda não foi rotacionada**;
- em 2026-08-12 o proprietário **aceitou explicitamente o risco** e autorizou seguir
  com o desenvolvimento;
- isso não bloqueia mais o trabalho, mas **continua sendo pendência operacional**.

Não se pode dizer que a situação de credenciais esteja saneada hoje.

## O que ainda NÃO está implementado

Verificado na árvore em `9ec8439`, arquivo por arquivo.

**"F3.3 concluída" não significa "painel pronto".** A leitura existe, mas nada dela
chega à tela ainda. O que continua não existindo:

- shape de apresentação — formatação de moeda, `—`, `mi`/`bi`, rótulos;
- tradução visual dos estados: `INDISPONIVEL`, `SEM_DADOS`, `SEM_SALDO_HISTORICO` e
  `CONFIGURACAO_INVALIDA` existem como domínio, mas nada os transforma em `—` ou em
  mensagem na tela;
- ligação de `/painel/[token]` aos dados reais;
- substituição do mock pela origem real;
- refresh automático real;
- retenção do último valor conhecido em queda de rede;
- comportamento offline / modo TV.

| Item | Estado | Fase |
|---|---|---|
| `src/lib/metricas.ts` | **existe** — núcleo puro, sem leitura | F3.2 feita |
| `src/lib/metricas-prisma.ts` | **existe** — leitura Prisma e conversão para domínio | F3.3 feita |
| `obterMetricasPainel(prisma, agora?)` | **existe** (DEC-041) | F3.3 feita |
| `EstadoLeitura` / `INDISPONIVEL` | **existe** no contrato de leitura (DEC-042) | F3.3 feita |
| Big numbers reais | calculados a partir do banco; sem apresentação | F3.4/F3.5 |
| Períodos reais (mês, trimestre, ano) | calculados a partir do banco; sem apresentação | F3.4/F3.5 |
| Rankings ligados ao banco | calculados a partir do banco; sem apresentação | F3.4/F3.5 |
| Shape de apresentação | ausente | F3.4 |
| Troca do mock pela origem real | ausente — `/preview` ainda usa `src/lib/mock-painel.ts` | F3.5 |
| Atualização automática do painel real | ausente | F3.6 |
| Comportamento offline | ausente | F4 |
| Modo quiosque | ausente | F4 |
| Identidade aplicada ao painel real | ausente | F4 |
| `src/app/api/`, `src/components/ui/`, `src/styles/`, `public/marca/` | ausentes | F3/F4 |
| Tela de troca de senha | ausente — o mecanismo é `npm run db:trocar-senha-admin` | futura |
| Metas | ausente por decisão | fora da v1 |

`/painel/[token]` continua exibindo "Painel em construção" e **não consulta o banco**:
a fronteira existe, mas a rota não a chama.

## F3 — Painel

### F3.0 — decisões e contratos · concluída

Aprovadas pelo proprietário em 2026-08-12 e registradas nas **DEC-036 a DEC-042**.
**Durante aquela fatia, nenhuma linha de código de F3 foi escrita.** O que ficou
congelado:

**Acumulados e `dataCorte` (DEC-036).** Cada linha de `saldo_historico` é a fonte do
acumulado daquele tipo **até o próprio `dataCorte`, inclusive**:

```
acumulado(tipo) = saldo(tipo) + lançamentos(tipo) com dataReferencia > dataCorte(tipo)
```

O saldo `VENDA` alimenta imóveis vendidos **e** VGV acumulado, com o corte da linha
`VENDA`; o saldo `AVALIACAO_GOOGLE` alimenta a contagem de avaliações, com o corte
dele. Um lançamento anterior ao corte continua existindo e pode aparecer num recorte
por período — só não é somado de novo no acumulado. Isso **supera** a fórmula antiga
do `PLANO.md` §4, já corrigida lá.

**Saldo ausente (DEC-037).** Sem linha de saldo para o tipo, o big number é
**indisponível** (`—`), nunca zero e nunca "só os lançamentos". Vale apenas para os
acumulados.

**Ranking e transferência (DEC-038).** Crédito sempre por `Lancamento.equipeId`. O
elenco mensal de uma equipe é a união dos corretores ativos lotados nela hoje com os
corretores ativos que tenham lançamento do mês creditado a ela. Um corretor
transferido no meio do mês **aparece nos dois quadros**, cada um com a produção
daquele contexto — não há duplicação de evento. Inativo não aparece em ranking, mas
seus eventos continuam nos totais.

**Ausência mensal (DEC-039).** Mês sem **nenhum** lançamento → `SEM_DADOS`, e a
apresentação usa `—` em vez de afirmar zero. Com pelo menos um lançamento, a janela é
`OK` e zeros dentro dela são zeros reais. É regra conservadora de apresentação, não
inferência estatística.

> **Limitação conhecida e aceita:** o sistema **não distingue alimentação parcial**.
> Propostas cadastradas e nenhuma avaliação pode ser zero real ou avaliação ainda não
> lançada. O schema não tem "mês fechado" nem status de preenchimento, e isso não
> será inventado.

**Três equipes ativas (DEC-040).** O painel v1 exige **exatamente três**. Fora disso,
a área dos quadros entra em `CONFIGURACAO_INVALIDA` — sem escolher as três primeiras,
sem descartar equipe, sem redistribuir grid. Big numbers e VGV por período continuam
sendo exibidos se suas leituras forem válidas.

**Cliente Prisma injetado (DEC-041).** A camada recebe o `PrismaClient` por
parâmetro — `obterMetricasPainel(prisma, agora?)` — em vez de importar o singleton de
`src/lib/db.ts`, que aponta para produção. Assim a integração exercita a mesma camada
com `criarPrismaTeste()`.

**Estados separados (DEC-042).** Quatro dimensões independentes, não um enum único:
leitura (`OK` / `INDISPONIVEL`), período (`OK` / `SEM_DADOS`), acumulado (`OK` /
`SEM_SALDO_HISTORICO`) e área de equipes (`OK` / `CONFIGURACAO_INVALIDA`). Cada uma
afeta só o seu escopo: `INDISPONIVEL` nunca vira zero, faltar saldo de `VENDA` não
invalida avaliações, `SEM_DADOS` mensal não apaga big numbers, e
`CONFIGURACAO_INVALIDA` não apaga o que puder ser calculado corretamente.

### Contratos de cálculo já fixados

**VGV por período** — mensal, trimestral e anual usam **somente**
`Lancamento.tipo = VENDA` e `sum(Lancamento.valor)` dentro da janela civil. Saldo
histórico e `dataCorte`: participação **zero**.

**Quadro mensal** — sete linhas, na ordem: `VENDA`, `LOCACAO`, `CAPTACAO_VENDA`,
`CAPTACAO_EXCLUSIVA`, `CAPTACAO_LOCACAO`, `PROPOSTA`, `AVALIACAO_GOOGLE`. VGV **não**
aparece aqui, e as duas captações seguem independentes (DEC-003).

**Rankings** — oito métricas, na ordem do protótipo: vendidos, VGV, locados, captação
de venda, exclusivas, captação de locação, propostas, avaliações (DEC-033). Fonte: os
lançamentos do mês, agrupados por `Lancamento.equipeId`. Sete usam `count`; VGV usa
`sum(valor)`. Ordenação por resultado decrescente, desempate por `nomeExibicao` em
pt-BR crescente e, persistindo, por `id` crescente — para a ordem ser determinística
entre atualizações.

### Sem migration

As decisões da F3.0 são implementáveis sobre o schema atual. **A F3, no desenho
atual, não exige migration**, e a F3.1 confirmou isso na prática: não tocou
`prisma/schema.prisma` nem `prisma/migrations/`. (A migration da F2.5 continua
pendente de aplicação em produção, mas isso é outro gate — ver Pendências.)

### F3.1 — janelas civis · concluída

Publicada em `592df35`, alterando apenas `src/lib/datas.ts` e `tests/datas.test.ts`.
Entregou os **limites** dos recortes de período, nada além disso:

| Símbolo | O que devolve |
|---|---|
| `JanelaCivil` | `{ inicio, fimExclusivo }` — intervalo semiaberto `[inicio, fimExclusivo)` |
| `mesCorrente(agora?)` | mês civil corrente em São Paulo |
| `trimestreCorrente(agora?)` | trimestre civil fixo: Q1 jan–mar, Q2 abr–jun, Q3 jul–set, Q4 out–dez |
| `anoCorrente(agora?)` | ano civil corrente |

Os dois limites são datas civis ancoradas na **meia-noite UTC**, como o resto do
módulo. Qual período é o corrente se decide por `hojeEmSaoPaulo`; depois disso o fuso
da máquina não interfere, o que a suíte prova rodando em três fusos.

Desde a F3.2, `src/lib/metricas.ts` consome essas janelas.

### F3.2 — núcleo puro de métricas · concluída

Publicada em dois commits, ambos só em `src/lib/metricas.ts` e
`tests/metricas.test.ts`. O módulo tem um único import — `@/lib/datas` — e nenhuma
linha de Prisma, banco, `process.env` ou React.

**F3.2A — empresa (`6cf0627`)**, por `calcularMetricasEmpresa(lancamentos, saldos, agora?)`:

- `EstadoPeriodo` (`OK` / `SEM_DADOS`) e `EstadoAcumulado` (`OK` / `SEM_SALDO_HISTORICO`);
- acumulados de imóveis vendidos, VGV e avaliações, cada um somando o saldo com os
  lançamentos de `dataReferencia > dataCorte` — o `>` é o corte inclusivo da DEC-036, e
  cada tipo usa o `dataCorte` da própria linha;
- sem saldo do tipo, o acumulado vem `SEM_SALDO_HISTORICO` com valor `null`, nunca zero;
- VGV mensal, trimestral e anual, só `VENDA`, sem participação de saldo;
- quadro mensal com os sete tipos, sem VGV, com `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA`
  independentes (DEC-003);
- dinheiro exato: string decimal canônica na fronteira, `bigint` de centavos na soma.

**F3.2B — equipes e rankings (`8ec6cbc`)**, por
`calcularMetricasEquipes(lancamentos, corretores, equipes, agora?)`:

- `EstadoEquipes` (`OK` / `CONFIGURACAO_INVALIDA`), exigindo **exatamente três** equipes
  ativas; fora disso a lista de equipes volta vazia, para não renderizar subconjunto;
- elenco mensal como união dos ativos lotados hoje na equipe com os ativos que
  produziram para ela no mês (DEC-038);
- corretor transferido aparece nos dois quadros, cada um só com a produção creditada
  àquela equipe — o crédito é sempre `Lancamento.equipeId`, nunca a lotação atual;
- corretor inativo não aparece em ranking nenhum, e seus eventos continuam nos totais
  da empresa;
- `totalCorretores` é o headcount ativo **atual**, não o tamanho do elenco do mês;
- oito rankings na ordem do protótipo (DEC-033), sete por contagem e o VGV por soma
  exata em centavos;
- desempate determinístico: resultado decrescente, `nomeExibicao` em pt-BR crescente,
  `id` crescente.

### F3.3 — leitura Prisma · concluída

Publicada em `9ec8439`, criando `src/lib/metricas-prisma.ts` e duas suítes, e
alterando de `package.json` apenas o script `test:integracao:painel`. **Nenhuma linha
de `src/lib/metricas.ts` foi tocada** — a fronteira vive fora do núcleo (DEC-013).

- entrada única: `obterMetricasPainel(prisma, agora?)`, com o `PrismaClient` por
  parâmetro (DEC-041) — o singleton de `src/lib/db.ts` não é importado;
- `EstadoLeitura` (`OK` / `INDISPONIVEL`) — a quarta dimensão da DEC-042;
- o resultado tem três blocos independentes: `empresa.periodos`,
  `empresa.acumulados` e `equipes`. No ramo `INDISPONIVEL` a propriedade `dados`
  **não existe**, em vez de vir nula;
- quatro `findMany` sob `Promise.allSettled` — não transaction, não `Promise.all` —,
  porque conhecer sucesso e falha de cada leitura é o que permite sucesso parcial;
- dependências: períodos ← lançamentos; acumulados ← lançamentos + saldo histórico;
  equipes ← lançamentos + corretores + equipes;
- **falha de saldo histórico não apaga os períodos**: o VGV mensal, trimestral e anual
  e o quadro mensal continuam corretos e exibíveis;
- erro de domínio **propaga**: uma `VENDA` relevante sem valor lança do núcleo e a
  exceção escapa, em vez de virar `INDISPONIVEL` — falha de leitura e dado corrompido
  não podem ter a mesma cara na tela;
- dinheiro atravessa por `toFixed(2)`, como string decimal canônica; nada de `Number`,
  `parseFloat` ou `toNumber`;
- a leitura de saldo é restrita a `VENDA` e `AVALIACAO_GOOGLE` (DEC-035);
- um único `agora`, congelado antes das leituras e passado às duas funções puras;
- sem `groupBy`, `aggregate`, transaction ou `orderBy`: toda matemática e toda ordem
  determinística continuam no núcleo.

### Fatias seguintes

`F3.4` shape de apresentação e tipos fora do mock — **próxima** · `F3.5` painel real
ligado aos dados · `F3.6` atualização automática. Nenhuma iniciada.

### Fora da F3

O aviso administrativo para lançamento anterior ao corte, cogitado no planejamento
técnico, **não é requisito da F3**. Fica como possível **F2.6 futura e opcional**;
não bloqueia a F3 e não reabre a F2 agora.

## Pendências

1. **Rotacionar a credencial de produção exposta na P1.** Risco aceito pelo
   proprietário, mas não resolvido.
2. **Aplicar a migration `20260812120000_saldo_historico_tipo_unico` em produção**
   antes de ativar lá a versão correspondente, com gate apropriado.
3. **F3.4 — shape de apresentação**: próxima fatia de implementação. A ligação de
   `/painel/[token]` aos dados reais vem depois, na F3.5.
4. **F4 — Identidade e modo TV**: depende da F3.
5. **F2.6 — aviso de lançamento anterior ao corte**: opcional, não bloqueia nada.

Pendências de informação herdadas do plano, nenhuma bloqueante: número máximo de
corretores por equipe (dimensiona a altura dos quadros), valores iniciais do saldo
histórico e arquivos da marca em alta resolução.

## Bloqueios

Nenhum bloqueio estrutural conhecido.

## Divergências entre o repositório e o PLANO.md

O `PLANO.md` foi anotado onde divergia do código, sem ser reescrito:

1. **§3, `saldo_historico`** — o plano não restringia tipos; a Q8 restringiu a dois,
   com uma linha por tipo.
2. **§3, `usuarios`** — diz que a senha se troca pela área administrativa. Essa tela
   nunca existiu; o mecanismo real é `npm run db:trocar-senha-admin`.
3. **§5.2** — diz "7 métricas × 20 segundos" mas enumera oito. O protótipo e o port
   usam oito × 20s = 2min40s (DEC-033).
4. **§6** — pede Jost ou Outfit. O layout raiz, `/admin` e `/login` seguem com Geist;
   `/preview` usa Jost, restrita àquela rota. Aplicar ao painel real é F4.
5. **§8** — da estrutura prevista, `src/components/painel/`, `src/lib/metricas.ts` e
   `src/lib/datas.ts` eram citados, e os três existem hoje. Continuam ausentes
   `src/components/ui/`, `src/app/api/`, `src/styles/` e `public/marca/`.
6. **§7** — cita `github.com/<usuário>/dashboard-casalouzada`; o repositório hoje é
   concreto e público.

## Observações processuais

Registradas para quem auditar o histórico:

1. Durante a entrega de `c59be18` houve um `git commit --amend` local antes do
   primeiro push, embora a política daquela execução o proibisse. O remoto nunca
   recebeu o commit intermediário e não houve force push.
2. Na entrega de `22bf943` a mensagem do primeiro commit saiu corrompida por erro de
   sintaxe de shell. A correção foi um `git commit --amend` explicitamente
   autorizado, antes de qualquer push, com prova de que a *tree* e o *parent*
   permaneceram idênticos.
3. A F2.1 tinha um teste de integração que comparava contagens **globais** de
   corretores e lançamentos. Com quatro suítes concorrentes no mesmo banco, fixtures
   de outra suíte o faziam falhar sem que a operação sob teste tivesse tocado nada.
   Corrigido em `caa151f`: o teste passou a criar as próprias fixtures e a provar por
   releitura de cada id que `atualizadoEm` não mudou — afirmação mais forte do que o
   total ter permanecido igual.
