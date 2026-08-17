# Handoff Atual — Dashboard Casa Louzada

## Identificação

| Item | Valor |
|---|---|
| Repositório | `github.com/shumbertshuanys/dashboard-casalouzada` (público) |
| Branch | `main` |
| **Release executável em produção** | **`46432543f322076d2c9b4b69eb658a92fd796e82`** — deploy `dep-da1l5pu417fc73ek9llg`, **LIVE** desde **2026-08-17T18:31:11Z**. **Este é o único SHA fixo desta tabela**, e ele só muda quando houver um deploy novo. |
| Release anterior | `630e336d56e15f5a2986b9212588a17aec8476c5`, deploy `dep-da1j42m417fc73ajgu00` — **`deactivated`**, substituído em 2026-08-17T18:31Z. Foi ele que publicou o microajuste de precisão (DEC-069), e continua citado adiante como **histórico**. Antes dele, `ed1c29f…` (`dep-da13bts9v7es73ag89pg`) publicou a Celebração de Venda; também **deactivated**. **Nenhum dos dois é o que roda.** |
| Estado do Git | A `main` contém, além de commits documentais, **o commit de código `8382074`** — a feature de VGV histórico mensal —, todos posteriores ao release executável. O SHA **corrente** dela **não é registrado aqui de propósito** — consulte `git rev-parse main` ou o GitHub. Um SHA de topo escrito neste documento se autoinvalida no próximo commit de documentação, que foi exatamente o defeito que esta linha existe para não repetir. (`8382074` é seguro de citar: é o commit da feature, e ele não se move.) |
| ✅ **`main` e produção voltaram a ser equivalentes** | A feature de **VGV histórico mensal** (DEC-070) foi **publicada** em 2026-08-17T18:31Z. Entre 8382074 e esse deploy houve algumas horas de **divergência executável** — a primeira do projeto —, e ela está encerrada. O que vier depois de `46432543` na `main` volta a ser documentação, até o próximo commit de código. |
| **Migrations em produção** | **9 aplicadas.** A nona, `20260817170000_vgv_historico_mensal`, entrou no pre-deploy de `46432543` — `prisma migrate deploy` encontrou 9 no repositório e aplicou exatamente essa. |
| ⚠️ **Trabalho local não commitado** | A **rotação das listas operacionais** (DEC-071) existe **apenas na working tree**, sobre `982c482` — 13 arquivos modificados e 1 novo (`tests/faixa-superior-ui.test.ts`), somando os 14 caminhos da feature e da documentação. Não está na `main`, não está em produção e não tem SHA. Ver a seção própria adiante. |
| ℹ️ **Auto-deploy continua OFF** | Push para `main` **não** é deploy: publicar exige disparo manual. *(Foi isso que criou a janela de divergência executável entre o fast-forward de `8382074` e o deploy de `46432543`, no mesmo dia — registro do que aconteceu, não pendência.)* |
| **URL pública** | `https://dashboard-casalouzada.onrender.com` |
| **URL do painel (TV)** | `https://dashboard-casalouzada.onrender.com/painel/<TOKEN>` — token nunca publicado |
| Data do handoff | 2026-08-17 |
| Go-live original da v1 | `adabe2dfe8f442826fa9006aa12c10ab248c83b6`, em 2026-08-14 (histórico) |

## Estado executivo

> ### ✅ F4 ENCERRADA — A v1 ESTÁ OPERACIONAL NA TV FÍSICA
>
> **Nenhuma fase técnica obrigatória de F1 a F4 permanece aberta.** A v1 está
> **implementada**, **em produção** e **operacional na TV física do escritório**.
>
> A **F4.5E — gate físico final — passou**, e com ela fecharam a **F4.5** e a **F4**. A
> plataforma definitiva da v1 é a **Samsung Smart TV do escritório**, com o painel aberto
> direto no navegador nativo dela (recurso "Serviço da Web" / PC on TV) e **sem nenhum
> hardware externo** (DEC-068).
>
> **PENDÊNCIA OPERACIONAL: O2 — completar o saldo histórico de `VENDA`** quando os dados
> forem fornecidos pelo proprietário. Enquanto a linha não existir, imóveis vendidos e VGV
> acumulado seguem em `—`. **Isso não é bug**: é ausência de dado, que o sistema afirma em
> vez de inventar zero (DEC-014, DEC-037). Só o proprietário tem os números de abertura.
>
> ⚠️ **O2 — reconciliação operacional pendente.** Existe **evidência operacional posterior
> incompatível** com a afirmação acima. No diagnóstico do VGV de 2026-08-17 o caso
> observado partia de um saldo histórico de `VENDA` **cadastrado**, com
> `dataCorte = 31/07/2026`, e o big number exibindo um valor na casa das centenas de
> milhão. Isso é conclusivo pelo código: sem linha de `VENDA` em `saldo_historico`,
> `acumulados.vgv` seria `SEM_SALDO_HISTORICO` e a TV renderizaria `—`, **nunca um número**.
> Um valor exibido só é possível com a linha presente.
>
> **A O2 não é declarada concluída aqui**, porque isso exige um `SELECT` real em produção
> que ainda não foi feito — nenhum ciclo recente acessou o banco de produção. Até lá, o
> estado correto desta etapa é **indeterminado**, e as demais menções à O2 neste documento
> e no `PLANO.md` devem ser lidas com esta ressalva.
>
> A **F5 — Refinamentos** continua **futura** e **não foi iniciada**.

## Rotação das listas operacionais — IMPLEMENTADA LOCALMENTE, NÃO PUBLICADA

Ciclo mais recente do projeto, e o **único que ainda não está commitado**. A decisão
durável é a **DEC-071**.

> **Estado.** **NÃO publicada e NÃO commitada.** O trabalho existe apenas na working tree
> local, sobre `982c482`. Produção continua em `46432543` (ver a tabela de identificação),
> que **não** contém esta alteração.

**O defeito.** A Tela B mostra até três propostas em andamento e até três reservas de
locação. O teto de três era aplicado **duas vezes antes da tela**: `src/lib/metricas.ts`
cortava com `.slice(0, 3)`, e o guard de `src/lib/contrato-atualizacao-painel.ts` recusava
payload operacional com mais de três itens. O resultado é que, existindo 4, 5, 7 ou mais
registros elegíveis, **só os três mais recentes sobreviviam** — e como `AGUARDANDO` e
`ATIVA` só mudam por ação humana, os demais ficavam **eternamente invisíveis** na parede
enquanto os três da frente continuassem em aberto.

**ANTES.** Apenas os três mais recentes sobreviviam ao núcleo e ao contrato. O quarto item
não chegava à apresentação.

**DEPOIS.** Todas as elegíveis chegam à apresentação, e a Tela B percorre páginas de até
três a cada aparição:

- propostas elegíveis = **todas** com status `AGUARDANDO`; reservas = **todas** com `ATIVA`;
- o núcleo filtra e ordena, e **não** limita quantidade;
- o contrato de atualização aceita a lista inteira;
- a interface mostra uma janela de até 3 e avança na entrada `A → B`;
- propostas e reservas giram **independentemente** — 7 propostas fecham a volta em três
  aparições, 5 reservas em duas;
- a última página **não** repete itens para completar três (7 itens → 3 / 3 / 1);
- depois da última página, volta à primeira;
- refresh de dados **não** reinicia a rotação nem remonta o timer;
- o intervalo A/B permanece **20 segundos**;
- **nenhuma regra de status mudou**.

**O que NÃO mudou.** Nenhum status, nenhuma ordenação, nenhum número, contagem, soma,
ranking ou recorte de período. Sem migration, sem schema, sem alteração de dado, sem Admin.
Mudou **onde** o corte acontece, não o que é elegível para entrar na lista.

**Arquivos (14 caminhos, nenhum commitado):**

| Origem | Caminhos |
|---|---|
| Núcleo e contrato | `src/lib/metricas.ts`, `src/lib/contrato-atualizacao-painel.ts` |
| Componentes | `src/components/painel/rotacao-faixa.ts`, `faixa-superior.tsx`, `faixa-operacional.tsx` |
| Testes alterados | `tests/destaques-operacionais.test.ts`, `tests/contrato-atualizacao-painel.test.ts`, `tests/metricas-prisma.test.ts`, `tests/integracao-painel/leitura-painel.integracao.test.ts`, `tests/integracao-painel/painel.integracao.test.ts` |
| Teste novo | `tests/faixa-superior-ui.test.ts` |
| Documentação | `docs/DECISOES.md`, `docs/HANDOFF_ATUAL.md`, `PLANO.md` |

**Gates finais — os seis verdes, no mesmo ambiente:**

| Gate | Resultado |
|---|---|
| `npm test` | **872 testes · 196 suítes · 872 PASS · 0 fail** |
| `npm run test:integracao` | **208 testes · 76 suítes · 208 PASS · 0 fail · 0 skipped · 0 cancelled** |
| `npm run test:integracao:painel` | **55 testes · 15 suítes · 55 PASS · 0 fail · 0 skipped · 0 cancelled** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `git diff --check` | exit 0 |

Os testes da semântica nova foram escritos **antes** da implementação e observados falhando
pela razão esperada.

**Como os gates chegaram ao verde — o histórico importa.** As integrações **não** passaram
de primeira, e o caminho até aqui é parte do registro:

1. **as duas integrações ficaram bloqueadas** por falha do PostgreSQL local. O servidor
   aceitava a conexão e derrubava o backend em seguida — `Server has closed the connection`
   / `Unable to start a transaction in the given time` —, com a queda no **setup**
   (`exigirRepouso`), antes de qualquer asserção de domínio. A mesma falha foi reproduzida
   com o diff guardado por `git stash`, em HEAD limpo (14 pass, 1 fail, 40 cancelled), o
   que caracterizou falha ambiental **pré-existente**, não regressão do ciclo. Enquanto
   durou, o estado correto foi **NÃO VERIFICADA** — nunca PASS;
2. **o cluster de teste da porta 5433 foi recuperado.** Ele é um cluster efêmero, e o
   `pg_ctl` contra o próprio data dir dele bastou: `stop -m fast` não derrubou em 60 s
   (servidor travado), e o `start` seguinte subiu um postmaster novo. Nenhum `initdb`,
   nenhum `db push`, nenhuma migration tocada. `prisma migrate status` confirmou em
   seguida **9 migrations** e `Database schema is up to date!`. O PostgreSQL pessoal da
   porta **5432 não foi tocado** — ele não é o banco deste projeto;
3. **com o banco de pé, a integração painel revelou três expectativas antigas de "corte em
   três"** em `tests/integracao-painel/painel.integracao.test.ts` — arquivo que nunca
   chegou a falhar à vista enquanto o banco esteve fora, e por isso escapou da varredura
   dos ciclos anteriores. Não era regressão: os vizinhos de status (`ACEITA`/`REJEITADA`
   fora, `FINALIZADA`/`CANCELADA` fora) passaram, e os três primeiros itens vinham exatos e
   na mesma ordem — o único delta era o teto que a DEC-071 removeu;
4. **as três expectativas foram reconciliadas com a DEC-071**: as listas passam a esperar
   **todas** as elegíveis da fixture (5 propostas `AGUARDANDO`, terminando na legada sem
   imóvel; 4 reservas `ATIVA`), e o teste "param em três" virou "esta camada não pagina".
   As asserções de status **não** foram enfraquecidas;
5. **depois disso os seis gates fecharam verdes.**

**Pendências conhecidas, não bloqueantes e NÃO resolvidas:**

- `scripts/banco-teste.ts` imprime `destino: 127.0.0.1:5432/...` num rótulo, embora o
  datasource real seja **5433**. O rótulo é hardcoded e mentiroso, e foi ele que atrasou o
  diagnóstico do cluster. **Não corrigido** — não pertence à DEC-071;
- **flakiness de isolamento na integração geral.** Em duas execuções anteriores ao verde,
  `tests/integracao/vgv-historico.integracao.test.ts` (itens 8 e 10) falhou porque as
  contagens de `lancamentos`/`participacoes` mudaram **durante** o teste — arquivos rodando
  em paralelo escrevendo enquanto outro tira o retrato. **Não corrigido**, e uma execução
  limpa não prova ausência de corrida.

**O que ainda falta:** commitar, publicar e — se a rotação for observada na parede —
registrar a validação visual. Nada disso foi feito.

## VGV histórico mensal — PUBLICADO (release `46432543`)

Ciclo publicado mais recente. A decisão durável é a **DEC-070**.

> **Estado.** **PUBLICADA em produção.** Release `46432543`, deploy
> `dep-da1l5pu417fc73ek9llg`, **LIVE** desde **2026-08-17T18:31:11Z**.
>
> O desenvolvimento inteiro correu na branch **`feat/vgv-historico-mensal`**, onde nasceu o
> commit **`8382074`** com as sete etapas juntas. Ele foi levado para a `main` por
> **fast-forward** — sem merge commit, sem rebase, sem PR —, e a branch continua existindo
> apontando para ele. A publicação saiu de `46432543`, que é `8382074` mais a reconciliação
> documental daquele momento.
>
> **A migration `20260817170000_vgv_historico_mensal` foi aplicada com sucesso** no
> pre-deploy: `prisma migrate deploy` encontrou 9 migrations e aplicou exatamente essa,
> terminando em `Pre-deploy complete!`.
>
> **Nenhum dado real de jan–jul/2026 foi cadastrado.** A tabela existe e está vazia — vazia
> por construção, não por medição: a migration só cria estrutura, e nada inseriu nela. Ver a
> ressalva sobre `SELECT` logo abaixo. Cadastrar os sete valores é a etapa operacional
> **O3**, ainda pendente.

**O problema.** O escritório tem os **totais mensais consolidados** de janeiro a julho de
2026 e **não tem** as vendas individuais daquele período. Sem uma forma de registrar o
total, as duas saídas seriam ruins: digitar centenas de vendas inventadas — criando fato
comercial falso, com corretor e data arbitrários — ou deixar o VGV anual da TV afirmando
só o que foi lançado de agosto em diante, que é um número real e enganoso.

**A entidade.** `vgv_historico_mensal`: uma linha por competência, com `competencia`
(primeiro dia do mês), `valor_total` e `observacao`. Sem corretor, sem equipe, sem
participação, sem quantidade. Não é `Lancamento` e não é `SaldoHistorico` — a DEC-070
explica por que nenhum dos dois servia.

**Onde entra, e onde não entra:**

| Número | Recebe histórico mensal? |
|---|---|
| VGV **trimestral** e **anual** | **Sim** — é o único lugar |
| VGV mensal | Não — só VENDA real do mês corrente |
| Big numbers acumulados (Vendidos, VGV acumulado, Avaliações) | Não — continuam só de `saldo_historico` |
| Quadro mensal | Não |
| Rankings, VGV de corretor, VGV de equipe | Não — `calcularMetricasEquipes` sequer recebe o parâmetro |

**A regra que importa.** Uma competência cadastrada **substitui o mês inteiro** no
trimestral e no anual: se julho tem agregado, nenhuma venda de julho soma individualmente
ali, sejam uma ou cem. As mesmas vendas continuam inteiras em Vendidos, no quadro mensal e
em todo ranking — cobertura é recorte agregado da empresa, nunca crédito individual.

**Defesa de domínio.** O Admin recusa competência do mês corrente ou futura; o núcleo
**ignora** a que aparecer assim, sem lançar. Ignorar significa que o mês não fica coberto,
então as vendas reais dele continuam somando: uma linha inválida nunca apaga fato
comercial.

**Política de falha.** Se a leitura de `vgv_historico_mensal` falhar, `empresa.periodos`
fica `INDISPONIVEL` — **sem fallback para lista vazia**, porque o trimestral e o anual
sairiam com um número plausível e errado. Acumulados, equipes, propostas e reservas não
caem junto.

**Migration `20260817170000_vgv_historico_mensal`** — aditiva, verificada contra
PostgreSQL local real: índice único de `competencia`, `CHECK` de dia 1, `CHECK` de
`valor_total > 0`, RLS ligado sem policy com `REVOKE` de `anon`/`authenticated`
(DEC-058), e grants de runtime `SELECT/INSERT/UPDATE/DELETE` com prova negativa de
`TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` (DEC-061). As onze provas SQL passaram.

**Admin** em `/admin/vgv-historico`: listar por competência decrescente, cadastrar, editar
valor e observação, excluir. Competência **imutável** na edição. A tela informa quantas
vendas reais existem na competência — **informação, nunca bloqueio**.

**Uso previsto.** Preencher jan–jul/2026 com os sete VGVs consolidados, que o proprietário
informará **depois da publicação**. **Agosto/2026 em diante segue por lançamentos reais.**
Os valores não estão no código.

**Venda retroativa em mês coberto** é sempre registrável e **não obriga** editar o
agregado. O agregado só se retifica quando a fonte consolidada original não contemplava
aquela venda (DEC-070).

**Etapas e artefatos:**

| Etapa | Entrega | Arquivos |
|---|---|---|
| **E1** | schema + migration, provados contra PostgreSQL local | `prisma/schema.prisma`, `prisma/migrations/20260817170000_vgv_historico_mensal/` |
| **E2** | validação de domínio | `src/lib/validacao/vgv-historico-mensal.ts`, `tests/validacao-vgv-historico-mensal.test.ts` |
| **E3** | núcleo puro (cobertura e anti-dupla-contagem) | `src/lib/metricas.ts`, `tests/metricas.test.ts` (+ adaptação mecânica de assinatura em `tests/venda-compartilhada.test.ts`) |
| **E4** | leitura Prisma e política de falha | `src/lib/metricas-prisma.ts`, `tests/metricas-prisma.test.ts`, `tests/integracao-painel/painel.integracao.test.ts` |
| **E5** | Admin mínimo | `src/app/admin/vgv-historico/**`, `src/app/admin/layout.tsx`, `tests/integracao/vgv-historico.integracao.test.ts` |
| **E6/E7** | gates finais e documentação | `docs/DECISOES.md` (DEC-070), `docs/HANDOFF_ATUAL.md`, `PLANO.md` |

**Gates ao fim da E7:** `npm test` **844/844**; `npm run test:integracao` **208/208**;
`npm run test:integracao:painel` **55/55**; `tsc --noEmit` exit 0; `lint` exit 0;
`git diff --check` exit 0. Em cada etapa os testes foram escritos **antes** da
implementação e observados falhando pela razão esperada.

**Verificações pós-deploy (HTTP real, read-only):** `/` → 307 `/admin`; `/login` → 200;
`/admin` → 307 login; `/admin/vgv-historico` e `/admin/vgv-historico/novo` → 307 login, com
a guarda administrativa ativa; `/painel/<token-inválido>` e `.../celebracao` → 404;
`/preview` → 200. Startup sem stack trace (`✓ Ready in 474ms`).

**Prova de que a build nova está servida**, além do status do Render: o manifesto de rotas
do build lista `/admin/vgv-historico`, `/admin/vgv-historico/novo` e
`/admin/vgv-historico/[id]/editar` — rotas que não existiam no build de `630e336`. O
redirect sozinho não serviria de prova, porque a guarda age antes da resolução da rota.

> ⚠️ **O que NÃO foi medido.** Nenhum `SELECT` direto foi executado no banco de produção
> neste ciclo: não há canal read-only autorizado no ambiente, e improvisar acesso está fora
> de política. Portanto **não se afirma** ter medido `count(*)`, RLS, policies ou ACL em
> produção. O que sustenta o estado é indireto e explícito: a migration aplicou com sucesso
> (e as provas embutidas nela abortariam o pre-deploy se RLS, policy, ownership ou grants
> estivessem errados), o startup subiu sem erro de `relation`/`permission`, e nada neste
> ciclo inseriu dado.

**O que ainda falta:** **O3** — cadastrar os sete valores reais pelo Admin, com os números
que o proprietário fornecer. Nenhum é inventado.

## Microajuste de precisão do VGV — PUBLICADO (release `630e336`)

Último ciclo publicado, e o mais recente do projeto. A decisão durável é a **DEC-069**.

**O defeito.** A partir de `R$ 100 milhões` a compactação monetária largava a casa
decimal, e a resolução da parede virava **um milhão inteiro**: `100.000.000,00` e
`100.450.000,00` saíam os dois como `R$ 100 mi`. Como o **VGV acumulado** é o único número
da tela que cresce por soma lenta — saldo histórico mais as vendas posteriores ao corte
(DEC-036) —, uma venda real de algumas centenas de milhares somava certo no núcleo e
**sumia na exibição**, e o painel parecia travado no saldo histórico.

**O ajuste.** A unidade `mi` passa a conservar **uma casa decimal em qualquer magnitude**
(`R$ 100,0 mi`, `R$ 100,1 mi`, `R$ 431,0 mi`). A unidade `bi` **preserva a política
anterior** — uma casa abaixo de 100 na unidade, nenhuma de 100 para cima. A promoção
`mi → bi` passa a ocorrer quando o arredondamento alcançaria `1000,0 mi`, e não mais em
999,5 mi, que agora é exibível como tal; o invariante "a tela nunca mostra `1000 mi`"
continua valendo.

**O que NÃO mudou.** A mudança é **exclusivamente de apresentação**. A aritmética
monetária segue em `bigint` exato, sem `Number` nem ponto flutuante; `src/lib/metricas.ts`
e `src/lib/metricas-prisma.ts` **não foram tocados** — nenhuma fórmula, filtro, janela ou
regra de `dataCorte`. **Sem migration, sem schema, sem alteração de dado.** O pre-deploy
confirmou: `8 migrations found` · `No pending migrations to apply.`

**Diagnóstico que originou o ciclo.** A cadeia
`saldo histórico → metricas → metricas-prisma → apresentação → componente` foi reproduzida
ponta a ponta e mostrou o valor **correto no núcleo** (`100000000.00 + 5000000.00 =
105000000.00`), com a perda ocorrendo **só na compactação visual**. Nenhum defeito de
cálculo foi encontrado, e nenhum foi corrigido.

**Publicação.** Release **`630e336d56e15f5a2986b9212588a17aec8476c5`**, deploy
**`dep-da1j42m417fc73ajgu00`**, live de **2026-08-17T16:10:30Z** até **18:31:11Z**, quando o
release `46432543` o substituiu. Auto-deploy continua **OFF**; nenhuma configuração do
serviço foi alterada.

*(O microajuste continua em produção: o release novo não o alterou — o que mudou é qual
deploy o serve.)*

**Gates registrados antes da publicação:** `npm test` **773/773**, `npx tsc --noEmit`
exit 0, `npm run lint` exit 0, `git diff --check` exit 0. Os testes da nova política foram
escritos **antes** da implementação e observados falhando pela razão esperada.

**Verificações pós-deploy (HTTP real, read-only):** `/` → 307 `/admin`; `/login` → 200;
`/admin` → 307 `/login?proximo=%2Fadmin`; `/painel/<token-inválido>` → 404;
`/painel/<token-inválido>/celebracao` → 404; `/preview` → 200. O HTML de `/preview`
servido contém `431,0` e `128,0`, o que comprova que **a build nova é a que está no ar**.
Logs de startup sem erro (`✓ Ready in 395ms`).

**Limitações deste ciclo — o que NÃO foi provado:**

- **integração local NÃO aprovada**: o PostgreSQL de teste em `127.0.0.1:5433` esteve
  indisponível durante todo o ciclo, e `npm run test:integracao:painel` **não pôde ser
  executado**. Isso **não** é PASS, e não deve ser convertido em um;
- **a Samsung física NÃO foi revalidada** depois deste microajuste. O gate visual da
  DEC-068 é anterior e não retroage a esta mudança. Ninguém observou a nova precisão na
  parede do escritório;
- o que está comprovado é que a **build nova está sendo servida** — não que alguém a viu
  na TV.

## Celebração de Venda — IMPLEMENTADA E EM PRODUÇÃO

Feature de integração da equipe, entregue depois da v1: ao fechar uma venda, a TV do
escritório anuncia quem vendeu por cerca de dez segundos e volta ao dashboard. A
decisão durável é a **DEC-067**; o resumo de produto está no `PLANO.md`.

**O invariante que sustenta tudo:** a celebração é **evento de UX, nunca dado
comercial**. Ela não entra em métrica, VGV, ranking, contagem, saldo ou período.
`src/lib/metricas.ts`, `src/lib/metricas-prisma.ts`, `src/lib/leitura-painel.ts` e a
rota `/painel/[token]/dados` **não foram tocados** por nenhuma fatia.

**Arquitetura, do banco à parede:**

```
cadastro de VENDA (acoes.ts)
  → prisma.lancamento.create(...)            ← escrita comercial, autoritativa
  → celebrarSemBloquear(prisma, venda.id)    ← fora da transação, falha engolida
                                             ← id do PRÓPRIO create, nunca "última venda"

botão "Comemorar última venda" (/admin/lancamentos)
  → exigirAdministradorAtivo()               ← primeira linha
  → buscarUltimaVendaCadastrada(prisma)      ← criadoEm DESC, id DESC
  → registrarCelebracao(prisma, id)          ← evento novo a cada clique

TV, a cada 5 s
  → GET /painel/[token]/celebracao           ← rota IRMÃ de /dados, não parte dela
      (tokenPainelConfere → listarCelebracoesRecentes → paraRespostaCelebracoes)
  → ehRespostaCelebracoes                    ← validação runtime; payload ruim é ignorado
  → incorporarCelebracoes                    ← fila + dedup por ids vistos
  → CelebracaoOverlay                        ← ~10 s, por cima do dashboard montado
```

**Modelo.** Tabela `celebracoes` com `id`, `lancamento_id` e `criado_em`, e nada além.
FK para `lancamentos` com **`ON DELETE CASCADE`** — o mesmo princípio de
`ParticipacaoVenda`: o registro dependente morre com o fato que o sustenta, e `Restrict`
quebraria o hard delete de lançamento que já existia. Valor, imóvel, participantes e
equipe histórica são **resolvidos do lançamento** pela relação; não há cópia, snapshot
nem campo `consumido`.

**Leitura.** Janela de frescor de **5 minutos**, teto de **10 eventos**, ordem de
exibição da **mais antiga para a mais nova**, e leitura **plural** — devolver só a
última perderia eventos quando duas vendas entram entre dois polls. Só é apresentável a
celebração cujo lançamento **continua** sendo `VENDA` e **continua** tendo participação.

**Cliente.** Poll de 5 s com leitura imediata ao montar, tempo limite de 4 s, trava
`emVoo`, `cache: no-store` e nova tentativa quando a aba volta a ficar visível. Nenhum
caminho de falha toca o estado: rede caída, timeout, 5xx ou payload inválido saem sem
fechar o overlay nem limpar a fila. Os ids vistos ficam **só em memória** — recarregar a
página pode repetir um evento ainda dentro da janela, e isso foi aceito no MVP.

**Overlay.** "É VENDA!", valor em destaque, imóvel quando houver, participantes com a
equipe do momento do fato, confete em CSS puro (determinístico, sem biblioteca) e a
marca oficial assinando embaixo. Escala em unidades relativas à viewport, como o painel.
`prefers-reduced-motion` tira o movimento e mantém a informação. **Sem áudio.** O
`AtualizadorPainel` continua montado atrás e continua atualizando.

**As fatias, em ordem:**

| Fatia | Commit | O que entregou |
|---|---|---|
| **C1** | `c06fe38` | modelo `Celebracao`, FK Cascade, janela de 5 min, teto de 10, leitura plural, última venda por `criadoEm DESC, id DESC`, zero interferência em métricas |
| **C1-R1** | `7ddf8c0` | `SELECT` + `INSERT` explícitos para `casalouzada_runtime` — e nada além disso — em continuidade às DEC-060/061 |
| **C2** | `1d32543` | disparo automático pelo id do próprio `create`, falha que não invalida a venda, action `comemorarUltimaVenda`, `GET /painel/[token]/celebracao` com token antes do Prisma e `no-store` |
| **C3** | `ae565e6` | poll de 5 s, timeout de 4 s, `emVoo`, validador runtime, fila plural com dedup, 10 s por evento, overlay com confete, botão no Admin, sem áudio, sem storage |
| **C3-R1** | `4f61803` | `imovelRef` no payload e no overlay; marca oficial como assinatura (asset já existente em `public/marca/`) |
| **T1** | `292cf43` | saneamento do harness: corridas entre suítes de integração eliminadas — 10/10 e 3/3 estáveis |
| **T1-R1** | `07b109c` | venda excluída durante a leitura faz a celebração ser descartada, em vez de estourar |
| **P1-R1** | `ed1c29f` | corrige a prova de `MAINTAIN` que derrubou o primeiro deploy (ver "Incidente" abaixo) |

**Publicação.** Release **`ed1c29f`**, deploy **`dep-da13bts9v7es73ag89pg`**, live de
**2026-08-16T22:14:57Z** até **2026-08-17T16:10:30Z**, quando o release `630e336` o
substituiu. Auto-deploy continua **OFF** e a configuração do serviço foi restaurada ao
original (`npm run db:deploy`) ao final do ciclo.

*(A Celebração de Venda continua em produção: o release novo não a alterou em nada — ele
mexe só na compactação monetária do painel. O que mudou é qual deploy a serve.)*

**Os dois gates humanos, que são coisas diferentes:**

- **gate visual local** — 2026-08-16, o proprietário abriu a feature **no navegador
  local** e aprovou. **Não** houve verificação em TV física nesta etapa;
- **gate em produção** — depois do deploy, o proprietário abriu o painel real e
  **confirmou que a animação foi executada corretamente**. A evidência é a confirmação
  dele; **naquele gate o hardware não foi registrado**, e nada se afirmou sobre ele.

Nenhum dos dois foi automatizado.

**Depois, e em separado:** no ensaio da **F4.5B/C**, ainda em 2026-08-16, a Celebração
de Venda foi **comprovada rodando na Samsung Smart TV física** do escritório. Isso não
retroage ao gate acima — lá o hardware seguiu não registrado, e assim fica no
histórico; é uma observação **posterior e adicional**, da fatia de hardware.

**Estado provado em produção, pelo job read-only pós-deploy:**

```
8 migrations found · Database schema is up to date! · ACTIVE_FAILED_MIGRATIONS=0
celebracoes: PK (id) · índice (criado_em, id) · FK → lancamentos(id) ON DELETE CASCADE
RLS_ENABLED=true · POLICY_COUNT=0 · owner=postgres · runtime não é owner
runtime: SELECT=true INSERT=true
         UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN = false
anon e authenticated: sem privilégio algum
count_celebracoes=0 no momento da prova
```

Contagens comerciais **idênticas** antes e depois do deploy — `3 / 19 / 62 / 7 / 0 / 1 / 1`
em equipes, corretores, lançamentos, participações, reservas, saldo e usuários. **As
migrations não alteraram uma linha comercial.**

**Gate de testes no `07b109c`, revalidado em `ed1c29f`:** `npm test` **762/762**,
`npm run test:integracao` **191/191**, `npm run test:integracao:painel` **49/49** — zero
fail, zero cancelled, zero skipped. `npm run lint` limpo e `npx tsc --noEmit` limpo
(após `next typegen`).

### Incidente da migration 8, e como foi recuperado

Registro curto, porque o desfecho importa mais que a narrativa.

O primeiro deploy (P1-C) aplicou a **migration 7** com sucesso e **falhou na 8**, em
PostgreSQL **17.6**: `negados || 'MAINTAIN'` é ambíguo — sem tipo declarado, o `||`
resolve para `anyarray || anyarray` e o PostgreSQL tenta ler o literal como array
(`22P02`). O ramo só executa a partir do 17, e o ambiente local é 16.15, então **nenhum
gate local tinha como alcançá-lo**.

O release novo **não chegou a ficar live** e o anterior seguiu servindo normalmente — o
pre-deploy falha fechado. O recovery foi **ensaiado antes** num PostgreSQL 17.11
descartável, reproduzindo o incidente e o conserto de ponta a ponta. A correção é
`array_append(negados, 'MAINTAIN')`, no commit `ed1c29f`.

Em produção, a tentativa falhada foi marcada **rolled back** e a migration reaplicada
corrigida, pelo próprio pre-deploy. `_prisma_migrations` guarda **as duas linhas** — a
tentativa falhada marcada como revertida e a aplicação concluída —, e isso é histórico
operacional correto: **não deve ser apagado**.

Nenhuma linha comercial foi alterada em nenhum momento do incidente.

### Duas pendências técnicas, nenhuma bloqueante

**Major do PostgreSQL divergente entre local e produção.** O ambiente canônico de teste
é **16.15**; a produção é **17.6**. Foi exatamente essa diferença que escondeu o ramo de
`MAINTAIN` de todos os gates locais — ele era inalcançável aqui. A lição prática:
**migration cujo comportamento é condicionado à major do PostgreSQL precisa de gate na
major de produção antes do deploy**, como se fez no PG17.11 descartável do P1-R1. O
container canônico **não** foi migrado, e migrar é decisão de ciclo próprio.

**One-off job do Render usa o artefato do release live.** Não o último build
bem-sucedido. Foi isso que travou a primeira tentativa de recovery: o job herdava o
artefato de `25e62b5`, que tem seis migrations, e a oitava sequer existia lá para ser
resolvida. A saída foi rodar o `resolve` dentro do **pre-deploy do artefato novo**. É
nota operacional do Render, não decisão de arquitetura do produto.

## Estado executivo

A **Fase 1** está concluída: o projeto Next.js roda, o banco tem schema e migrações
aplicadas, o seed cria as três equipes e o administrador, e o login funciona com
sessão em cookie assinado.

O **protótipo visual** está concluído e versionado: `/preview` desenha o painel
inteiro a partir de dados fictícios.

A **Fase 2 — Administração está concluída**. Equipes, corretores, lançamentos e
saldo histórico podem ser gerenciados pela área administrativa, e o sistema já pode
ser alimentado de verdade.

Da **F3 — Painel**, as sete fatias estão concluídas — a **Fase 3 está concluída
tecnicamente**. A **F3.0 — decisões e contratos** registrou nas DEC-036 a DEC-042 as
regras aprovadas pelo proprietário em 2026-08-12. A **F3.1 — janelas civis**
(`592df35`) entregou `JanelaCivil`, `mesCorrente`, `trimestreCorrente` e
`anoCorrente` em `src/lib/datas.ts`. A **F3.2 — núcleo puro de métricas** foi
publicada em dois commits: `6cf0627` (empresa) e `8ec6cbc` (equipes e rankings). A
**F3.3 — leitura Prisma** foi publicada em `9ec8439`, a **F3.4 — shape de
apresentação** em `a9fe849`, a **F3.5 — painel real ligado aos dados** em `8684f1d` e
a **F3.6 — atualização automática e último valor conhecido** em `888f779`.

`src/lib/metricas.ts` existe e tem duas entradas —
`calcularMetricasEmpresa(lancamentos, saldos, agora?)` e
`calcularMetricasEquipes(lancamentos, corretores, equipes, agora?)`. As duas consomem
as janelas da F3.1 e **continuam puras**: recebem os dados já lidos e não conhecem
Prisma, banco nem ambiente. Nem a F3.3 nem a F3.4 alteraram uma linha delas.

`src/lib/metricas-prisma.ts` é a fronteira banco → domínio, entregue pela F3.3. Ela
lê **cinco** tabelas — as quatro da F3.3 mais `reservas_locacao`, que a E4 acrescentou
em leitura independente —, converte cada linha para os tipos da F3.2 e chama as
entradas puras, sem duplicar nenhum cálculo. A entrada é
`obterMetricasPainel(prisma, agora?)`.

`src/lib/apresentacao-painel.ts` é a camada de apresentação, entregue pela F3.4. Ela
recebe o `ResultadoPainel` da leitura mais um `agora` e devolve `ApresentacaoPainel`:
rótulos, moeda compacta, contagens em pt-BR e `—` onde não há número a afirmar. A
entrada é `criarApresentacaoPainel(resultado, agora)`.

Desde a F3.5 a cadeia está **conectada na rota real**, e desde a F3.6 ela tem dois
momentos. A leitura inicial, no servidor:

```
request inicial
  → tokenPainelConfere
  → lerPainel(prisma, agora)
      (obterMetricasPainel → criarApresentacaoPainel, fatiada em cinco blocos)
  → LeituraPainel
  → AtualizadorPainel
  → PainelVisual
```

E as atualizações, no cliente, a cada 60 segundos:

```
AtualizadorPainel
  → GET /painel/[token]/dados
      (tokenPainelConfere → lerPainel(prisma, agora) → LeituraPainel em JSON)
  → ehLeituraPainel
  → resolverAtualizacao
  → comporApresentacao
  → PainelVisual
```

Três coisas valem registro sobre essa ligação. O **token é validado antes da
leitura** — nenhuma consulta é disparada até o guard passar, e o `prisma` importado no
topo é o Proxy preguiçoso de `src/lib/db.ts`. Um **único `agora`** alimenta leitura e
apresentação, para o cabeçalho não anunciar um mês diferente daquele que produziu os
números. E `page.tsx` só orquestra: não há query, soma, ordenação nem formatação ali.

A F3.5 **não** adicionou `catch` genérico. `INDISPONIVEL`, `SEM_DADOS`,
`SEM_SALDO_HISTORICO` e `CONFIGURACAO_INVALIDA` são dados e já chegam resolvidos; uma
exceção que escape da leitura segue o mecanismo padrão do Next, sem virar estado de
negócio na tela.

`/preview` continua exclusivamente fictício — sem banco, sem env, `noindex/nocache` —,
mas desenha pela **mesma** composição visual da rota real.

Desde a F3.6 a aba se mantém sozinha: o `AtualizadorPainel` consulta a rota de dados
a cada 60 segundos, valida cada payload em runtime e aplica a política de retenção —
falha de atualização não apaga dado bom, e leitura válida substitui o que estava na
tela. `force-dynamic` continua garantindo leitura fresca na request **inicial**; a
atualização contínua é client-side, própria da F3.6.

A **F4 — Identidade e modo TV está CONCLUÍDA**, e isto é o que está provado:

- a **F4.0 — decisões de identidade e modo TV** está **concluída**, registrada nas
  **DEC-047 a DEC-050** em `73f490d`. É fatia documental: nenhuma linha de código,
  nenhum asset;
- a **F4.1 — refinamento de modo TV** está **concluída e publicada** em `f49f912`;
- a **F4.2 — marca oficial e assets** está **concluída e publicada** em `7e0e35d`. O
  lockup horizontal oficial e o símbolo estão em `public/marca/`, o favicon oficial
  derivado do símbolo está em `src/app/icon.png`, o favicon genérico do scaffold foi
  removido e `PainelVisual` desenha a marca no lugar do wordmark textual;
- a **F4.3 — verificação 4K e microajustes** está **concluída**. O único defeito
  reproduzido foi corrigido em `16490f0`, e o gate visual em 3840×2160 foi executado
  depois dele **sem alterar o repositório**, por ser somente verificação;
- a **F4.4 — offline de navegação** está **concluída e publicada** em `8b9fce2`. Uma
  navegação que falhe por rede ou por 5xx passa a mostrar a tela institucional, que
  se recupera sozinha — **sem guardar número nenhum** (DEC-048);
- a **F4.5 — operação em hardware real — está CONCLUÍDA**, depois de ter sido
  REESTRUTURADA (DEC-065). Ela foi adiada em 2026-08-14 em favor da entrega da v1 por URL
  (DEC-057); com o go-live feito, a **F4.5A — avaliação do `Phantom Alien 4K IPTV` — foi
  executada em 2026-08-16 e está concluída**, com resultado **HARDWARE REJEITADO**: o
  aparelho **não será a plataforma definitiva do painel**. A fatia deixou de ser "validar
  o Phantom" e passou a ser "selecionar e validar a plataforma substituta". A **F4.5B**
  concluiu com a **Samsung Smart TV do escritório**, pelo navegador nativo dela
  (DEC-068); a **F4.5C** e a **F4.5D** concluíram; e a **F4.5E — gate físico final —
  passou**.

**A F4 está ENCERRADA.** Todas as suas fatias — F4.0 a F4.5 — estão concluídas.

### F4.5E — gate físico final · CONCLUÍDA · PASS

A pergunta que este gate existe para responder é uma só:

> **A Samsung Smart TV existente está aprovada para operar definitivamente o painel Casa
> Louzada no escritório?**

**Resultado: SIM / PASS.**

**Evidência: aceite explícito do proprietário**, depois dos testes das fatias anteriores —
ele confirmou que *a aplicação está rodando corretamente como deveria, está tudo ok*, e
autorizou considerar concluídos os testes operacionais. Somado a isso, a **cadeia de
evidência já registrada** nas F4.5B, F4.5C e F4.5D.

**Nenhum ensaio novo foi conduzido neste fechamento.** O gate é o aceite humano sobre a
evidência acumulada, e é isso que está registrado — nada além.

O fechamento é **operacional, não certificação laboratorial da plataforma**: os itens
listados como não medidos na F4.5C **continuam não medidos**, e nenhum deles virou `PASS`
nem `FAIL`.

### F4.5B — plataforma escolhida: a Samsung Smart TV do escritório · CONCLUÍDA

Depois da rejeição do Phantom (DEC-065), a plataforma selecionada é a **Samsung Smart TV
que já existe no escritório**, com o painel aberto **direto no navegador dela** — o
recurso de "Serviço da Web" do PC on TV. **Nenhuma máquina intermediária é necessária**:
nem box, nem mini PC, nem notebook ligado à TV. A decisão durável está na **DEC-068**.

O **modelo exato da TV não foi identificado**, e a **versão do Tizen/navegador não foi
lida**. Nada se afirma sobre nenhum dos dois.

**O que o proprietário observou na TV física em 2026-08-16:**

- o navegador / "Serviço da Web" **aceita URL arbitrária** digitada;
- **`/preview` abriu corretamente**;
- **`/painel/<TOKEN>` abriu corretamente** (o token não é registrado aqui, nem em
  nenhuma URL desta documentação);
- **dados reais foram exibidos** — a aplicação de produção, não mock;
- o **layout ficou operacional e legível** na tela;
- o painel **continuou atualizando** sozinho;
- a **Celebração de Venda foi executada corretamente** na própria Samsung;
- **nenhuma máquina intermediária foi necessária**.

Isso é observação direta do proprietário, não medição instrumentada.

### F4.5C — validação física da Samsung · CONCLUÍDA

**Fechada por ACEITE OPERACIONAL FÍSICO, não por medição laboratorial exaustiva.** O
critério é a finalidade: o produto real, na plataforma real, cumprindo a função real.

**Comprovado na TV, em 2026-08-16:**

| | |
|---|---|
| acesso HTTPS pela TV | ✅ |
| aplicação real, em produção | ✅ |
| dados reais na tela | ✅ |
| JavaScript necessário ao painel | ✅ (o painel atualizou e a celebração animou) |
| layout operacional e legível | ✅ aprovado visualmente pelo proprietário |
| atualização automática | ✅ |
| Celebração de Venda | ✅ |
| uso direto da TV, sem intermediário | ✅ |
| incompatibilidade que impeça o uso | **nenhuma observada** |

Isso é o que o gate físico da plataforma exigia: o painel abre, permanece utilizável,
mostra dado real, atualiza sozinho, celebra e é legível na parede. **Aprovado pelo
proprietário.**

**O que continua NÃO MEDIDO — e "não medido" não é "reprovado":**

- resolução gráfica efetiva e **refresh efetivo** — **não se declara 4K60**;
- **viewport** e **DPR** reais entregues ao navegador;
- **versão exata do navegador / engine**;
- **versão exata do Tizen**;
- **Service Worker** na Samsung;
- **Cache Storage** na Samsung.

Nenhum desses itens foi instrumentado, e **nenhum deles bloqueou o aceite operacional**.
Registrá-los como pendências de medição é diferente de registrá-los como falha: não há
evidência de falha em nenhum. Se algum vier a ser medido e reprovar, a DEC-068 é
reaberta.

**Offline.** A **F4.4 continua concluída como entrega de software** e **não é reaberta
aqui**. O comportamento específico de Service Worker e Cache Storage **na Samsung** não
foi instrumentado: **NÃO MEDIDO NA PLATAFORMA, NÃO BLOQUEANTE** para o aceite
operacional atual. Não se declara `PASS` sem evidência.

### F4.5D — operação autônoma · CONCLUÍDA

**Teste real de power cycle, conduzido pelo proprietário:**

| | |
|---|---|
| desligar a TV | executado |
| religar a TV | executado |
| operação retornou corretamente | ✅ |
| **a TV entrou diretamente no painel** | ✅ |
| reconfiguração necessária | **nenhuma** |
| resultado | **PASS**, considerado correto pelo proprietário |

**A evidência é comportamental, não de API.** O que se afirma é o que se viu: **depois de
desligar e religar, o painel retorna direto e a TV fica pronta para operar, sem
intervenção**. **Não** se afirma "autostart técnico por API" — nenhum mecanismo interno
foi identificado, e nomear um seria inventar. Para a finalidade da F4.5D, o
comportamento observado basta.

**Estabilidade.** O proprietário confirmou que **a aplicação está rodando corretamente
como deveria**. Não há medição de duração, e por isso **nenhuma janela de tempo é
declarada** — nada de "24 horas", "8 horas" ou "teste prolongado de X minutos". A
classificação é simplesmente: **OPERAÇÃO REAL = APROVADA PELO PROPRIETÁRIO**.

A frente ativa agora é a **Entrega v1**, em seis etapas (E1 a E6). A **E1 — contratos
e modelo de dados — está concluída e publicada em `078f360`**, registrada neste
handoff e nas **DEC-051 a DEC-057**: venda compartilhada por participações, propostas
com status e valor próprios, saldo histórico mínimo conhecido, reservas de locação,
faixa superior alternando A/B e o go-live provisório antes da F4.5.

A **E2 está CONCLUÍDA E PUBLICADA**, em três fatias:

**E2A — `c6464b5`.** Enums novos (`StatusProposta`, `PrecisaoSaldoHistorico`,
`StatusReservaLocacao`), `Lancamento.valorProposta`/`statusProposta`,
`SaldoHistorico.precisao`, e as tabelas `ParticipacaoVenda` e `ReservaLocacao`.
Migration **aditiva** (`20260814150000_entrega_v1_aditiva`) com os backfills: uma
participação `ordem = 1` por VENDA existente, `AGUARDANDO` nas propostas e `EXATO` nos
saldos. **Sem cutover de VENDA.**

**E2B — `fe00fd2`.** Administração de propostas: status `AGUARDANDO`/`ACEITA`/
`REJEITADA` e `valorProposta` no formulário e na listagem, imóvel obrigatório em
criação e edição, e o `CHECK` de integridade da proposta na migration
`20260814210000_contrato_proposta`. Precisão do saldo (`EXATO` /
`MINIMO_CONHECIDO`) no admin.

**E2C — `18a6599`.** Administração de reservas de locação: listagem, criação sempre
`ATIVA`, snapshot de equipe lido pelo servidor, edição de status entre os três
estados, **sem hard delete** e **sem `LOCACAO` automática**.

A **E3 — venda compartilhada + métricas + cutover final — está CONCLUÍDA E PUBLICADA**
em **`2a50965`**, numa unidade atômica: schema, migration, núcleo, leitura Prisma,
administração e testes no mesmo commit.

**Schema e banco.** `Lancamento.corretorId` e `equipeId` passaram a `String?`, com as
relações opcionais e `onDelete: Restrict` preservado. A migration
`20260814230000_cutover_venda_compartilhada` (SHA-256
`3E2B1B498E7FCB60554F0289177ED260492DF842CCE20CB2F54C7F06CA44A17F`) fez, nesta ordem:
backfill **idempotente** das vendas criadas entre a E2A e a E3, prova pré-cutover que
aborta se faltar cobertura ou se a ordem não for contígua `1..N`, `DROP NOT NULL`,
`UPDATE … WHERE tipo='VENDA'`, instalação do `CHECK lancamentos_venda_credito_check` e
prova pós-cutover — que confere também a sobrevivência do CHECK de proposta da E2B.

**Crédito.** `ParticipacaoVenda` é a **única fonte** do crédito de VENDA. A empresa
conta a venda e o valor uma vez; cada participante recebe +1 e a sua fração
igualitária; cada equipe recebe a soma das frações dos seus participantes.

**Administração.** A venda passou a ser multi-participante, gravada em transação. Os
snapshots de equipe são preservados na edição — um participante que permanece continua
sendo **a mesma `ParticipacaoVenda`**: mesmo `id`, mesmo `equipeId`, mesmo `criadoEm`;
só a `ordem` muda, pela recompactação. Participante novo entra ao final com a equipe
atual validada pelo servidor; a remoção recompacta `1..N`; não há reordenação manual.
Os filtros de corretor e equipe casam pelas participações e, combinados, exigem que a
mesma participação satisfaça os dois.

A **E4 — painel operacional A/B e novos estados — está CONCLUÍDA E PUBLICADA** em
**`c24a0c9`**, em 23 caminhos, **sem schema e sem migration**: é uma etapa inteiramente
de apresentação.

**Faixa superior A/B.** A faixa deixou de ser estática e alterna entre a **Tela A** — os
três acumulados de sempre — e a **Tela B** — "Propostas em andamento" e "Reservas de
locação" —, 20 segundos cada, `A → B → A → B`, sem terceira tela. O ciclo é
independente do refresh de 60 s: o timer depende só de qual tela está ativa, então uma
atualização de dados troca o conteúdo por baixo sem reiniciar a rotação.

**Listas operacionais.** Propostas entram só em `AGUARDANDO`; reservas, só em `ATIVA`.
No máximo três de cada, ordenadas por `dataReferencia` decrescente, com `criadoEm`
decrescente e `id` crescente como desempates — sem eles, dois itens empatados poderiam
trocar de lugar a cada atualização sem nada ter mudado. Cada item mostra **imóvel e
corretor**, e nada além. Lista vazia vira frase — "Nenhuma proposta em andamento" /
"Nenhuma reserva ativa" —, **nunca `0`**: são listas operacionais, não métricas
(DEC-014). Proposta legada sem imóvel continua na lista, dizendo "Imóvel não informado".

**Onde mora a regra.** Seleção, ordenação e corte em três estão em `src/lib/metricas.ts`
(DEC-013), com `MAXIMO_DESTAQUES = 3` como fonte única do corte. A leitura Prisma
**não** filtra status, **não** ordena operacionalmente e **não** aplica `take`; os
componentes **não** filtram, **não** ordenam e **não** cortam.

**Precisão do saldo na tela.** `MINIMO_CONHECIDO` não muda cálculo nenhum: ele qualifica
a apresentação dos acumulados com "+ de" — "+ de 527", "+ de R$ 800 mi". A precisão do
saldo de `VENDA` qualifica imóveis vendidos **e** VGV acumulado; a de
`AVALIACAO_GOOGLE`, as avaliações. "+ de" **nunca** aparece em mês, trimestre, ano,
quadro mensal ou ranking, e `SEM_SALDO_HISTORICO` continua `—`, nunca "+ de —" — o tipo
do acumulado tornou isso inexprimível, porque o ramo sem valor não carrega precisão.

A **E5 — gate completo — está CONCLUÍDA**, com resultado
**`RELEASE_CANDIDATE_READY_FOR_E6 = YES`**. Ela é etapa de **certificação**: não
implementou feature, não criou commit de código e terminou com a árvore byte a byte
como começou. **Nenhuma feature da v1 continua pendente antes do E6** — o contrato de
produto das DEC-051 a DEC-056 está inteiramente implementado e provado.

A **E6 — go-live no Render + smoke público — está CONCLUÍDA**.

## A ENTREGA V1 ESTÁ CONCLUÍDA E EM PRODUÇÃO

O release em produção é hoje o **`46432543`** (ver Identificação), em
`https://dashboard-casalouzada.onrender.com`. **Nenhuma feature da v1 continua
pendente**, as **oito migrations estão aplicadas em produção** — as seis da v1 mais as
duas da Celebração de Venda — e a **credencial exposta na P1 foi rotacionada e revogada**
antes do go-live. O painel da TV fica em
`https://dashboard-casalouzada.onrender.com/painel/<TOKEN>`.

A v1 foi ao ar no `adabe2d` e chegou ao `25e62b5` pelas correções da auditoria S1, depois
ao `ed1c29f` pela publicação da celebração; o release atual é posterior aos três, pelo
microajuste de precisão monetária do painel (DEC-069) — ver a seção logo abaixo.

O go-live original foi o `adabe2d`, em 2026-08-14. O release atual é posterior porque a
**auditoria de segurança S1** entregou correções em produção — primeiro os quatro
achados obrigatórios, depois dois itens do hardening residual — ver a seção abaixo.

Depois dele veio a **Celebração de Venda**, publicada no release `ed1c29f` e aprovada em
produção pelo proprietário. Com ela **não resta nenhuma frente de desenvolvimento
aberta**; as duas pendências do projeto são as de sempre, e a escolha entre elas está a
arbitrar (ver o bloco no topo deste documento):

- a **F4.5 — operação em hardware real**, **concluída**: **F4.5A** concluída com o
  Phantom rejeitado (DEC-065) e **F4.5B** concluída com a Samsung Smart TV escolhida
  (DEC-068); **F4.5C**, **F4.5D** e **F4.5E** também concluídas — a F4.5 inteira está
  fechada;
- das etapas operacionais, a **O1 — reconciliação do dossiê secreto — está CONCLUÍDA**,
  e a **O2 — carga operacional inicial — está PARCIALMENTE CONCLUÍDA**: o saldo de
  `AVALIACAO_GOOGLE` já está cadastrado e o de `VENDA` ainda não.

## AUDITORIA DE SEGURANÇA S1 — SEC-001 A SEC-004 ENCERRADOS

A auditoria S1 varreu o repositório, o histórico Git, as dependências, os cabeçalhos
HTTP, o banco e a configuração de deployment. Produziu dez achados. **Os quatro
obrigatórios foram corrigidos e verificados em produção**. Dos seis restantes,
classificados como hardening, **três já foram encerrados** — SEC-005, SEC-006 e
SEC-009 — e o resto está listado mais adiante, sem bloquear a v1.

| Achado | Título | Estado |
|---|---|---|
| **SEC-001** | Data API do Supabase alcançava as tabelas: RLS desligado e grants amplos para `anon`/`authenticated` | **corrigido e verificado** |
| **SEC-002** | Conexões PostgreSQL da aplicação trafegavam sem TLS | **corrigido e verificado** |
| **SEC-003** | Open redirect no `proximo` do login | **corrigido e verificado** |
| **SEC-004** | Runtime conectava ao banco com role administrativo | **corrigido e verificado** |

### SEC-001 — isolamento da Data API

A migration **`20260815190000_seguranca_data_api`** é a sexta aplicada em produção.
Estado hoje, medido por catálogo:

- as **oito** tabelas de `public` com **RLS habilitado**;
- **`FORCE ROW LEVEL SECURITY` desligado** — é isso que mantém a aplicação enxergando
  tudo, porque o dono e quem tem `BYPASSRLS` não são filtrados;
- **zero policies** em `public`, deliberadamente: sem policy, o RLS nega;
- **zero ACL direta** de tabela para `anon` e `authenticated`, e **zero privilégio
  efetivo** desses dois roles nos oito alvos;
- os **default privileges de TABLE em `public` do creator `postgres`** deixaram de
  conceder a esses dois roles, então tabela nova não nasce aberta;
- **`service_role` preservado**, sem alteração.

A **Data API continua disponível** no projeto Supabase — ela não foi desligada. O que
mudou é que `anon` e `authenticated` não alcançam mais as tabelas do produto por ela.
Desligá-la é hardening opcional, não pendência.

### SEC-002 — TLS nas conexões PostgreSQL

O CA oficial do Supabase está no Render como **Secret File `supabase-ca.crt`**,
disponível em `/etc/secrets/supabase-ca.crt`. As duas conexões usam TLS validado, e
**cada uma exige uma sintaxe diferente** — este é o ponto que mais gera engano:

| Conexão | Consumidor | Porta | Parâmetros de TLS |
|---|---|---|---|
| `DATABASE_URL` | runtime (`pg` via `@prisma/adapter-pg`) | 6543, `pgbouncer=true` | `sslmode=verify-full` + `sslrootcert=/etc/secrets/supabase-ca.crt` |
| `DIRECT_URL` | Prisma CLI / migrations (engine Rust) | 5432 | `sslmode=require` + `sslaccept=strict` + `sslcert=/etc/secrets/supabase-ca.crt` |

**Não trocar uma sintaxe pela outra.** O engine Rust do Prisma **aceita e ignora**
`sslmode=verify-full` e `sslrootcert`: a conexão parece configurada e não valida nada.
Quem liga a verificação ali é `sslaccept=strict`. Ambas as conexões foram comprovadas
negociando TLS 1.3 com certificado autorizado.

**E a recíproca também vale — foi ela que gerou a DEC-066.** O node-postgres ignora
`sslaccept` e trata `sslcert` como certificado de **cliente**, não como CA. Por isso os
scripts administrativos em Node ganharam conexão própria, **`ADMIN_DATABASE_URL`**, em
vez de reaproveitar a `DIRECT_URL` do CLI — ver a seção "Conexões de banco" adiante.

O **SSL Enforcement do Supabase continua desligado** — o servidor ainda aceitaria uma
conexão sem TLS. Isso é **hardening futuro**, não SEC-002 em aberto: o cliente está
correto e provado; o enforcement apenas impediria uma regressão de configuração.

### SEC-003 — redirect pós-login restrito ao `/admin`

O destino pós-login admite **somente o namespace `/admin`**. A regra é de alistamento,
não de proibição: a entrada é resolvida pelo mesmo parser de URL que o navegador usa,
contra uma origem sentinela; se a origem mudar na resolução, o texto era externo
disfarçado. O julgamento é sobre o **pathname canonicalizado** — `/admin/../login` vale
como `/login` e é recusado — e o que volta é a forma canônica, **nunca o texto do
cliente**. Qualquer outra entrada cai em `/admin`.

Implementado em `src/lib/destino-login.ts`, consumido por `src/app/login/acoes.ts`,
coberto por `tests/destino-login.test.ts`.

### SEC-004 — role dedicado de runtime

O runtime deixou de usar `postgres`. Arquitetura atual:

| Conexão | Role | Papel |
|---|---|---|
| `DATABASE_URL` | **`casalouzada_runtime`** | runtime da aplicação |
| `DIRECT_URL` | **`postgres`** | migrations e scripts administrativos |

Atributos duráveis de `casalouzada_runtime`: `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`,
`NOCREATEROLE`, `NOREPLICATION`, `NOINHERIT`, **`BYPASSRLS`**, zero memberships
administrativas e **zero ownership** — não é dono de nenhuma tabela.

O `BYPASSRLS` é intencional e é o que dispensa criar policies: o RLS do SEC-001 existe
para barrar a Data API, não o servidor da aplicação. A alternativa sem ele exigiria
introduzir policies permissivas específicas para o role de runtime — regras que não
expressariam isolamento real por linha, já que a autorização é decidida no servidor antes
de chegar ao banco, e que apagariam a leitura simples da arquitetura atual: **Data API
bloqueada, runtime autorizado**. Trocar isso é possível, mas seria uma decisão
arquitetural nova, não um ajuste (DEC-060).

Matriz de privilégios em produção:

| tabela | SELECT | INSERT | UPDATE | DELETE |
|---|:--:|:--:|:--:|:--:|
| `equipes` | sim | sim | sim | **não** |
| `corretores` | sim | sim | sim | **não** |
| `lancamentos` | sim | sim | sim | sim |
| `participacoes_venda` | sim | sim | **não** | sim |
| `reservas_locacao` | sim | sim | sim | **não** |
| `saldo_historico` | sim | sim | sim | sim |
| `usuarios` | sim | **não** | **não** | **não** |
| `_prisma_migrations` | **não** | **não** | **não** | **não** |

Nenhuma tabela recebe **TRUNCATE, REFERENCES, TRIGGER ou MAINTAIN**. `usuarios` é
somente leitura porque o runtime só lê — login e guarda; a troca de senha é o script
`db:trocar-senha-admin`, que usa a `DIRECT_URL`.

**Tabela nova não recebe acesso automático.** Não há default privilege concedendo ao
runtime. A migration que criar um objeto deve conceder explicitamente o mínimo que ele
exige, e esse `GRANT` fica versionado e revisável no diff — ver DEC-061.

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
| F3.4 — Shape de apresentação | **Concluída** | `a9fe849` |
| F3.5 — Painel real | **Concluída** | `8684f1d` |
| F3.6 — Atualização automática e último valor conhecido | **Concluída** | `888f779` |
| **F3 — Painel** | **Concluída** | — |
| F4.0 — Decisões de identidade e modo TV | **Concluída** | DEC-047 a DEC-050 em `73f490d`; sem código |
| F4.1 — Refinamento de modo TV | **Concluída** | `f49f912` |
| F4.2 — Marca oficial e assets | **Concluída** | `7e0e35d` |
| F4.3 — Verificação 4K e microajustes | **Concluída** | `16490f0` + evidência visual 4K sem commit |
| F4.4 — Offline de navegação | **Concluída** | `8b9fce2` |
| F4.5A — Avaliação do `Phantom Alien 4K IPTV` | **Concluída** | inspeção física em 2026-08-16; resultado **HARDWARE REJEITADO** (DEC-065); sem commit de código |
| F4.5B — Seleção da plataforma substituta | **Concluída** | **Samsung Smart TV do escritório**, navegador nativo, sem hardware externo (DEC-068) |
| F4.5C — Validação física da plataforma substituta | **Concluída** | aceite operacional físico na Samsung; resolução/refresh, viewport, DPR, engine, Tizen, SW e Cache Storage seguem **não medidos** |
| F4.5D — Operação autônoma | **Concluída** | power cycle **PASS** — ao religar, a TV volta direto ao painel, sem reconfiguração |
| F4.5E — Gate físico final | **Concluída** | **PASS** — aceite explícito do proprietário sobre a cadeia de evidência F4.5B/C/D |
| **F4.5 — Operação em hardware real** | **Concluída** | F4.5A a F4.5E concluídas; plataforma definitiva: Samsung Smart TV (DEC-068) |
| **F4 — Identidade e modo TV** | **Concluída** | F4.0 a F4.5 encerradas |
| O1 — Reconciliação do dossiê secreto | **Concluída** | O1A + O1-S0 + O1-S1 + O1B; **nenhum valor secreto no repositório** |
| O2 — Carga operacional inicial | **Parcialmente concluída** | `AVALIACAO_GOOGLE` cadastrado; **falta `VENDA`** — medido no banco |
| E1 — Contratos e modelo de dados da v1 | **Concluída** | `078f360` — DEC-051 a DEC-057; sem código |
| E2A — Schema e migration aditiva + backfills | **Concluída** | `c6464b5` — sem cutover de VENDA |
| E2B — Admin de propostas + precisão do saldo | **Concluída** | `fe00fd2` — inclui o CHECK da proposta |
| E2C — Admin de reservas de locação | **Concluída** | `18a6599` |
| **E2 — Migration aditiva + admin (propostas, saldo, reservas)** | **Concluída** | `c6464b5` + `fe00fd2` + `18a6599` |
| E3 — Venda compartilhada + métricas + cutover final | **Concluída** | `2a50965` — publicação atômica |
| E4 — Painel operacional A/B e novos estados | **Concluída** | `c24a0c9` — publicação atômica, sem migration |
| E5 — Gate completo | **Concluída** | `RELEASE_CANDIDATE_READY_FOR_E6 = YES` — sem commit de código |
| E6 — Go-live no Render + smoke público | **Concluída** | `adabe2d` implantado no go-live, 5 migrations aplicadas, sem commit de código |
| **Entrega v1** | **Concluída e em produção** | `https://dashboard-casalouzada.onrender.com` |
| Auditoria S1 — SEC-001 a SEC-004 | **Concluída** | corrigidos e verificados em produção; 6 migrations |
| Hardening S1 — SEC-005, SEC-006 e SEC-009 | **Concluída** | encerrados no release de então, `25e62b5` |
| **Celebração de Venda** | **Concluída e em produção** | release `ed1c29f`; gate humano aprovado |
| **Microajuste de precisão do VGV** | **Concluído e em produção** | release `630e336` (DEC-069); sem gate visual na Samsung |
| **VGV histórico mensal** | **Concluído e em produção** | release `46432543` (DEC-070), deploy `dep-da1l5pu417fc73ek9llg`; migration aplicada; **dados reais de jan–jul ainda não cadastrados — etapa O3** |
| F5 — Refinamentos | **Futura** | metas, comparativos, fotos, exportação |

## Fundação técnica

- **Next.js 16.3.0 (App Router) + TypeScript**, **Tailwind CSS v4**.
- **Prisma 7.9.1 sobre PostgreSQL**, com driver adapter em `src/lib/db.ts`. As URLs
  saíram do `schema.prisma`: migrações leem `DIRECT_URL` pelo `prisma.config.ts` e a
  aplicação usa `DATABASE_URL` em runtime (DEC-031). Desde a **DEC-066** existe uma
  terceira, **`ADMIN_DATABASE_URL`**, exclusiva dos scripts administrativos em Node —
  ver "Conexões de banco" abaixo.
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
  com o `PrismaClient` injetado por parâmetro (DEC-041). Faz **cinco** leituras Prisma
  desde a E4 — a quinta é `reservaLocacao`, sem `where`, sem `orderBy` e sem `take` —,
  converte `Decimal` em string decimal canônica por `toFixed(2)` e chama o núcleo puro.
  Não repete nenhum cálculo: não há soma, contagem, `groupBy` nem `aggregate` ali, e
  também não há filtro de status, ordenação operacional nem corte de lista.
- **Camada de apresentação**: `src/lib/apresentacao-painel.ts`, desde a F3.4. Módulo
  puro e síncrono, sem Prisma e sem I/O — o `ResultadoPainel` entra como `import type`,
  para o `server-only` do módulo de leitura não chegar ao runtime. `agora` é
  obrigatório, sem default. Produz `ApresentacaoPainel`, formatando valores e traduzindo
  estados; não recalcula métrica nenhuma.
- **Composição visual**: `src/components/painel/painel-visual.tsx`, desde a F3.5.
  Server Component, é a composição visual **única** do painel: `/preview` a alimenta
  com o mock e `/painel/[token]` com os dados reais, e por ser uma só o protótipo
  continua valendo como contrato visual da tela de verdade. Recebe `ApresentacaoPainel`
  e contém a configuração do Jost — que, por morar aqui, vale nas **duas** rotas, e
  não só no preview. Não lê banco, não calcula, não formata e não conhece o mock.
- **Estados da área de equipes**: `src/components/painel/decidir-area-equipes.ts`,
  desde a F3.5. Decisão pura, sem JSX, React, CSS ou banco, com `switch` exaustivo
  guardado por `never` — um quinto estado quebra a compilação em vez de cair calado num
  ramo qualquer.
- **Guard de token compartilhado**: `src/lib/token-painel.ts`, desde a F3.6.
  `server-only`; `tokenPainelConfere` compara com `timingSafeEqual` e é a única
  comparação de token, usada pela página e pela rota de dados.
- **Leitura empacotada**: `src/lib/leitura-painel.ts`, desde a F3.6.
  `lerPainel(prisma, agora)` chama `obterMetricasPainel` e `criarApresentacaoPainel` —
  não calcula nem formata dinheiro por conta própria —, fatia a apresentação nos
  **cinco** blocos desde a E4 e carimba `competencia`, `lidoEmMs` e `horaLeitura`. Um
  único `agora` alimenta tudo.
- **Contrato HTTP**: `src/lib/contrato-atualizacao-painel.ts`, desde a F3.6.
  `LeituraPainel` é JSON-safe, e `ehLeituraPainel` valida estrutura, dimensões,
  equipes, rankings e coerência em runtime, manualmente e sem Zod. Payload inválido
  não entra no reducer. Desde a E4 ele valida também as duas listas operacionais:
  `INDISPONIVEL` chega **sem** `itens`, `OK` traz de zero a três, e cada item precisa
  de imóvel e corretor não vazios.
- **Retenção**: `src/lib/retencao-painel.ts`, desde a F3.6. Reducer puro do último
  valor conhecido, por bloco (DEC-045), consumido pelo `AtualizadorPainel`. Desde a E4
  ele cobre os cinco blocos.
- **Rotação da faixa superior**: `src/components/painel/rotacao-faixa.ts`,
  `faixa-superior.tsx` e `faixa-operacional.tsx`, desde a E4. A regra de rotação mora
  num módulo **sem JSX e sem CSS** justamente para ser testável — o componente importa
  o módulo de estilos, e o runner do Node não parseia CSS.

## Conexões de banco

São **três**, cada uma com um papel principal próprio (DEC-066):

| Variável | Consumidor | Driver | Conexão | Role | Fallback |
|---|---|---|---|---|---|
| `DATABASE_URL` | runtime (`src/lib/db.ts`) | node-postgres | pooler, 6543 | `casalouzada_runtime` | **nenhum** |
| `DIRECT_URL` | Prisma CLI — migrations e introspecção (`prisma.config.ts`) | engine Rust | direta, 5432 | administrativo | **`DIRECT_URL ?? DATABASE_URL`**, histórico e preservado |
| `ADMIN_DATABASE_URL` | `db:seed` e `db:trocar-senha-admin` | node-postgres | direta, 5432 | administrativo | **nenhum** |

O fallback do Prisma CLI **continua valendo** e não foi tocado: num ambiente sem
pooler — o banco local de teste — as duas apontam para o mesmo lugar. Quem passou a
não ter fallback foram **os scripts administrativos**, e só eles.

Dois motivos independentes, e cada um bastaria. **Privilégio**: o role de runtime tem
`usuarios` somente leitura desde o SEC-004, então um script administrativo que caísse na
`DATABASE_URL` morreria com erro de permissão. **TLS**: as duas sintaxes da seção do
SEC-002 pertencem a drivers diferentes e cada driver **ignora a do outro** — o
node-postgres desconsidera `sslaccept` e lê `sslcert` como certificado de **cliente**.
Reaproveitar a `DIRECT_URL` num script Node dá, na melhor hipótese, erro de conexão; na
pior, conexão que sobe **parecendo verificada sem validar certificado nenhum**.

Isso não é hipótese: na rotação emergencial da senha administrativa (O1-S0, 2026-08-16)
o script só rodou depois de a URL ser traduzida à mão para a sintaxe do node-postgres.

Os dois scripts **falham fechado** — sem `ADMIN_DATABASE_URL` eles abortam **antes de
abrir conexão** e não caem para as outras duas. A mensagem nomeia a variável e explica
por que as outras não servem, **sem imprimir valor**.
`tests/contrato-conexao-admin.test.ts` prova isso com as outras duas definidas como
chamariz, exigindo ausência de qualquer sinal de tentativa de rede;
`tests/integracao/trocar-senha-admin.integracao.test.ts` prova o comando inteiro contra
o banco local.

**`ADMIN_DATABASE_URL` é local/operacional e não vai para o Render.** O Web Service não
precisa dela: o runtime usa `DATABASE_URL` e o `pre-deploy` usa o CLI com `DIRECT_URL`.
Cadastrá-la lá reporia uma credencial administrativa no ambiente do processo web — o que
o SEC-004 tirou de propósito. `scripts/banco-teste.ts` injeta as três apontando para o
banco local, onde a distinção não tem efeito.

> **Estado.** Implementado, testado e **publicado em produção** no release `ed1c29f`.
> `ADMIN_DATABASE_URL` **continua fora do Web Service**, como a decisão exige, e nenhuma
> variável do Render foi alterada em nenhum momento.

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

#### Propostas (E2B, `fe00fd2`)

`PROPOSTA` tem dois campos próprios, e eles só existem nela:

- **`statusProposta`** — `AGUARDANDO` / `ACEITA` / `REJEITADA`, **obrigatório**. Uma
  proposta nova abre com `AGUARDANDO` selecionado, e o status é editável entre os três
  a qualquer momento.
- **`valorProposta`** — dinheiro **opcional**, em campo separado de `valor`. Ele é
  informativo e **não é VGV**: não entra em nenhum agregado monetário. O `valor` do
  lançamento continua `NULL` em proposta.
- **Imóvel obrigatório** em proposta nova **e** na edição de uma proposta. A **proposta
  histórica sem imóvel continua válida** e editável em status — o `CHECK` do banco não
  exige `imovel_ref` de propósito.
- Em qualquer tipo que **não** seja `PROPOSTA`, os dois campos são gravados como
  `NULL`; payload forjado não contamina outro tipo, e trocar o tipo de um lançamento
  limpa os campos.

A listagem mostra o status numa coluna própria e usa `valorProposta` na coluna de
valor quando o lançamento é uma proposta. Desde a **E4** (`c24a0c9`) a TV lista as
propostas `AGUARDANDO` na Tela B — até três, mais recentes primeiro.

### Saldo histórico — `/admin/saldo-historico`

Somente `VENDA` e `AVALIACAO_GOOGLE`, com **no máximo uma linha por tipo**, garantida
por índice único. Criar, editar e excluir. `VENDA` exige quantidade e valor
positivos; `AVALIACAO_GOOGLE` exige quantidade e grava `valorTotal = 0.00`. O tipo de
um saldo cadastrado não muda.

**Ausência é diferente de zero**: um tipo sem linha aparece como "Não cadastrado",
nunca como `0`, e nenhuma linha zerada é criada automaticamente.

**Precisão do saldo (E2B, `fe00fd2`).** Cada linha tem `precisao` — `EXATO` ou
`MINIMO_CONHECIDO` (DEC-054). A criação e a edição administrativas suportam os dois, e
a troca vale nos dois sentidos; a precisão é exigida na validação, sem default
silencioso, e aparece na listagem e na confirmação de exclusão. Todas as linhas
existentes receberam `EXATO` no backfill da E2A — **nenhum saldo virou mínimo
conhecido sozinho**.

**O painel desenha "+ de" desde a E4** (`c24a0c9`), e só nos acumulados: a DEC-054 está
**completa na v1**. `MINIMO_CONHECIDO` não altera cálculo — o piso é uma afirmação de
apresentação.

### Reservas de locação — `/admin/reservas-locacao`

Entregue na E2C (`18a6599`). Reserva é operação, não produção (DEC-055): não usa
`Lancamento` e não conta em Locados, VGV ou ranking.

- **Listagem** com data, imóvel, corretor, equipe, status e observação, ordenada por
  data decrescente e, no desempate, por criação decrescente. Sem filtros e sem
  paginação nesta fatia. Estado vazio: "Nenhuma reserva de locação cadastrada."
- **Nova reserva** em `/admin/reservas-locacao/novo`: o operador escolhe o corretor,
  o imóvel, a data e uma observação opcional. **Não há campo de status** — toda reserva
  **nasce `ATIVA`**, gravada explicitamente pela action.
- **Corretor e equipe são snapshot da criação.** O servidor reconsulta o corretor
  imediatamente antes do insert e grava a equipe atual dele; a equipe nunca vem do
  formulário, e `criadoPor` vem da guarda administrativa. Só corretor ativo de equipe
  ativa recebe reserva nova.
- **Edição** em `/admin/reservas-locacao/[id]/editar`: mudam apenas imóvel, status,
  data e observação. **Corretor e equipe são somente leitura e imutáveis** — o UPDATE
  não os toca, nem `criadoPor`. Um corretor ou uma equipe que tenham sido inativados
  **depois** não bloqueiam a edição: a reserva precisa continuar finalizável,
  cancelável e corrigível.
- **Status** entre `ATIVA`, `FINALIZADA` e `CANCELADA`, editável nos dois sentidos —
  não há máquina terminal na v1, então uma finalização por engano volta a `ATIVA`.
- **Não há hard delete.** `CANCELADA` é o estado de uma reserva que deixou de valer, e
  o registro fica.
- **Finalizar uma reserva não cria `LOCACAO`.** Não existe automação entre as duas
  coisas: quando o negócio fecha, o operador registra a locação separadamente, como um
  lançamento normal.

A lista de reservas `ATIVA` na TV **existe desde a E4** (`c24a0c9`): até três, mais
recentes primeiro, com imóvel e corretor. `FINALIZADA` e `CANCELADA` ficam de fora sem
afetar contagem nenhuma, porque nunca houve contagem de reserva.

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

Vinte páginas versionadas, mais uma Route Handler:

| Área | Rotas |
|---|---|
| Pública / autenticação | `/` (redireciona para `/admin`), `/login` |
| Administração | `/admin`, `/admin/equipes`, `/admin/equipes/novo`, `/admin/equipes/[id]/editar` |
| | `/admin/corretores`, `/admin/corretores/novo`, `/admin/corretores/[id]/editar` |
| | `/admin/lancamentos`, `/admin/lancamentos/novo`, `/admin/lancamentos/[id]/editar` |
| | `/admin/reservas-locacao`, `/admin/reservas-locacao/novo`, `/admin/reservas-locacao/[id]/editar` (desde a E2C) |
| | `/admin/saldo-historico`, `/admin/saldo-historico/novo`, `/admin/saldo-historico/[id]/editar` |
| Painel | `/painel/[token]` (dados reais, desde a F3.5), `/painel/[token]/dados` (Route Handler de atualização, desde a F3.6), `/preview` (protótipo com dados fictícios) |

Esse número é a contagem de páginas versionadas e **não** é o mesmo que o `next build`
reporta: o build atual fecha em **23 rotas**, porque conta também `/_not-found` e
`/icon.png`, além da própria Route Handler.

Não existe `src/app/api/` — a única Route Handler é `GET /painel/[token]/dados`,
criada na F3.6 ao lado da página que a consome.

## Migrations

Cinco migrations versionadas:

1. `20260811014943_inicial` — cinco tabelas e o enum `tipo_lancamento`.
2. `20260812120000_saldo_historico_tipo_unico` — troca o índice simples de
   `saldo_historico.tipo` por um índice **único**. Estrutural: nenhuma coluna,
   tabela, trigger ou dado.
3. `20260814150000_entrega_v1_aditiva` (E2A, `c6464b5`) — **aditiva**. Cria os enums
   `status_proposta`, `precisao_saldo_historico` e `status_reserva_locacao`; as
   colunas `lancamentos.valor_proposta` e `lancamentos.status_proposta`; a coluna
   `saldo_historico.precisao` com default `EXATO`; e as tabelas
   `participacoes_venda` e `reservas_locacao`, com unicidades, FKs e índices. Faz os
   backfills: uma participação `ordem = 1` por VENDA existente, `AGUARDANDO` nas
   propostas e `EXATO` nos saldos. **Não** torna campo nenhum nullable, **não** zera
   `corretor_id`/`equipe_id` e **não** instala o CHECK da DEC-051.
4. `20260814210000_contrato_proposta` (E2B, `fe00fd2`) — backfill defensivo de
   `AGUARDANDO` em proposta sem status e o `CHECK`
   `lancamentos_proposta_campos_check`: em `PROPOSTA`, status obrigatório, `valor`
   `NULL` e `valor_proposta` positivo quando presente; nos demais tipos, os dois
   campos de proposta `NULL`. **De propósito não exige `imovel_ref`** — a proposta
   legada sem imóvel continua válida (DEC-053).
5. `20260814230000_cutover_venda_compartilhada` (E3, `2a50965`) — o **cutover**
   (DEC-051). SHA-256
   `3E2B1B498E7FCB60554F0289177ED260492DF842CCE20CB2F54C7F06CA44A17F`. Em seis blocos,
   nesta ordem: **A)** backfill idempotente das VENDA criadas entre a E2A e a E3, com
   `id` determinístico e `criado_em` do lançamento, e só onde não existe participação
   nenhuma; **B)** prova pré-cutover — aborta a migration inteira se sobrar VENDA sem
   participação ou se a ordem de alguma venda não for contígua `1..N` (verificado por
   `MIN = 1`, `MAX = COUNT` e `COUNT(DISTINCT) = COUNT`); **C)** `DROP NOT NULL` nas
   duas colunas; **D)** `UPDATE … SET NULL WHERE tipo = 'VENDA'`; **E)** o `CHECK`
   `lancamentos_venda_credito_check`; **F)** prova pós-cutover — zero VENDA com crédito
   antigo, zero não-VENDA sem crédito, zero VENDA sem participação, e o `CHECK` de
   proposta da E2B ainda presente. Nenhuma migration anterior foi editada.

6. `20260815190000_seguranca_data_api` (auditoria S1 — SEC-001) — a barreira contra a
   Data API, descrita na seção da auditoria. Não toca coluna, constraint, índice, FK
   nem dado: só permissão. Habilita RLS **sem `FORCE`** nas oito tabelas, revoga todos
   os privilégios de `anon` e `authenticated`, remove os default privileges de TABLE em
   `public` do creator `postgres` para esses dois roles, e termina com uma prova que
   relê o catálogo e aborta a migration inteira se RLS, ACL, default ACL ou policies
   não estiverem como prometido. Tudo dentro de **um único statement `DO`**, o que
   garante o "tudo ou nada" sem depender de o Prisma abrir transação.

7. `20260816120000_celebracao_venda` (C1, `c06fe38`) — **aplicada em produção**.
   Aditiva pura: cria a tabela `celebracoes`, o índice `(criado_em, id)` e a FK para
   `lancamentos` com `ON DELETE CASCADE`. Não toca coluna, constraint nem dado de
   nenhuma tabela comercial, e não faz backfill, trigger ou seed. Estende ao objeto novo
   as duas barreiras do SEC-001 — RLS ligado sem policy e privilégios de
   `anon`/`authenticated` revogados —, porque `ENABLE ROW LEVEL SECURITY` é estado de
   tabela e não default de schema: sem isso a tabela nasceria com uma barreira só.

8. `20260816160000_celebracao_runtime_grants` (C1-R1 `7ddf8c0`, corrigida em `ed1c29f`)
   — **aplicada em produção**. Concede a `casalouzada_runtime` **`SELECT` e `INSERT`** em
   `celebracoes`, e nada além — sem `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`,
   `TRIGGER` ou `MAINTAIN`, em continuidade à DEC-060/061. O `ON DELETE CASCADE` da FK
   **não** exige `DELETE` na tabela filha: a ação referencial é executada pelo sistema.
   Nasceu como migration própria, e não como correção da anterior, porque a
   `20260816120000` já estava publicada e editá-la mudaria o checksum registrado em
   `_prisma_migrations`. Prova pelo catálogo o que concedeu, e é condicionada a
   `pg_roles` para continuar portátil onde o role não existe.

   Esta é a **única migration já publicada que foi editada depois** — porque falhou em
   produção sem deixar efeito parcial, e o Prisma prevê exatamente esse caminho
   (`resolve --rolled-back` e nova aplicação). Ver "Incidente da migration 8". Nenhuma
   migration **concluída** foi editada em momento algum.

> **Estado de produção — as oito estão aplicadas.** Até o E5, só
> `20260811014943_inicial` existia em produção; nenhuma das cinco publicações de código
> aplicou migration remota, porque publicar no Git **não é** aplicar em produção. O
> **E6 fechou esse gate**: num único deploy do commit `adabe2d`, o `pre-deploy`
> (`npm run db:deploy`) aplicou as quatro pendentes **nesta ordem** —
> `20260812120000_saldo_historico_tipo_unico`, `20260814150000_entrega_v1_aditiva`,
> `20260814210000_contrato_proposta` e `20260814230000_cutover_venda_compartilhada` —,
> respondendo *"All migrations have been successfully applied"*. A sexta,
> `20260815190000_seguranca_data_api`, foi aplicada depois, pela auditoria S1, também
> por `pre-deploy` em deploy próprio.
>
> As **duas da Celebração de Venda** — `20260816120000_celebracao_venda` e
> `20260816160000_celebracao_runtime_grants` — entraram em produção pelo `pre-deploy` do
> release `ed1c29f`, a sétima e a oitava. `prisma migrate status` responde **"8 migrations
> found"** e **"Database schema is up to date!"**, com **zero falha ativa**.
>
> O registro da tentativa falhada da oitava permanece em `_prisma_migrations`, marcado
> como revertido, ao lado da aplicação concluída. É histórico operacional correto e
> **não deve ser apagado**.
>
> O risco que a quinta carregava foi tratado por construção, não por sorte: ela zera
> colunas e o runtime que a acompanha exige o estado novo, então rodou no `pre-deploy`
> — **antes** de o processo novo receber tráfego, no mesmo deploy do mesmo commit.

## Testes

Cada baseline é o snapshot de uma entrega: vale como registro do que foi medido
naquele gate, e não como promessa de estabilidade futura. Ficam os sete, em
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

### Baseline da entrega da F3.4

Bateria completa executada sobre os blobs que vieram a ser publicados em `a9fe849`.
Na execução de publicação ela **não** foi repetida: o blob gate provou que a árvore
publicada é idêntica à medida, byte a byte.

| Comando | Resultado verificado |
|---|---|
| `npm test` | 374 testes, 104 suítes, 374 aprovados, 0 falhas, 0 pulados |
| `npm run test:fusos` | 374/374 em `UTC`, 374/374 em `America/Sao_Paulo`, 374/374 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `npm run test:integracao:painel` | 15 testes, 6 suítes, 15 aprovados, 0 falhas |
| `tests/apresentacao-painel.test.ts` isolado | 85 testes, 22 suítes, 85 aprovados, 0 falhas, 0 pulados |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | 18 rotas, exit 0 |
| `git diff --check` | exit 0 |

Os 85 testes e 22 suítes que separam este baseline do da F3.3 são os de
`tests/apresentacao-painel.test.ts`. As duas suítes de integração ficaram inalteradas:
a F3.4 não toca banco.

### Baseline da entrega da F3.5

Bateria completa executada sobre os blobs que vieram a ser publicados em `8684f1d`.
Na execução de publicação ela **não** foi repetida: o blob gate provou que a árvore
publicada é idêntica à medida, byte a byte.

| Comando | Resultado verificado |
|---|---|
| `npm test` | 381 testes, 106 suítes, 381 aprovados, 0 falhas |
| `npm run test:fusos` | 381/381 em `UTC`, 381/381 em `America/Sao_Paulo`, 381/381 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `npm run test:integracao:painel` | 21 testes, 7 suítes, 21 aprovados, 0 falhas |
| `tests/decidir-area-equipes.test.ts` isolado | 7 testes, 2 suítes, 7 aprovados, 0 falhas, 0 pulados |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | 18 rotas, exit 0 |
| `git diff --check` | exit 0 |

Os 7 testes e 2 suítes que separam este baseline do da F3.4 são os de
`tests/decidir-area-equipes.test.ts`; a integração do painel subiu de 15/6 para 21/7
com os testes da cadeia banco → leitura → apresentação.

**O `build` foi validado com `DATABASE_URL` e `DIRECT_URL` sentinelas locais**,
definidas somente no processo e apontando para uma porta sem servidor — nenhum arquivo
`.env*` foi tocado. Se a fiação disparasse consulta durante o build, a conexão recusada
teria derrubado o gate; ele passou, e sem oportunidade de consultar produção.

**Comparação visual automatizada: não executada** — o ambiente de execução não possuía
ferramenta de browser. Isto não é um teste aprovado, e sim uma verificação que não
aconteceu. A preservação visual foi sustentada por evidência estrutural: a composição
passou a ser compartilhada, o markup foi extraído sem redesenho, os três componentes
existentes e o mock ficaram byte a byte intactos, o CSS recebeu só a classe do estado
de equipes, e o build ficou verde com as mesmas 18 rotas.

`test:integracao:painel` é separado de propósito, num diretório próprio que os globs
existentes não alcançam: `obterMetricasPainel` lê as tabelas **inteiras**, então
fixture de outra suíte entraria nas contas. A suíte exige o banco em repouso antes de
começar e falha alto se não estiver, em vez de limpar dado que não é seu. **As duas
suítes de integração nunca devem rodar em paralelo.** Destino local validado nas duas:
`127.0.0.1:5432/casalouzada_test`. Desde a F3.6 esse diretório tem duas suítes:
`painel.integracao.test.ts`, que cria fixtures e exige o repouso descrito, e
`leitura-painel.integracao.test.ts`, que divide o mesmo runner com ela e por isso
foi escrita para **não depender do conteúdo do banco**.

### Baseline da entrega da F3.6

Bateria completa executada sobre os blobs que vieram a ser publicados em `888f779`.
Na execução de publicação ela **não** foi repetida: o blob gate provou que a árvore
publicada é idêntica à medida, byte a byte.

| Comando | Resultado verificado |
|---|---|
| suítes específicas da F3.6 | 75 testes, 23 suítes, 75 aprovados, 0 falhas |
| `npm test` | 462 testes, 130 suítes, 462 aprovados, 0 falhas |
| `npm run test:fusos` | 462/462 em `UTC`, 462/462 em `America/Sao_Paulo`, 462/462 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 33 suítes, 88 aprovados, 0 falhas |
| `npm run test:integracao:painel` | 35 testes, 12 suítes, 35 aprovados, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | 19 rotas, exit 0 |
| `git diff --check` | exit 0 |

As quatro superfícies novas são `tests/contrato-atualizacao-painel.test.ts`,
`tests/retencao-painel.test.ts`, `tests/rota-dados-painel.test.ts` e
`tests/integracao-painel/leitura-painel.integracao.test.ts`; `tests/datas.test.ts`
ganhou a suíte de `horaEmSaoPaulo`. A integração administrativa permaneceu em 88/33.

**RouteContext e typegen.** A primeira execução de `npx tsc --noEmit` depois de criar
a rota nova falhou com `TS2304: Cannot find name 'RouteContext'`: os tipos
route-aware gerados eram anteriores à nova rota. `npx next typegen` (exit 0) os
regenerou e o `tsc` seguinte saiu 0. Não é regressão, e `package.json` não foi
alterado por isso.

**Evidência HTTP local.** `GET /painel/<token válido>/dados` → 200 com
`Cache-Control: no-store`; token inválido → 404; `X-Robots-Tag: noindex, nofollow,
noarchive` presente, coberto pelo matcher já existente de `/painel/:token*`. Com a
conexão de banco apontada de propósito para `127.0.0.1:1`, o GET válido respondeu
HTTP 200 com os três blocos em `INDISPONIVEL` — indisponibilidade é dado, não
exceção.

**Limites da evidência.** Não houve ferramenta de browser automatizado. Não se afirma
teste visual automatizado aprovado, prova automatizada de ausência de flicker, nem
unit test do timer de 60 s ou da rotação visual. A lógica temporal e de retenção foi
provada por testes puros, integração, inspeção estrutural e evidência HTTP local.

**Integração de `lerPainel`.**
`tests/integracao-painel/leitura-painel.integracao.test.ts` usa **um único snapshot**
de `lerPainel(prismaTeste, AGORA)` e deliberadamente **não** faz uma segunda leitura
independente de `obterMetricasPainel` para comparar valor a valor: a suíte divide o
glob com `painel.integracao.test.ts`, que cria e apaga fixtures, e duas leituras
separadas poderiam legitimamente divergir. Ela prova carimbo, estrutura, contrato,
serialização e recomposição do snapshot. É uma limitação registrada, não uma falha.

## Banco de teste

- PostgreSQL **local** em `127.0.0.1:5433`, database `casalouzada_test`, role
  `casalouzada_test` com **`NOCREATEDB`**.
- A connection string vive só em `.env.test.local`, ignorado pelo Git.
- `tests/helpers/banco-teste.ts` exige, antes de conectar: protocolo PostgreSQL, host
  local, database e role esperados. Erro de leitura nunca repassa o valor lido.
- Toda operação destrutiva de teste roda exclusivamente ali.
- Como a role não pode criar shadow database, `prisma migrate dev` não funciona. A
  migration da F2.5 foi gerada por `prisma migrate diff` e aplicada com
  `prisma migrate deploy`. **Foi decisão manter a role restrita** em vez de conceder
  `CREATEDB`. A migration do VGV histórico mensal seguiu a mesma convenção.

### O que o mecanismo faz — e o que ele não faz

`scripts/banco-teste.ts` **injeta variáveis de ambiente** no processo filho
(`DATABASE_URL`, `DIRECT_URL`, `ADMIN_DATABASE_URL`, mapeadas de `*_TEST`) depois de
`urlBancoTeste()` validar protocolo, host local, database e role. Ele **não provisiona
servidor**: se não houver um PostgreSQL escutando em 5433, todas as suítes de integração
falham com `Can't reach database server`. **Não existe mecanismo de bootstrap no
repositório.**

### Ambiente efetivamente usado no ciclo do VGV histórico mensal

Registro honesto do que aconteceu, porque a diferença importa para quem repetir:

- a instância PG17 que esta seção descrevia **não existia mais** na máquina; o que havia
  era um PostgreSQL 18 em 5432, alheio ao projeto e **não usado**;
- o ciclo provisionou um **cluster dedicado e descartável** via `initdb`, com data
  directory próprio, `port = 5433` e `listen_addresses = '127.0.0.1'`, sem tocar a
  instância de 5432. Nele foram criadas as roles `casalouzada_test`, `anon`,
  `authenticated` e `casalouzada_runtime` — as três últimas para que os blocos de RLS e de
  grants das migrations **executem de fato** em vez de caírem no ramo "role não existe";
- versão usada: **PostgreSQL 18.4**. **Produção está em 17.6.** A diferença é favorável às
  provas de `MAINTAIN`, que só existem a partir do 17, mas **é uma divergência real** e
  fica registrada como tal;
- **limitação conhecida:** o data directory desse cluster ficou num diretório temporário de
  sessão, que pode ser limpo. **Não é solução permanente** e não deve ser tratado como
  tal. Recriar exige `initdb` + as quatro roles + `prisma migrate deploy` + `npm run
  db:seed`. Estabilizar isso — caminho fixo, ou um container com a major de produção — é
  trabalho ainda não feito.

## Segurança e credenciais

O histórico aqui tem duas partes, e a segunda **foi encerrada no E6**.

**Depois da F1**, todas as credenciais foram rotacionadas fora do Git — banco,
`DATABASE_URL`, `DIRECT_URL`, `PAINEL_TOKEN`, `AUTH_SECRET` e a senha
administrativa —, com cada revogação comprovada por teste.

**Depois disso, durante a P1**, uma credencial do banco de produção foi **exposta
acidentalmente em transcript** por um erro de tratamento de erro. O histórico:

- não houve evidência de que essa credencial tenha sido versionada no Git em momento
  algum;
- ela permaneceu **sem rotação** de 2026-08-12 até o E6, com o proprietário tendo
  **aceitado explicitamente o risco** para seguir com o desenvolvimento;
- **no E6, antes do go-live, ela foi ROTACIONADA e a antiga está REVOGADA.**

**Estado final: `OLD_DATABASE_CREDENTIAL_REVOKED = YES`**, provado, não inferido:

- a senha do banco foi resetada pelo Dashboard do Supabase, com o gerador oficial dele;
- as connection strings novas — `DATABASE_URL` e `DIRECT_URL` — foram validadas com
  `SELECT 1`, ambas **PASS**;
- as **antigas foram testadas depois do reset** e as duas retornaram
  `28P01 invalid_password`.

Nenhum valor — antigo ou novo — foi publicado em documentação, log, transcript ou Git.
A senha nunca trafegou por argumento de linha de comando: entrou no processo por stdin,
com a ponte via área de transferência, que foi limpa em seguida. A pendência da P1
**está encerrada**.

**O que a auditoria da E5 provou — e o que ela não provou.** A varredura de segredos
cobriu os 129 arquivos versionados e o **histórico inteiro** do repositório: nenhum
`.env` real está versionado hoje **nem esteve em commit algum**; o único arquivo `.env*`
rastreado é o `.env.example`, cujo `AUTH_SECRET`, `PAINEL_TOKEN` e senha de seed estão
**vazios** e cujas connection strings são template, sem host de nuvem. Nenhum JWT, chave
de nuvem ou senha literal foi encontrado. O único hash bcrypt em código é o de descarte
de `src/lib/auth.ts`, deliberado, usado para gastar tempo quando o e-mail não existe.

Repositório limpo e credencial rotacionada são duas afirmações diferentes, e no E5 só a
primeira estava provada. **No E6 a segunda também ficou** — ver acima. Hoje as duas
valem.

## O que ainda NÃO está implementado

Levantado arquivo por arquivo na árvore em `888f779` e atualizado pelos commits
seguintes: `f49f912` alterou dois arquivos CSS e removeu cinco SVGs de scaffold,
`7e0e35d` trouxe os assets da marca e o favicon, `16490f0` acrescentou uma propriedade
a `painel.module.css`, `8b9fce2` criou o mecanismo offline, as três fatias da E2
(`c6464b5`, `fe00fd2`, `18a6599`) trouxeram o modelo aditivo da entrega v1 e a
administração de propostas, precisão de saldo e reservas, `2a50965` fez o cutover da
venda compartilhada e `c24a0c9` entregou o painel operacional A/B.

**A F3 está concluída.** A TV mostra os números reais e os mantém atualizados
sozinha. O que continua não existindo:

- `error.tsx` específico do painel: exceção que escape segue o mecanismo padrão do
  Next, e não há fallback próprio. Isto é uma limitação registrada, não uma fatia
  atribuída;
- **persistência de números** — a retenção da F3.6 continua vivendo só na memória da
  aba, e o offline da F4.4 **não** a estende: por decisão, nenhuma métrica é
  guardada em disco (DEC-048);
- operação em hardware real — o `Phantom Alien 4K IPTV` **foi inspecionado na F4.5A e
  rejeitado** como plataforma do painel (DEC-065). Não existe plataforma de operação
  escolhida hoje, e portanto **não existe operação em hardware real**.

| Item | Estado | Fase |
|---|---|---|
| `src/lib/metricas.ts` | **existe** — núcleo puro, sem leitura | F3.2 feita |
| `src/lib/metricas-prisma.ts` | **existe** — leitura Prisma e conversão para domínio | F3.3 feita |
| `obterMetricasPainel(prisma, agora?)` | **existe** (DEC-041) | F3.3 feita |
| `EstadoLeitura` / `INDISPONIVEL` | **existe** no contrato de leitura (DEC-042) | F3.3 feita |
| `src/lib/apresentacao-painel.ts` | **existe** — shape de apresentação | F3.4 feita |
| `criarApresentacaoPainel(resultado, agora)` | **existe** | F3.4 feita |
| Formatação de moeda `mi`/`bi` e contagens | **existe** no shape (DEC-043, precisão revista pela DEC-069) | F3.4 feita |
| Tradução dos estados para `—` | **existe** no shape | F3.4 feita |
| `/painel/[token]` ligado aos dados reais | **existe** | F3.5 feita |
| `PainelVisual` compartilhado com `/preview` | **existe** | F3.5 feita |
| Big numbers, períodos e rankings reais na tela | **existem** | F3.5 feita |
| Área de equipes reagindo a `INDISPONIVEL`/`CONFIGURACAO_INVALIDA` | **existe** | F3.5 feita |
| Atualização automática do painel real | **existe** — 60 s, timeout de 15 s | F3.6 feita |
| Retenção do último valor conhecido | **existe** — por bloco (DEC-045) | F3.6 feita |
| Comportamento da tela em falha de atualização | **existe** — retenção + selo `atualizado HH:MM` | F3.6 feita |
| `error.tsx` específico do painel | ausente | limitação registrada |
| Troca do mock pela origem real em `/preview` | não se aplica — o preview é fictício por desenho | — |
| Moldura por token, cursor oculto e hairlines em `cqw` | **existem** | F4.1 feita |
| Marca oficial no cabeçalho do painel | **existe** — lockup horizontal, sem wordmark textual (DEC-047) | F4.2 feita |
| Favicon derivado do símbolo oficial | **existe** — `src/app/icon.png` (DEC-047) | F4.2 feita |
| Verificação em 3840×2160 real | **realizada** — Chrome headless, viewport medido | F4.3 feita |
| Largura dos quadros estável sob nome longo | **existe** — `min-width: 0` em `.quadro` | F4.3 feita |
| Comportamento offline de navegação | **existe** — Service Worker e tela institucional, sem guardar números (DEC-048) | F4.4 feita |
| Persistência de métricas em disco | ausente **por decisão** (DEC-048) | — |
| `ParticipacaoVenda` — tabela, unicidades e backfill inicial | **existe** — E2A (`c6464b5`) | E2 feita |
| Crédito compartilhado em execução (divisão de VGV, DEC-052) | **existe** — fração igualitária em centavos, residual por `ordem` | E3 feita |
| UI de venda com múltiplos participantes | **existe** — elenco na criação e na edição | E3 feita |
| Cutover da VENDA (campos nullable, `NULL`, CHECK da DEC-051) | **concluído** — `lancamentos_venda_credito_check` instalado | E3 feita |
| `ParticipacaoVenda` como fonte executável do crédito | **existe** — é a única, desde `2a50965` | E3 feita |
| Status e valor de proposta — modelo e administração | **existem** — E2A + E2B (`fe00fd2`), com CHECK de integridade | E2 feita |
| Lista operacional de propostas `AGUARDANDO` na TV | **existe** — até 3, mais recentes primeiro (DEC-053, DEC-056) | E4 feita |
| Precisão do saldo histórico — modelo e administração | **existem** — `EXATO` / `MINIMO_CONHECIDO` (E2A + E2B) | E2 feita |
| Apresentação "+ de" no painel | **existe** — só nos acumulados (DEC-054) | E4 feita |
| `ReservaLocacao` — modelo e administração | **existem** — E2A + E2C (`18a6599`) | E2 feita |
| Lista de reservas `ATIVA` na TV | **existe** — até 3, mais recentes primeiro (DEC-055, DEC-056) | E4 feita |
| Faixa superior alternando A/B | **existe** — 20 s por tela, sem terceira (DEC-056) | E4 feita |
| Transporte das listas operacionais pelo contrato e pela retenção | **existe** — cinco blocos | E4 feita |
| Deploy no Render | ausente — decisão de infraestrutura é do E6 (DEC-057) | E6 |
| Inventário do `Phantom Alien 4K IPTV` | **realizado** — F4.5A, 2026-08-16 | F4.5A feita |
| Operação no `Phantom Alien 4K IPTV` | **descartada** — aparelho rejeitado como plataforma (DEC-065) | — |
| Plataforma substituta de operação da TV | **escolhida** — Samsung Smart TV do escritório, navegador nativo (DEC-068) | F4.5B feita |
| Validação física da plataforma substituta | **parcial** — aplicação, dados, layout, atualização e celebração comprovados; falta medir resolução/refresh, SW, offline, reboot e estabilidade | F4.5C |
| Operação autônoma da TV (quiosque, autostart, suspensão) | ausente | F4.5D |
| Screen Wake Lock | ausente **por decisão** (DEC-050) | F4.5C, só se o ensaio provar necessidade |
| `public/marca/` | **existe** — duas imagens oficiais | F4.2 feita |
| `src/app/api/`, `src/components/ui/`, `src/styles/` | ausentes | sem fatia atribuída |
| Tela de troca de senha | ausente — o mecanismo é `npm run db:trocar-senha-admin` | futura |
| Metas | ausente por decisão | fora da v1 |

`/painel/[token]` consulta o banco e desenha os números reais. `force-dynamic`
continua garantindo leitura fresca na request **inicial**; desde a F3.6 a aba não
depende só disso — o `AtualizadorPainel` mantém atualização client-side própria, e a
aba parada busca dado novo sozinha.

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
- o resultado tinha, na F3.3, três blocos independentes: `empresa.periodos`,
  `empresa.acumulados` e `equipes` — a E4 acrescentou `propostas` e `reservas`, e hoje
  são cinco. No ramo `INDISPONIVEL` a propriedade `dados` **não existe**, em vez de vir
  nula;
- quatro `findMany` sob `Promise.allSettled` na F3.3, cinco desde a E4 — não
  transaction, não `Promise.all` —, porque conhecer sucesso e falha de cada leitura é o
  que permite sucesso parcial;
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

### F3.4 — shape de apresentação · concluída

Publicada em `a9fe849`, criando `src/lib/apresentacao-painel.ts` e sua suíte, e
alterando o mock e os três componentes do painel. **Nenhuma linha de
`src/lib/metricas.ts` ou de `src/lib/metricas-prisma.ts` foi tocada.**

- entrada única: `criarApresentacaoPainel(resultado, agora)`. O `agora` é
  **obrigatório** — um default criaria um segundo relógio, e o cabeçalho poderia
  anunciar um mês diferente daquele que produziu os números abaixo dele;
- `ApresentacaoPainel` traz `periodo`, `bigNumbers`, `vgvPeriodos`, `quadroMensal`,
  `metricas` e `equipes` em shape display-ready, com os valores de desempenho já
  formatados onde aplicável — `totalCorretores` permanece numérico;
- os tipos visuais (`BigNumber`, `VgvPeriodo`, `Equipe`, `Linha`, `Metrica`,
  `ValorComposto`, `ChaveMetrica`) saíram do mock e passaram a morar aqui; o mock e os
  três componentes agora importam desta camada. O mock **continua fictício**, e
  nenhum componente recebe dado real;
- a ordem não é redeclarada: as oito métricas saem de `CHAVES_RANKING` e as sete
  linhas do quadro mensal de `TIPOS_EVENTO`, ambas do núcleo (DEC-033);
- rótulo do período: mês civil corrente em São Paulo, por `mesCorrente` — "agosto de
  2026";
- contagens em pt-BR, com ponto de milhar e sem `Intl`;
- dinheiro compacto e exato (DEC-043, precisão revista pela DEC-069);
- **nada disso chega à tela ainda**: a rota real não consome esta camada.

#### Estados no shape

| Bloco | Estado de domínio | O que o shape produz |
|---|---|---|
| Empresa | `INDISPONIVEL` | `—` |
| Empresa | `SEM_SALDO_HISTORICO` | `—` no big number daquele tipo, só nele |
| Empresa | `SEM_DADOS` mensal | `—` no VGV mensal e nas sete linhas do quadro |
| Empresa | janela `OK` | zero real é exibido como zero |
| Equipes | `INDISPONIVEL` | estado **sem** lista de equipes |
| Equipes | `CONFIGURACAO_INVALIDA` | estado **sem** lista de equipes |
| Equipes | `SEM_DADOS` | elenco preservado, valores dos rankings em `—` |
| Equipes | `OK` | valores reais |

VGV trimestral e anual continuam com valor real mesmo com o mês em `SEM_DADOS`: são
janelas próprias, e um mês vazio não diz nada sobre elas.

**Precedência:** `CONFIGURACAO_INVALIDA` vem antes de `SEM_DADOS`. Com número de
equipes ativas diferente de três a lista chega vazia do núcleo, e devolver `SEM_DADOS`
faria a tela anunciar "mês sem dados" para um problema que é de cadastro.

#### Dinheiro compacto

Política registrada na DEC-043 e **revista pela DEC-069** na parte da precisão: string
decimal canônica na entrada, centavos em `bigint` e texto na saída — nunca `Number` nem
ponto flutuante. A magnitude inicial usa `mi` abaixo de 1 bilhão e `bi` a partir de 1
bilhão. Zero exato é `R$ 0,0 mi`; um valor **positivo** que o arredondamento levaria a
zero sai como `R$ < 0,1 mi`, para não ficar visualmente idêntico a quem não vendeu nada.

**Precisão, na forma vigente (DEC-069).** Enquanto a unidade exibida for `mi`, há
**sempre uma casa decimal**, qualquer que seja a magnitude — `R$ 42,5 mi`, `R$ 100,0 mi`,
`R$ 100,1 mi`, `R$ 431,0 mi`, `R$ 999,5 mi`. Em `bi` a regra original continua: abaixo de
100 na unidade, uma casa decimal; de 100 para cima, nenhuma (`R$ 4,2 bi`, `R$ 128 bi`).
Depois do half-up a magnitude segue sendo **reavaliada**, e a promoção `mi → bi` acontece
quando o arredondamento alcançaria `1000,0 mi` (999,95 mi → `R$ 1,0 bi`).

*(Histórico: até a DEC-069 a casa decimal caía de 100 para cima em **qualquer** unidade —
`R$ 431 mi` —, e a promoção para `bi` disparava já em 999,5 mi. Isso tornava invisível,
no VGV acumulado, um incremento real de cerca de R$ 100 mil sobre um saldo de centenas de
milhão. A DEC-043 permanece no arquivo como registro daquela decisão.)*

### F3.5 — painel real ligado aos dados · concluída

Publicada em `8684f1d`, criando `painel-visual.tsx`, `decidir-area-equipes.ts` e sua
suíte, e alterando as duas páginas do painel, o CSS e a integração. **Nenhuma linha de
`metricas.ts`, `metricas-prisma.ts`, `apresentacao-painel.ts` ou `mock-painel.ts` foi
tocada**, e os três componentes existentes mudaram zero.

A fatia é **fiação**: não criou cálculo, query, regra monetária, janela civil nem
ranking. A rota apenas compõe o que já existia.

- `/painel/[token]` recebe `params`, valida `PAINEL_TOKEN` com `timingSafeEqual` e
  responde `notFound()` se errar. **Só depois** cria `agora`, chama
  `obterMetricasPainel(prisma, agora)`, passa o resultado a
  `criarApresentacaoPainel(resultado, agora)` e renderiza `PainelVisual`;
- um **único** `const agora = new Date()` alimenta as duas camadas;
- `dynamic = "force-dynamic"` e `robots: { index: false, follow: false, nocache: true }`
  preservados; o token nunca é registrado em log;
- `PainelVisual` é compartilhado entre as duas rotas — o preview continua fictício;
- os estados da área de equipes ganharam representação real (abaixo);
- **sem refresh automático** nesta fatia: uma requisição era uma leitura — limite
  superado pela F3.6.

#### Estados da área de equipes

| Estado | O que a tela faz |
|---|---|
| `OK` | desenha os três `QuadrosEquipe` com os valores reais |
| `SEM_DADOS` | desenha os mesmos quadros, com o elenco preservado — os valores já chegam como `—` |
| `INDISPONIVEL` | "Dados das equipes indisponíveis" |
| `CONFIGURACAO_INVALIDA` | "Configuração de equipes inválida" |

Nos dois últimos **não se chama `QuadrosEquipe`** e não se passa lista vazia nem equipe
fictícia: a área de estado ocupa as três colunas reservadas às equipes, e o quadro
"Mensal geral" continua na primeira, com os números da empresa que seguem válidos. Os
títulos vêm sozinhos — sem stack, nome de tabela ou instrução administrativa, porque a
TV fica à vista de quem passa pelo escritório.

### F3.6 — atualização automática e último valor conhecido · concluída

Publicada em `888f779`, criando o guard compartilhado de token, o contrato HTTP, a
leitura empacotada, o reducer de retenção, a rota de dados, o `AtualizadorPainel` e
quatro superfícies de teste, e alterando a página do painel, `datas.ts`, o
`PainelVisual`, o CSS e `tests/datas.test.ts`. **Nenhuma linha de `metricas.ts`,
`metricas-prisma.ts`, `apresentacao-painel.ts`, `mock-painel.ts` ou dos componentes
de quadro foi tocada.**

#### Leitura inicial

`/painel/[token]` valida o token com `tokenPainelConfere` — helper `server-only` com
`timingSafeEqual`, o **mesmo** da rota de dados —, cria **um único** `agora`, chama
`lerPainel(prisma, agora)` e entrega a leitura ao `AtualizadorPainel`, que renderiza
o `PainelVisual`.

#### Atualização

`AtualizadorPainel` é a fronteira client responsável pela atualização automática da
rota real (`QuadrosEquipe` continua client, com o estado e o timer da rotação de
20 s). O `AtualizadorPainel`:

- token lido por `useParams` — **não** é prop, e não entra em state, storage, query
  string, header novo nem console;
- intervalo de 60 segundos; timeout de 15 segundos por `AbortSignal.timeout`;
- no máximo **uma** request em voo (`useRef`);
- `visibilitychange` provoca tentativa imediata quando a aba volta a ficar visível;
- zero `localStorage`/`sessionStorage`;
- falha não limpa estado: o `catch` não zera nada.

#### Endpoint

`GET /painel/[token]/dados`: token validado **antes** de qualquer toque no banco, 404
para token inválido, um único `agora`, `lerPainel`, resposta JSON com
`Cache-Control: no-store`. O `X-Robots-Tag` já era coberto pelo matcher existente de
`next.config.ts`. Sem `catch` genérico.

#### lerPainel

`src/lib/leitura-painel.ts` — `lerPainel(prisma, agora)` chama `obterMetricasPainel`
e `criarApresentacaoPainel`; **não calcula** e **não formata dinheiro** por conta
própria. Fatia a apresentação nos blocos — três na F3.6, **cinco desde a E4** — e
adiciona `competencia`, `lidoEmMs` e `horaLeitura`. O mesmo `agora` alimenta tudo.

#### Contrato HTTP

`src/lib/contrato-atualizacao-painel.ts` — `LeituraPainel` é JSON-safe.
`ehLeituraPainel` é validação runtime manual, sem Zod: estrutura, quantidades,
equipes, rankings e coerência entre `estadoLeitura` e conteúdo. Payload inválido
**não entra no reducer**.

#### Retenção

Falha de fetch, timeout, HTTP não-200, JSON inválido ou payload fora do contrato → o
estado renderizável permanece o anterior, **inteiro**.

Leitura válida, bloco a bloco:

| Bloco | Nova leitura | Condição | Resultado |
|---|---|---|---|
| periodos | `OK` | — | aceita |
| periodos | `INDISPONIVEL` | anterior `OK`, mesma competência | retém o anterior |
| periodos | `INDISPONIVEL` | competência nova | aceita a indisponibilidade nova |
| acumulados | `OK` | — | aceita |
| acumulados | `INDISPONIVEL` | anterior `OK` | retém — inclusive atravessando o mês |
| equipes | `OK` | — | aceita |
| equipes | `INDISPONIVEL` | anterior `OK`, mesma competência | retém o anterior |
| equipes | `INDISPONIVEL` | competência nova | aceita a indisponibilidade nova |

`SEM_DADOS`, `SEM_SALDO_HISTORICO` e `CONFIGURACAO_INVALIDA` são estados de domínio —
**dados válidos** — e passam: não são alvo de retenção.

A tabela acima é a da F3.6. A **E4 acrescentou `propostas` e `reservas`**, que retêm
como os acumulados — inclusive atravessando a virada de mês — e cuja leitura `OK` com
lista vazia substitui normalmente. Ver a seção da E4.

#### Primeira carga

Retenção só existe quando há valor anterior elegível. Na primeira carga com banco
indisponível, a F3.3 produz blocos `INDISPONIVEL`, a F3.4 produz a apresentação
correspondente e a tela mostra indisponibilidade/`—` — não inventa zero. Não existe
dado anterior para reter.

#### Persistência

O último valor conhecido vive **somente na memória da aba**. Não existe
`localStorage`, `sessionStorage` nem cache persistente da retenção: recarregar a
página durante uma indisponibilidade perde a retenção em memória. Isso **não é
defeito da F3.6** — offline/reload resiliente pertence à F4.

#### Selo

`PainelVisual` pode receber `atualizadoEm`, e o selo discreto `atualizado HH:MM` usa
a hora do bloco `OK` mais antigo ainda exibido. Sem nenhum bloco `OK`, o selo fica
ausente. Não há alerta rico de conexão.

#### Rotação

`QuadrosEquipe` permaneceu intacto: o timer visual continua em 20 s e o refresh de
dados em 60 s — relógios independentes. Nenhuma key de competência ou timestamp
remonta a rotação. (Sem teste visual automatizado disso.)

### Fora da F3

O aviso administrativo para lançamento anterior ao corte, cogitado no planejamento
técnico, **não é requisito da F3**. Fica como possível **F2.6 futura e opcional**;
não bloqueia a F3 e não reabre a F2 agora.

## F4 — Identidade e modo TV

Fase **CONCLUÍDA**, com **F4.0 a F4.5 encerradas**. A F4.5 — operação em hardware real —
foi adiada pela DEC-057 até o go-live da v1 e depois **reestruturada** pela DEC-065: a
**F4.5A** foi executada e o `Phantom Alien 4K IPTV` foi **rejeitado** como plataforma; a
**F4.5B** escolheu a **Samsung Smart TV do escritório**, pelo navegador nativo dela
(DEC-068); a **F4.5C** validou fisicamente por aceite operacional; a **F4.5D** aprovou o
power cycle; e a **F4.5E** deu **PASS** no gate físico final. **A F4 está encerrada.**

### F4.0 — decisões de identidade e modo TV · concluída

As escolhas do proprietário foram resolvidas em 2026-08-13 — depois, portanto, de a
F4.1 já ter sido publicada — e estão registradas nas **DEC-047 a DEC-050**. É fatia
**documental**: nenhum arquivo de código, nenhum asset, nenhuma configuração.

- **DEC-047** — o cabeçalho da TV passará a usar o **lockup horizontal claro** oficial
  no lugar do texto `CASA LOUZADA`, sem exibir os dois ao mesmo tempo; o **símbolo
  isolado**, preferencialmente bege, é a base do favicon. A marca chegou em **PNG
  transparente**; só o recorte de margens transparentes é permitido, e redesenhar,
  vetorizar por aproximação ou recolorir é proibido. Não há favicon oficial separado.
  A implementação é F4.2, **já entregue em `7e0e35d`**.
- **DEC-048** — o offline **não persiste números**. Depois de provisionado ao menos
  uma vez com rede, uma navegação que falhe por falta de rede ou por 5xx pode mostrar
  uma tela institucional que se recupera sozinha e volta ao painel para leitura
  fresca. `404` de token inválido não é indisponibilidade e não é mascarado. A
  implementação é F4.4, **já entregue em `8b9fce2`**.
- **DEC-049** — o hardware alvo é o `Phantom Alien 4K IPTV`. Sistema, firmware,
  navegador e capacidade de quiosque/autostart **não estão comprovados** e não serão
  inferidos. A F4.5 começa por inspeção do aparelho real. **A escolha do hardware foi
  superada pela DEC-065** depois da inspeção da F4.5A: o Phantom **não é mais o alvo**.
  O **princípio permanece** — nenhuma plataforma é descrita sem evidência direta —, e
  agora rege a substituta;
- **DEC-050** — o equipamento **é desligado fora do expediente**. Nada de Screen Wake
  Lock preventivo: a primeira solução para suspensão de tela é configuração
  operacional, e a API só entra se o ensaio da F4.5 provar que ela não basta. Esse
  ensaio passou a ser a **F4.5C**, sobre a plataforma substituta.

### F4.1 — refinamento de modo TV · concluída

Publicada em `f49f912`. O commit toca sete arquivos, e é só isto que ele prova:

- **cinco SVGs de scaffold removidos** — `public/file.svg`, `public/globe.svg`,
  `public/next.svg`, `public/vercel.svg` e `public/window.svg`, herdados do
  `create-next-app` e não referenciados pelo painel;
- **`--color-moldura`** (`#3e382e`) criado em `src/app/globals.css`;
- **`.moldura` passou a usar o token** em vez do literal hexadecimal que morava no
  módulo CSS;
- **cursor oculto somente no painel** — `cursor: none` em `.moldura`; `/admin` e
  `/login` seguem com cursor normal;
- **duas hairlines saíram de `1px` para `0.05cqw`** — a borda esquerda de `.vgvItem`
  e a régua pontilhada de `.linha .rule` —, acompanhando a escala relativa do resto
  do painel (DEC-012).

**Nenhuma alteração em cálculo, em banco ou no comportamento da F3.6.** O commit não
tocou `src/lib/`, `prisma/`, `tests/`, `package.json` nem componente algum: são dois
arquivos CSS e cinco remoções.

#### Baseline da entrega da F4.1

Medido **durante a execução da F4.1**, sobre a árvore publicada em `f49f912`. Fica
registrado aqui, e não na seção "Testes" acima, que reúne os baselines da F2.5 e das
fatias da F3:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 462 testes, 130 suítes, 0 falhas |
| `npm run test:fusos` | 462/462 em `UTC`, 462/462 em `America/Sao_Paulo`, 462/462 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 88 aprovados, 0 falhas |
| `npm run test:integracao:painel` | 35 testes, 35 aprovados, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build`, protegido por `scripts/banco-teste.ts` | exit 0, 19 rotas |
| `git diff --check` | exit 0 |

Houve também **conferência visual manual de `/preview`** — manual, não automatizada.

As contagens repetem as da F3.6 porque a F4.1 é uma fatia de CSS: ela não criou nem
removeu teste algum.

**Estes gates pertencem à execução da F4.1.** A F4.0 foi **exclusivamente
documental**: não reexecutou a suíte, não rodou build nem lint, não repetiu a
conferência visual, e **não reutiliza os resultados acima como se fossem novos**. Eles
são evidência histórica daquela entrega, não medição desta.

### F4.2 — marca oficial e assets · concluída

Publicada em `7e0e35d`, tocando seis caminhos. É só isto que o commit prova:

- **lockup horizontal oficial** em `public/marca/casa-louzada-horizontal-claro.png`;
- **símbolo oficial** em `public/marca/casa-louzada-simbolo-bege.png`;
- **favicon oficial derivado do símbolo** em `src/app/icon.png`, e **remoção** do
  `src/app/favicon.ico` genérico herdado do scaffold;
- `PainelVisual` passou a desenhar o lockup horizontal, e o **wordmark textual
  `CASA LOUZADA` deixou de ser desenhado** — os dois nunca aparecem juntos (DEC-047);
- a **proporção da marca é preservada**: a altura vem do CSS em `cqw` e a largura é
  `auto`, com as dimensões intrínsecas 2511×297 declaradas para reservar a razão;
- `painel.module.css` trocou o bloco do wordmark tipográfico pelo container da
  imagem, e o alinhamento do topo passou de `baseline` para `center`.

Nenhuma outra variante da marca foi versionada: os dois PNGs acima são o que existe
no repositório.

O `src/app/icon.png` entra no build como rota estática própria, e por isso a
contagem de rotas do `next build` passou de 19 para **20** a partir deste commit.

### F4.3 — verificação 4K e microajustes · concluída

Fatia de **verificação**, com um único microajuste publicado.

#### Microajuste — `16490f0`

Os stresses de layout reproduziram um defeito concreto: um **nome longo de corretor**
fazia uma coluna da `.faixaBase` crescer pelo `min-content` automático do CSS Grid e
**comprimir as outras três**, em vez de o rótulo usar o ellipsis que já existia. Como
o elenco de cada ranking muda a cada 20 s com a rotação, as quatro colunas mudariam
de largura junto com ela.

A correção é uma propriedade em `src/components/painel/painel.module.css`:

```css
.quadro {
  ...
  min-width: 0;
}
```

Com ela as tracks ficam estáveis e o rótulo passa a reticenciar. Publicada em
`16490f0` — `fix: estabiliza largura dos quadros do painel`, um arquivo, nove linhas.

Os stresses posteriores de `.faixaBig` e `.faixaVgv` **não reproduziram** o mesmo
defeito, então **nenhuma propriedade preventiva foi acrescentada a elas**.

#### Baseline da entrega da F4.3

Medido sobre a árvore que contém o microajuste, isto é, a que veio a ser publicada em
`16490f0`:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 462 testes, 130 suítes, 0 falhas |
| `npm run test:fusos` | 462/462 em `UTC`, 462/462 em `America/Sao_Paulo`, 462/462 em `Asia/Tokyo` |
| `npm run test:integracao` | 88 testes, 0 falhas |
| `npm run test:integracao:painel` | 35 testes, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, **20 rotas** |
| `git diff --check` | exit 0 |

As contagens repetem as da F3.6 e da F4.1 porque a F4.3 é uma fatia de CSS: ela não
criou nem removeu teste algum. A subida de 19 para 20 rotas veio da F4.2, não daqui.

**O gate final em Chrome headless foi exclusivamente visual e dimensional e NÃO
reexecutou essas suítes** — nenhum código mudou entre a bateria acima e ele, e os
números desta tabela não devem ser reapresentados como medição daquela execução.

#### Gate 4K

Executado com **Chrome headless real** (151.0.7922.138), dirigido por **Chrome
DevTools Protocol**, em processo e perfil isolados. **Não houve commit**: a fatia era
verificação, e o repositório terminou intocado.

Medido no navegador, não inferido:

| Item | Medido |
|---|---|
| `window.innerWidth` | **3840** |
| `window.innerHeight` | **2160** |
| `devicePixelRatio` | **1** |
| `visualViewport.scale` | **1** |
| `.tv` | **3840 × 2160** |
| Overflow global e interno | **zero** — `scrollWidth == clientWidth` e `scrollHeight == clientHeight` |
| Screenshot PNG | **3840 × 2160** exatos |
| Marca | intrínsecos **2511×297**, proporcional, sem clipping |

Mínimos da seção 6 do PLANO, com os valores exatos que o navegador devolveu — sem
arredondar para cima:

| Elemento | Medido | Mínimo |
|---|---|---|
| Big number | **220.032px** | 220 |
| VGV por período | **110.208px** | 110 |
| Nome de corretor | **44.16px** | 44 |
| Valor de lista | **48px** | 44 |
| Rótulos, período e subtítulos | **32.256px** | 32 |

As margens de `220.032px` e `32.256px` são **marginais**, e ficam registradas assim.

#### Hairlines — observação operacional

Não é falha da F4.3, e sim item a conferir no ensaio físico:

- em Chrome 4K com **DPR 1**, as duas borders declaradas como `0.05cqw` (nominalmente
  1.92px) computam e renderizam em aproximadamente **1 device pixel**;
- elas **estão presentes e visíveis** na inspeção 1:1 do screenshot — o separador
  vertical da faixa VGV é contínuo, e a régua pontilhada alterna 1px ligado / 1px
  desligado;
- são **decorativas**: nenhuma informação do painel depende delas;
- a **percepção real a 3–6 metros deve ser conferida no ensaio físico da F4.5**;
- **nenhum ajuste adicional foi feito na F4.3**, por falta de evidência física que o
  justificasse.

### F4.4 — offline de navegação · concluída

Publicada em `8b9fce2`, com quatro caminhos: três arquivos novos e a montagem na
página do painel.

#### Arquivos

| Caminho | Papel |
|---|---|
| `public/painel/sw.js` | Service Worker escrito à mão, sem Workbox e sem dependência |
| `public/painel/offline.html` | tela institucional autossuficiente, sem framework |
| `src/components/painel/registrar-sw.tsx` | Client Component que só registra o SW e devolve `null` |
| `src/app/painel/[token]/page.tsx` | monta `RegistrarSwPainel` ao lado do `AtualizadorPainel` |

A página não ganhou nenhuma outra responsabilidade: validação do token, ordem token →
banco, `agora` único, `lerPainel`, `metadata` e `force-dynamic` ficaram intactos.

#### Escopo

O Service Worker é registrado em `/painel/sw.js` com scope **`/painel/`**. O registro
**não conhece o token** — o escopo cobre qualquer um sem precisar dele, e manter o
segredo fora desse caminho evita que apareça em log de registro ou erro do navegador.

`/preview`, `/login` e toda a administração **não são páginas controladas**.

#### Cache

Cache único, `casalouzada-painel-offline-v1`, com **exatamente dois** itens:

- `/painel/offline.html`
- `/marca/casa-louzada-horizontal-claro.png`

O que **não** entra no cache, e é o ponto da DEC-048:

- o **HTML normal do painel** não é cacheado;
- `/painel/[token]/dados` **não** é interceptado nem cacheado;
- nenhum **JSON** é cacheado;
- nenhuma **métrica** é persistida;
- o **token** não entra no cache — nenhuma URL com token é armazenada.

Não há `cache.put` de resposta nenhuma; o único `addAll` é o dos dois institucionais.
A limpeza no `activate` filtra pelo prefixo próprio, então nunca apaga cache de
terceiros. **A retenção da F3.6 continua exclusivamente em memória da aba** — o
offline não a estende nem a substitui.

#### Fallback

Só navegações (`request.mode === "navigate"`) entram na política:

| Situação | Resposta |
|---|---|
| Erro de rede/transporte | tela institucional |
| HTTP **500–599** | tela institucional |
| Qualquer status **abaixo de 500** | a resposta real, sem cacheá-la |
| `404` de token inválido | **continua sendo 404** (DEC-010) |

O teste é pelo **status**, nunca por `response.ok` — `ok` é falso para 404, e usá-lo
mascararia um erro de configuração da TV atrás de uma promessa de reconexão que nunca
se cumpriria.

#### Recuperação

A tela institucional **mantém a URL do painel** na barra de endereços, tenta recuperar
sozinha num ciclo de **15 segundos**, reage também ao evento `online`, e nunca deixa
duas tentativas em voo ao mesmo tempo. Ao obter resposta de rede **abaixo de 500**,
recarrega a URL real — o que devolve o painel em `200` e mostra o 404 verdadeiro se o
token estiver errado. Em `>= 500`, erro de transporte ou timeout, permanece na tela.

Ela não mostra número, nome, VGV nem horário de última leitura, e não lê storage.

#### Provisionamento

**Um perfil de navegador que nunca instalou o Service Worker continua dependendo de
rede na primeira inicialização** — não existe tela institucional para mostrar antes do
primeiro provisionamento online. Isso é parte explícita da DEC-048, não uma limitação a
corrigir.

Depois do primeiro provisionamento com rede, **registro e cache persistem entre
processos do navegador**, o que foi comprovado (abaixo).

#### Evidência funcional

Aceites executados em Chrome real (headless, perfil temporário, dirigido por Chrome
DevTools Protocol), em 2026-08-14, sobre o build de produção apontando para o banco
local de teste:

| # | Aceite | Resultado |
|---|---|---|
| 1 | Provisionamento online | SW `activated`, scope `/painel/`, página controlada |
| 2 | Escopo restrito a `/painel/` | confirmado |
| 3 | `/preview` | `controller === null` |
| 4 | `/login` | `controller === null` |
| 5 | Servidor morto + reload | tela institucional, URL preservada |
| 6 | Recuperação automática | painel de volta sozinho |
| 7 | HTTP 503 | tela institucional |
| 8 | Token inválido | **404 real**, com a página controlada pelo SW |
| 9 | `/dados` após leitura real | ausente do cache; cache segue com dois itens |
| 10 | `offline.html` | meta robots presente, mais o `X-Robots-Tag` já existente |
| 11 | Perfil virgem + servidor morto | sem fallback, como a DEC-048 prevê |
| 12 | Chrome encerrado por completo após provisionar | 8 → 0 processos do perfil |
| 13 | Novo processo, mesmo perfil, servidor já morto | **tela institucional** |
| 14 | Registro e cache entre processos | persistiram, com os mesmos dois itens |
| 15 | Servidor de volta | retorno automático ao painel real, vindo da rede |

Em nenhum dos aceites apareceu número antigo em tela.

#### Baseline da entrega da F4.4

Medido sobre a árvore publicada em `8b9fce2`:

| Comando | Resultado verificado |
|---|---|
| `npm test` | 462 testes, 130 suítes, 0 falhas |
| `npm run test:fusos` | 462/462 nos três fusos |
| `npm run test:integracao` | 88 testes, 33 suítes, 0 falhas |
| `npm run test:integracao:painel` | 35 testes, 12 suítes, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, 20 rotas |
| `git diff --check` | exit 0 |

As contagens repetem as das fatias anteriores porque a F4.4 não criou nem removeu
teste algum: a lógica do Service Worker só existe dentro do runtime do navegador, e os
aceites acima a exercitam melhor do que uma simulação faria. **Estes resultados
pertencem à execução da implementação da F4.4, não a esta execução documental.**

### F4.5 — operação em hardware real · concluída, depois de reestruturada

A fatia foi adiada em 2026-08-14 (DEC-057) porque a entrega da v1 por URL vinha antes;
com o go-live feito, ela foi retomada. A **F4.5A foi executada em 2026-08-16** e o seu
resultado **mudou a estrutura da fatia** (DEC-065): ela deixou de ser "validar o
Phantom" e passou a ser "selecionar e validar a plataforma substituta".

| Fatia | Escopo | Estado |
|---|---|---|
| **F4.5A** | avaliação do `Phantom Alien 4K IPTV` | **concluída — HARDWARE REJEITADO** |
| **F4.5B** | seleção da plataforma substituta | **concluída** — Samsung Smart TV (DEC-068) |
| **F4.5C** | validação física da plataforma substituta | **concluída** — aceite operacional físico |
| **F4.5D** | operação autônoma | **concluída** — power cycle PASS |
| **F4.5E** | gate físico final | **concluída — PASS** |

#### F4.5A — avaliação do Phantom · concluída

Inspeção física do aparelho real, sem commit de código. **Só o que foi observado no
equipamento está registrado abaixo** — nada é inferido, e nada aqui descreve outra
plataforma.

**Sistema e navegador:**

| Item | Observado |
|---|---|
| Sistema | Android 7.0 |
| Patch de segurança | 1 de dezembro de 2018 |
| Kernel | `3.18.24_hi3798mv2x` |
| Build | `NRD90M release-keys` |
| Arquitetura | ARM 32 bits — `Linux armv7l` |
| Navegador | Chrome 112.0.0.0 |

**Display.** A UI do aparelho oferece **apenas 720P e 1080P** — **não existe opção 4K**
nela. A saída HDMI estava em **1080P 60Hz**, e as opções 2160P disponíveis são
**30/25/24Hz**. **Não se afirma qual sinal a TV efetivamente recebeu**: isso não foi
comprovado; o que se observou foi a seleção na UI do aparelho.

**Painel.** `/preview` abre no aparelho. `/painel/<TOKEN>` abre no aparelho e **exibe os
dados reais**. O token **não é publicado** aqui nem em lugar algum do repositório.

**APIs comprovadas no aparelho:** `fetch`, `localStorage`, `Promise`/`async`, optional
chaining, container queries e Fullscreen API.

**APIs inconclusivas:** **Service Worker, Cache Storage e Wake Lock**. A sonda foi aberta
em **contexto HTTP inseguro**, e nesse contexto o navegador não oferece esses recursos
por regra de contexto seguro — a medição, portanto, **não distingue ausência de suporte
de indisponibilidade por contexto**. **Não se declara ausência de suporte.** A F4.4
continua precisando ser reprovada num navegador real, agora o da plataforma substituta.

#### Achado de viewport — do Phantom / Chrome Android observado

Na configuração medida:

| Item | Valor |
|---|---|
| `screen` | 1280 × 720 |
| `viewport` | 1280 × 624 |
| `devicePixelRatio` | 1 |

A barra do Chrome ocupava parte da área vertical. O painel usa `100vh`, e **naquele
navegador** o layout foi montado para uma altura maior que a área efetivamente visível,
**cortando a faixa inferior**.

Isto fica registrado como **achado do Phantom e daquele Chrome Android**, e **não** como
defeito universal do painel: o gate 4K da F4.3, em Chrome desktop com viewport de
3840×2160, não apresentou overflow nem corte. **Nenhuma correção de código foi feita** —
nem `100dvh`, nem nada. O hardware foi descartado e o substituto não foi testado; ajustar
agora seria otimizar para uma plataforma que não vai operar o painel. O achado é insumo
da **F4.5C**.

#### Decisão de descarte

O `Phantom Alien 4K IPTV` **não será usado como plataforma definitiva do painel**
(DEC-065). Os motivos são **observacionais**: plataforma antiga, Android 7, patch de
segurança de 2018, Chrome 112, UI limitada a 1080p, 2160p disponível apenas até 30 Hz, e
operação por navegador que não atende de forma limpa ao objetivo atual.

**O aparelho não foi declarado defeituoso.** Ele é **inadequado ao objetivo definido**.

#### F4.5B — seleção da plataforma substituta · concluída

A escolha é a **Samsung Smart TV que já existe no escritório**, com o painel aberto
**direto no navegador dela** — o recurso "Serviço da Web" do PC on TV. **Nenhum hardware
externo entra na operação**: sem box, sem mini PC, sem notebook acoplado. A decisão
durável é a **DEC-068**.

A escolha não foi teórica: ela veio de um **ensaio físico bem-sucedido** na própria TV,
descrito na seção "F4.5B" do estado executivo. Evidência direta no aparelho que o
escritório já tem venceu a busca por um substituto a comprar.

**Modelo da TV e versão do Tizen/navegador não foram identificados**, e nada se afirma
sobre eles. Os **critérios de escolha** que estavam registrados continuam valendo como
pauta da F4.5C, agora como coisas **a medir na Samsung**, não a procurar num catálogo:
saída 3840×2160 a 60 Hz; fullscreen/quiosque; autostart ou restauração automática;
Service Worker; Cache Storage; comportamento após reboot; controle de suspensão/tela; e
operação sem intervenção diária além de ligar e desligar.

#### F4.5C, F4.5D e F4.5E · concluídas

A **F4.5C** fechou por **aceite operacional físico**: o produto real rodou na Samsung
real, com dados reais, layout aprovado visualmente e nenhuma incompatibilidade que
impeça o uso. Os critérios de evidência da DEC-049 continuam valendo integralmente —
nada de sistema, navegador, resolução ou API registrado sem medição no aparelho —, e é
por isso que resolução e refresh efetivos, viewport, DPR, versão do engine, versão do
Tizen, Service Worker e Cache Storage seguem **NÃO MEDIDOS**. **Não se declara 4K60.**
Não medido **não é** reprovado: nenhum desses itens bloqueou o aceite.

A **F4.5D** fechou com o **power cycle aprovado** — desligada e religada, a TV volta
direto ao painel, sem reconfiguração. A evidência é comportamental; nenhum autostart de
API foi identificado nem é afirmado.

A lista exata do que está comprovado e do que não está fica nas seções "F4.5C" e "F4.5D"
do estado executivo. O achado de viewport abaixo, a percepção das hairlines a 3–6 metros
(F4.3) e o julgamento do Wake Lock (DEC-050) seguem como pauta possível do gate final.

A **F4.5E** é o gate físico final, e **passou**: o proprietário aprovou explicitamente a
Samsung como plataforma definitiva, sobre a cadeia de evidência acumulada. Com ela
fecharam a **F4.5** e a **F4**.

## Entrega v1 — decisões de produto e modelo (E1)

Aprovada pelo proprietário em **2026-08-14** e registrada nas **DEC-051 a DEC-057**.

**A E1 foi exclusivamente documental e está concluída e publicada em `078f360`**
(com a correção de sequenciamento E1.1 registrada em seguida). O texto desta seção é o
**contrato de produto** aprovado ali; o que dele já existe em código veio com a E2.

**O que a E2 implantou:** o schema tem `participacoes_venda`, `reservas_locacao`,
`lancamentos.valor_proposta`, `lancamentos.status_proposta` e
`saldo_historico.precisao`, com os backfills feitos; a administração de propostas,
precisão de saldo e reservas de locação está no ar.

**O que a E3 implantou (`2a50965`):** o cutover da venda compartilhada. O núcleo credita
venda por `ParticipacaoVenda`, com divisão igualitária exata em centavos; a
administração registra venda com N participantes; e o banco protege o estado final com
o `CHECK lancamentos_venda_credito_check`.

**O que a E4 implantou (`c24a0c9`):** a faixa superior alternada, as duas listas
operacionais, o "+ de" dos acumulados e a extensão do contrato de atualização e da
retenção para transportá-las. **O contrato de produto da E1 está inteiramente
implementado**; o que resta da Entrega v1 é gate (E5) e go-live (E6).

### Baseline do fechamento da E2

Medido sobre a árvore que veio a ser publicada em `18a6599` — a fatia E2C —, **antes**
do commit. A publicação **não** reexecutou suíte nenhuma: ela publicou os **mesmos
bytes auditados**, o que os caminhos staged comprovaram.

| Comando | Resultado verificado |
|---|---|
| `npx prisma validate` | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm test` | 503 testes, 137 suítes, 0 falhas |
| `npm run test:fusos` | 503/503 em `UTC`, `America/Sao_Paulo` e `Asia/Tokyo` |
| `npm run test:integracao` | 123 testes, 45 suítes, 0 falhas |
| `npm run test:integracao:painel` | 35 testes, 12 suítes, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, 23 rotas |
| `git diff --check` | exit 0 |

A integração foi executada **três vezes consecutivas com resultado verde** depois da
correção de uma fixture concorrente: o teste de unicidade sob concorrência de
`saldo-historico.integracao.test.ts` disputava a unique `saldo_historico.tipo` com a
suíte da entrega v1, porque ambos usavam `LOCACAO` e os arquivos rodam em paralelo. A
correção trocou o tipo daquele teste para `CAPTACAO_EXCLUSIVA`, sem remover ou relaxar
asserção alguma.

As três fatias da E2 foram publicadas em `c6464b5`, `fe00fd2` e `18a6599`; os
baselines intermediários de E2A e E2B não são repetidos aqui — o que vale como
snapshot do fechamento é a tabela acima.

### Baseline do fechamento da E3

Medido sobre a árvore que veio a ser publicada em `2a50965`, **antes** do commit. A
publicação **não** reexecutou suíte nenhuma: ela publicou os **mesmos bytes
auditados**, o que os SHA-256 dos 21 caminhos comprovaram um a um.

| Comando | Resultado verificado |
|---|---|
| `npx prisma validate` | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm test` | 545 testes, 144 suítes, 0 falhas |
| `npm run test:fusos` | 545/545 em `UTC`, `America/Sao_Paulo` e `Asia/Tokyo` |
| `npm run test:integracao` | 156 testes, 51 suítes, 0 falhas |
| `npm run test:integracao:painel` | 39 testes, 13 suítes, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, 23 rotas |
| `git diff --check` | exit 0 |

**Estabilidade:** depois do gate, `npm run test:integracao` rodou **mais três vezes
consecutivas**, sem alteração de árvore entre elas — 156/51/0 nas três.

**Prova de data migration E2→E3: 12/12**, no banco local. Cenário montado no estado E2
(venda antiga com participação, venda da janela **sem** participação, captação e
proposta válida sob o CHECK da E2B), migration aplicada, e então: zero VENDA sem
participação; a participação antiga preservada; a da janela criada com `ordem = 1`,
snapshot copiado e carimbo do lançamento; toda VENDA com os campos antigos `NULL`; todo
não-VENDA com eles preenchidos; `CHECK` final presente; recusa de VENDA com crédito
antigo e de não-VENDA sem crédito; `CHECK` de proposta ainda ativo; uniques e FKs de
`participacoes_venda` funcionando; e `Cascade` no delete.

**Fresh install:** `migrate reset --force` aplicou as **cinco** migrations do zero,
exit 0, seguido de `db seed` OK.

### E4 — painel operacional A/B e novos estados · concluída

Publicada em **`c24a0c9`**, em 23 caminhos — 19 modificados e 4 novos, `+2080/−80`.
**Nenhuma linha de schema, migration, administração ou validação foi tocada**: a E4 é
inteiramente de leitura, domínio de apresentação e componentes.

#### Rotação

Duas telas e só duas, 20 segundos cada, `A → B → A → B`. A Tela A é a inicial. A regra
mora em `src/components/painel/rotacao-faixa.ts` — sem React, sem DOM, sem timer —,
e é isso que a torna testável: o componente importa o módulo de estilos, e o runner do
Node não parseia CSS. O `useEffect` da faixa depende **apenas** da tela ativa, então o
refresh de 60 s troca o conteúdo por baixo sem reiniciar o ciclo; amarrar os dois faria
a Tela B aparecer em intervalos irregulares sempre que a rede oscilasse.

#### Seleção operacional

Regra **exclusivamente no núcleo** (DEC-013), com `MAXIMO_DESTAQUES = 3` como fonte
única do corte:

1. filtro de status — `AGUARDANDO` nas propostas, `ATIVA` nas reservas;
2. `dataReferencia` decrescente;
3. `criadoEm` decrescente;
4. `id` crescente;
5. corte em 3.

Os dois últimos desempates não são preciosismo: sem eles, dois itens gravados no mesmo
dia — ou no mesmo instante — poderiam trocar de lugar a cada atualização da TV sem nada
ter mudado. A ordenação copia a lista antes de ordenar; a do chamador não é mexida.

A **proposta legada sem imóvel continua selecionada** (DEC-053) e a apresentação diz
"Imóvel não informado" — sumir da lista seria perder de vista algo genuinamente em
aberto. Toda proposta continua contando na métrica mensal qualquer que seja o status: o
filtro vale só para a lista.

#### Precisão do saldo na apresentação

`MINIMO_CONHECIDO` **não muda conta nenhuma**. Ele viaja junto do acumulado e a
apresentação prefixa "+ de". O qualificador é campo próprio, e não o `prefixo` do
`ValorComposto` — aquele significa **moeda**, e misturar os dois daria dois sentidos ao
mesmo campo. Por isso a contagem sai `+ de 527` e o dinheiro, `+ de R$ 800 mi`, com o
"+ de" antes do `R$`.

A precisão do saldo de `VENDA` qualifica **imóveis vendidos e VGV acumulado**; a de
`AVALIACAO_GOOGLE`, **as avaliações**. Nunca aparece em mês, trimestre, ano, quadro
mensal ou ranking. `SEM_SALDO_HISTORICO` continua `—`: o `Acumulado<T>` virou união
discriminada e o ramo sem valor **não tem** campo de precisão, o que torna "+ de —"
inexprimível em vez de meramente evitado.

#### Leitura, contrato e retenção

`LeituraPainel` passou a ter **cinco** blocos: `periodos`, `acumulados`, `equipes`,
`propostas` e `reservas`. As dependências continuam sendo o que decide o que cai junto:

| Falha | Efeito |
|---|---|
| leitura de `reservas_locacao` | só `reservas` fica `INDISPONIVEL` — propostas e métricas seguem |
| leitura de lançamentos | derruba `propostas` junto dos blocos que já dependiam dela |

Retenção das duas listas:

| Nova leitura | Condição | Resultado |
|---|---|---|
| `OK` com itens | — | substitui |
| `OK` com lista **vazia** | — | **substitui** — vazio significa "não há nada em aberto", e reter as anteriores deixaria na parede itens que já saíram |
| `INDISPONIVEL` | anterior `OK` | retém a última lista conhecida |
| `INDISPONIVEL` | virada de mês | **retém mesmo assim** — as listas descrevem o que está em aberto agora, não produção mensal; uma proposta aguardando em 31/08 continua aguardando em 01/09 |

O selo `atualizado HH:MM` passou a considerar os **cinco** blocos `OK`: a rotação põe as
listas na parede tanto quanto os big numbers, e um selo que as ignorasse dataria só
metade do que se vê.

O contrato runtime rejeita `INDISPONIVEL` que venha **com** `itens` — um bloco caído
carregando lista apagaria da parede a lista retida — e aceita `OK` com zero a três; um
payload com quatro itens está fora do contrato.

#### Visual

- a faixa superior tem **altura estrutural fixa relativa**, `11.6cqw`, igual nas duas
  telas;
- **nenhuma dimensão estrutural nova em px**: as três ocorrências de `px` no diff do CSS
  são comentário;
- verificação feita em **3840×2160** com `devicePixelRatio` **1**, com `.tv` medindo
  **3840 × 2160** e **overflow zero** nas duas telas;
- **Tela A e Tela B mediram 445,44 de altura** depois da correção, e as faixas de VGV e
  base **não deslocam** na rotação;
- o **menor texto operacional** mediu **61,44px**, acima do mínimo de 44px da §6 do
  PLANO.

O defeito que motivou a altura travada foi encontrado **só** nessa verificação: com
`min-height`, a Tela B ficava 36,79px mais alta que a Tela A e empurrava as faixas de
baixo a cada 20 segundos. Nenhum teste pegaria isso. Estas medições são registro do que
foi medido, **não** decisão de produto nova.

#### Baseline do fechamento da E4

Medido sobre a árvore que veio a ser publicada em `c24a0c9`, **antes** do commit e
**depois** da correção de layout e do rebuild. A publicação **não** reexecutou suíte
nenhuma: ela publicou os **mesmos bytes auditados**, o que os SHA-256 dos 23 caminhos
comprovaram um a um, 23/23, zero divergentes.

| Comando | Resultado verificado |
|---|---|
| `npx prisma validate` | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm test` | 606 testes, 152 suítes, 0 falhas |
| `npm run test:fusos` | 606 × 3 — `UTC`, `America/Sao_Paulo` e `Asia/Tokyo`, suíte estável |
| `npm run test:integracao` | 156 testes, 51 suítes, 0 falhas |
| `npm run test:integracao:painel` | 49 testes, 14 suítes, 0 falhas |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, 23 rotas |
| `git diff --check` | exit 0 |

**Estabilidade:** `test:integracao:painel` rodou **três vezes consecutivas**, sem
alteração de árvore entre elas — 49/14/0 nas três.

A **verificação visual 4K foi concluída** e é parte do gate desta etapa, não um extra:
foi ela, e só ela, que expôs o deslocamento de layout descrito acima.

### E5 — gate final e certificação do release candidate · concluída

Etapa de **certificação**, executada sobre o estado publicado em `6d55617`. Não
implementou feature, **não criou commit de código** e terminou com a árvore byte a byte
como começou. Resultado: **`RELEASE_CANDIDATE_READY_FOR_E6 = YES`**.

Antes de medir, ficou provado que **entre a E4 (`c24a0c9`) e o estado auditado só
mudaram os três Markdown** — é isso que autoriza transportar a evidência visual 4K da
E4 para este release candidate sem remedi-la.

#### Baseline do fechamento da E5

| Comando | Resultado verificado |
|---|---|
| `npx prisma validate` | exit 0 |
| `npx prisma generate` | exit 0 |
| cadeia fresca de migrations (LOCAL) | 5 migrations na ordem, seed OK, `migrate status` **"Database schema is up to date!"** |
| `npm test` | 606 testes, 152 suítes, 0 falhas, 0 pulados |
| `npm run test:fusos` | `UTC` 606/606/0 · `America/Sao_Paulo` 606/606/0 · `Asia/Tokyo` 606/606/0 |
| `npm run test:integracao` | **3 rodadas consecutivas**: 156/51/0, 156/51/0, 156/51/0 |
| `npm run test:integracao:painel` | **3 rodadas consecutivas**: 49/14/0, 49/14/0, 49/14/0 |
| `npx tsc --noEmit` | exit 0, sem saída |
| `npm run lint` | exit 0, **zero warnings** |
| `tsx scripts/banco-teste.ts npm run build` | exit 0, 23 rotas |
| smoke local do build de produção | **PASS** |
| 11 invariantes | **11/11 PASS** |
| contratos da v1 (DEC-051 a DEC-056) | **PASS** |
| `git diff --check` | exit 0 |
| working tree | vazio, antes e depois |

A cadeia de migrations foi exercitada do zero **somente no banco local de teste**,
`127.0.0.1:5432/casalouzada_test`, pelo wrapper que valida o destino antes de conectar.

#### Smoke local do build de produção

Processo `next start` efêmero, porta local, banco local, encerrado ao fim. O token do
painel foi lido pelo próprio script e **nunca impresso**.

| Requisição | Resultado |
|---|---|
| `GET /preview` | 200 |
| `GET /admin` sem sessão | redireciona para o login, preservando o destino |
| `GET /login` | 200 |
| `GET /painel/<token inválido>` | 404 |
| `GET /painel/<token inválido>/dados` | 404 |
| `GET /painel/<token local válido>` | 200, com `X-Robots-Tag: noindex, nofollow, noarchive` e meta robots noindex |
| `GET /painel/<token local válido>/dados` | 200, `Cache-Control: no-store`, contrato com **cinco blocos** — `acumulados`, `equipes`, `periodos`, `propostas`, `reservas` |
| assets institucionais do offline (`offline.html`, `sw.js`, marca) | 200, 200, 200 |

Com o banco recém-resetado, a resposta trouxe os três acumulados em
`SEM_SALDO_HISTORICO` e as duas listas em `OK` com zero itens — **ausência não virou
zero, e lista vazia não virou `0`**. É a prova em runtime da DEC-014.

**Observação registrada, não defeito.** O token aparece no HTML de `/painel/<token>`:
é o parâmetro de rota serializado no payload RSC para o componente cliente lê-lo por
`useParams`. Quem tem o HTML já tem a URL — não há exposição além do desenho aprovado
na DEC-009.

#### O que a E5 auditou por código, além dos testes

- **camadas** — `metricas-prisma.ts` não tem `reduce`, `sort`, `groupBy`, `aggregate`,
  `take`, `orderBy` nem literal de status; `apresentacao-painel.ts` não recalcula; os
  componentes do painel não filtram, não ordenam e não cortam. Não há segunda fonte de
  verdade;
- **mock isolado** — `mock-painel.ts` é importado **exclusivamente** por `/preview`; as
  duas rotas reais importam apenas `prisma`, `lerPainel`, `tokenPainelConfere` e os
  componentes;
- **constraints vivas no banco** — `lancamentos_venda_credito_check` e
  `lancamentos_proposta_campos_check` presentes; `RESTRICT` em corretor e equipe de
  `lancamentos`, `participacoes_venda` e `reservas_locacao`; `CASCADE` só da participação
  para o lançamento; uniques de `participacoes_venda` e de `saldo_historico.tipo`;
- **reservas** — **nenhum `.delete`/`deleteMany` em toda a área administrativa** e
  nenhum `lancamento.create`: sem hard delete e sem `LOCACAO` automática;
- **CSS do painel** — **zero declarações estruturais em px**; as ocorrências de `px` são
  todas comentário. 72 usos de `cqw`;
- **marcadores** — nenhum `TODO`/`FIXME`/`HACK`/`XXX` real em código executável.

### E6 — go-live no Render + smoke público · concluída

O go-live da v1. **Sem commit de código**: o release implantado é o `adabe2d`, o mesmo
que a E5 certificou. A ordem foi escolhida para minimizar exposição — rotação da
credencial **antes** de qualquer secret entrar no Render, e migrations no `pre-deploy`
**antes** de o processo novo receber tráfego.

#### Infraestrutura

| Item | Valor |
|---|---|
| Serviço | `dashboard-casalouzada` (Render Web Service) |
| Região / plano | Virginia / Starter |
| Node | 24.19.0 |
| Auto-deploy | **OFF** |
| Build | `npm ci && npm run build` |
| Pre-deploy | `npm run db:deploy` |
| Start | `npm start` |
| Health check | `/login` |
| URL pública | `https://dashboard-casalouzada.onrender.com` |
| URL do painel | `https://dashboard-casalouzada.onrender.com/painel/<TOKEN>` |

O plano **Starter** foi escolhido, com autorização explícita do proprietário, para
evitar o comportamento de instância Free — que desliga após 15 minutos sem tráfego e
leva cerca de um minuto para voltar, inaceitável numa TV que fica ligada o dia inteiro —
e para permitir o `pre-deploy` das migrations.

#### Conexões de produção — arquitetura, sem valores

| Variável | Papel | Modo | Role PostgreSQL | TLS |
|---|---|---|---|---|
| `DATABASE_URL` | runtime da aplicação | Supabase **Transaction Pooler**, porta 6543 | **`casalouzada_runtime`** | `sslmode=verify-full` + `sslrootcert` |
| `DIRECT_URL` | migrations do Prisma | Supabase **Session Pooler**, porta 5432 | **`postgres`** | `sslmode=require` + `sslaccept=strict` + `sslcert` |

A separação de **modo** importa: `prisma migrate deploy` não pode rodar em transaction
mode, porque o pooler nesse modo derruba os advisory locks do schema engine. O Session
Pooler mantém sessão dedicada e evita depender de conectividade IPv6 do Render.

A separação de **role** é o SEC-004 e vale como invariante: o runtime nunca deve voltar
a usar `postgres`. As duas apontam para `/etc/secrets/supabase-ca.crt`, o Secret File
com o CA oficial do Supabase, e cada uma usa a sintaxe de TLS que o seu consumidor
entende — ver a seção da auditoria S1 e as DEC-059 e DEC-060. O username do pooler
carrega o sufixo do projeto (`<role>.<project-ref>`), inclusive para o role dedicado.

#### Variáveis no serviço — somente nomes

`AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `NODE_VERSION`, `PAINEL_TOKEN`.

**Não existem no serviço** `SEED_ADMIN_SENHA` nem `TROCA_SENHA_NOVA`: o administrador já
existia em produção e **nenhum seed foi executado**. Os valores foram cadastrados pelo
Dashboard, coladas as quatro linhas de uma vez pelo proprietário — a CLI **não** foi
usada com `--env-var`, que exporia o valor em linha de comando e log. O salvamento usou
**"Save only"**, e a API confirmou que ele não disparou deploy nenhum.

#### Deploys

**Deploy inicial da criação — `pre_deploy_failed`, inócuo.** Ao criar o serviço, o
Render disparou um deploy automático. O build passou, e o `pre-deploy` falhou com
*"The datasource.url property is required…"*: o serviço ainda não tinha
`DATABASE_URL`/`DIRECT_URL`, então o Prisma **nem chegou a tentar conectar**. **Nenhuma
migration rodou nesse deploy** e o banco não foi tocado. Foi consequência prevista de
criar a infraestrutura antes dos secrets, e é justamente isso que garantiu que a
credencial ainda-não-rotacionada nunca precisou entrar no Render.

**Deploy válido — `dep-d9vo24o1ne8s73b590i0`.** Disparado manualmente pela CLI com o SHA
explícito, commit `adabe2dfe8f442826fa9006aa12c10ab248c83b6`. Build **PASS**, com o mesmo
mapa de **23 rotas** do gate local. Pre-deploy **PASS**. Resultado: **LIVE**.

#### Migrations aplicadas em produção

As quatro pendentes aplicaram nesta ordem, dentro do `pre-deploy`, sem nenhuma extra:

1. `20260812120000_saldo_historico_tipo_unico`
2. `20260814150000_entrega_v1_aditiva`
3. `20260814210000_contrato_proposta`
4. `20260814230000_cutover_venda_compartilhada`

*"All migrations have been successfully applied."* → *"Database schema is up to date!"*
Com a `20260811014943_inicial`, que já existia, são **5 de 5 aplicadas**, todas
concluídas e nenhuma revertida.

#### Prova pós-cutover, sobre dado real de produção

| Verificação | Resultado |
|---|---|
| `participacoes_venda` | **existe** |
| `reservas_locacao` | **existe** |
| VENDA com `corretor_id`/`equipe_id` antigos preenchidos | **0** |
| VENDA sem participação | **0** |
| Não-VENDA sem corretor/equipe | **0** |
| `lancamentos_venda_credito_check` | **presente** |
| `lancamentos_proposta_campos_check` | **presente** |

A VENDA real que existia em produção foi **backfillada para 1 participação** e teve os
campos antigos zerados. Isso é o que diferencia este cutover dos anteriores: ele foi
provado **sobre dado real**, não sobre fixture.

#### Smoke público

| Requisição | Resultado |
|---|---|
| `GET /` | 307 para `/admin` |
| `GET /login` | 200 — é o health check |
| `GET /admin` sem sessão | 307 para `/login?proximo=%2Fadmin` |
| `GET /painel/<inválido>` | **404** |
| `GET /painel/<inválido>/dados` | **404** |
| `GET /painel/<TOKEN>` | 200, `X-Robots-Tag: noindex, nofollow, noarchive` |
| `GET /painel/<TOKEN>/dados` | 200, `Cache-Control: no-store`, **cinco blocos** — `periodos`, `acumulados`, `equipes`, `propostas`, `reservas` |
| `offline.html` / `sw.js` / marca | 200 / 200 / 200 |

`ADMIN_PRESENT = YES` e **`ADMIN_LOGIN_PRODUCTION = PASS`** — login real feito pelo
proprietário, sem alterar dado nenhum. A rota `/admin/reservas-locacao` responde
corretamente sobre o banco já migrado, o que prova que a tabela nova é consultável pela
aplicação.

#### Validação visual pública

Medido no ar, em Chrome headless dirigido por CDP: viewport **3840×2160**, DPR **1**,
`.tv` **3840×2160**, **overflow zero**. Sequência observada **A → B → A**; faixa
superior **445,44 / 445,44 / 445,44**; topo do VGV estável em **639,72** e o da base em
**946,13** — sem layout jump. Marca carregada. **`PUBLIC_ROTATION_AB = PASS`.**

Requisição real a `/dados` observada depois de aproximadamente 60 segundos com a página
aberta. **`PUBLIC_AUTO_REFRESH = PASS`.**

#### Estado honesto dos dados em produção

**`saldo_historico` estava vazio no momento do smoke.** A consequência correta, e
observada ali, é que os três acumulados apareciam como `—` (`SEM_SALDO_HISTORICO`).
**Isso não é bug** — é a DEC-014 e a DEC-037 funcionando: ausência não vira zero. Para os
big numbers passarem a afirmar valores, o **saldo histórico de abertura precisa ser
informado pelo proprietário** na administração. Nenhum saldo fictício foi cadastrado.

> Isto é o registro daquele smoke, não o estado de hoje: a **O2** já cadastrou o saldo de
> `AVALIACAO_GOOGLE`, e só o de `VENDA` continua ausente. Ver "Etapas operacionais".

No mesmo smoke, "Reservas de locação" mostrou lista vazia legítima e "Propostas em
andamento" mostrou **1 item real**. **Nenhum dado foi criado para o teste.**

#### Auto-deploy

**`AUTO_DEPLOY = OFF`.** Decisão operacional atual: qualquer versão futura exige deploy
manual, até nova decisão. É o comportamento seguro enquanto a política não for revista.

### Venda compartilhada (DEC-051, DEC-052)

- **Uma venda comercial = um lançamento `VENDA`**, sempre — nunca uma linha por
  corretor. Preserva a DEC-001.
- O crédito passa para **`ParticipacaoVenda`**: `id`, `lancamentoId` (FK `Cascade`),
  `corretorId` (FK `Restrict`), `equipeId` (**snapshot** no fato, FK `Restrict`),
  `ordem` (a partir de 1) e `criadoEm`, com `UNIQUE (lancamento_id, corretor_id)` e
  `UNIQUE (lancamento_id, ordem)`. Toda VENDA tem **pelo menos um** participante,
  garantido por transação na aplicação e coberto por integração — "no mínimo um
  filho" não tem constraint declarativa simples.
- **Contrato excludente no estado final.** Depois do **cutover da E3**, toda `VENDA`
  tem `Lancamento.corretorId = NULL` e `Lancamento.equipeId = NULL`: o crédito e a
  autoria histórica moram **exclusivamente** em `ParticipacaoVenda` (corretor,
  equipe histórica e ordem). Os demais tipos continuam usando exclusivamente os dois
  campos do lançamento, obrigatórios, e nunca usam participações. O cutover protege
  isso com um `CHECK` semanticamente equivalente a
  `(tipo = 'VENDA' AND corretor_id IS NULL AND equipe_id IS NULL) OR
  (tipo <> 'VENDA' AND corretor_id IS NOT NULL AND equipe_id IS NOT NULL)` —
  sintaxe exata na fatia que o instala; FKs continuam `Restrict` quando preenchidas.
  Foram rejeitados o espelhamento do participante de ordem 1 nos campos antigos e a
  permanência **permanente** dos valores legados (duas representações permanentes do
  mesmo crédito divergem), além das participações genéricas para todos os tipos.
- **Sequenciamento E2 aditiva → E3 cutover (DEC-051).** *Plano aprovado na E1 e
  **executado por inteiro**: a E2 saiu em `c6464b5`/`fe00fd2`/`18a6599` e a E3 em
  `2a50965`.* O motivo do corte em duas etapas era que o código de métricas de então
  lia os campos do lançamento, e zerá-los antes de a camada de cálculo consumir
  participações quebraria o painel. A **E2** criou a estrutura, fez o **backfill
  inicial** (uma participação `ordem = 1` por VENDA existente) e o provou, mas
  **manteve** os campos antigos `NOT NULL`, preenchidos e como fonte executável — sem
  o `CHECK` final e **sem UI de múltiplos participantes**. A **E3** fez o cutover
  atômico: completou idempotentemente a participação de qualquer VENDA criada entre
  E2 e E3, **provou cobertura integral**, adaptou aplicação e métricas, tornou os
  campos nullable, gravou `NULL` em todas as VENDA e validou o `CHECK`. A dualidade da
  transição foi **temporária e controlada**; o histórico só saiu dos campos antigos
  depois de materializado na participação — nenhuma venda sumiu ou mudou de equipe, e
  nenhum resíduo permaneceu no estado final.
- **Contagem:** empresa soma **+1 venda e o valor integral uma única vez**; cada
  participante recebe **+1 vendido e sua fração igualitária**; cada **equipe
  distinta** nas participações recebe **+1 vendido** e o VGV igual à **soma das
  frações dos seus participantes**. Exemplo canônico: R$ 900 mil com A e B da equipe
  X e C da equipe Y → empresa 1/900; A, B e C 1/300 cada; X 1/600; Y 1/300.
- **Divisão exata:** sempre igualitária, sem percentual manual; centavos em `bigint`;
  divisão inteira e centavos residuais distribuídos um a um por `ordem` crescente
  (R$ 100,00 / 3 → 33,34 / 33,33 / 33,33). Invariante: a soma das frações é o valor
  integral, em centavos. **A fração não é persistida** — deriva de
  (valor, N, ordem) no núcleo.
- **Invariante formal:** a DEC-002 é **parcialmente superada** — para VENDA o
  snapshot de equipe muda de `Lancamento.equipeId` para cada
  `ParticipacaoVenda.equipeId`; para os demais tipos nada muda. O princípio
  permanece: **equipe histórica nunca é derivada do corretor em tempo de consulta**.

### Propostas (DEC-053)

`PROPOSTA` continua lançamento e ganha `valorProposta` (dinheiro **opcional**, campo
separado de `valor`) e `statusProposta` (`AGUARDANDO` padrão / `ACEITA` /
`REJEITADA`). **Contrato de integridade:** em `PROPOSTA`, `statusProposta` e
`imovelRef` são **obrigatórios**, `valorProposta` é opcional e o `valor` do
lançamento permanece `NULL`; em qualquer outro tipo, `statusProposta` e
`valorProposta` são **`NULL`** — garantido pela aplicação e, quando viável, por
proteção equivalente no banco (sintaxe na E2). `valorProposta` **não é VGV** e não
entra em nenhum agregado monetário nem no ranking de VGV; `PROPOSTA` não vira tipo
monetário. Toda proposta conta na métrica mensal qualquer que seja o status; apenas
`AGUARDANDO` entra na lista operacional da TV. Backfill: propostas existentes
recebem `AGUARDANDO`; legadas sem imóvel permanecem válidas como histórico.

### Saldo histórico mínimo conhecido (DEC-054)

Cada linha de `saldo_historico` ganha `PrecisaoSaldoHistorico` — `EXATO` ou
`MINIMO_CONHECIDO`. **Compatibilidade:** toda linha existente antes da migration E2
recebe `EXATO` como backfill/default, preservando a semântica atual; **nenhum saldo
é convertido automaticamente para mínimo conhecido** — só exibe "+ de" o que o
administrador alterar explicitamente. Com mínimo conhecido o valor é um piso: o
cálculo não muda e eventos posteriores ao corte seguem somando (DEC-036); a
apresentação prefixa com **"+ de"** (500 cadastradas + 27 posteriores → "+ de 527";
idem VGV, compondo com a DEC-043). Invariante preservada: saldo entra **somente**
nos acumulados.

### Reservas de locação (DEC-055)

Reserva não é produção e **não usa** `Lancamento`: nasce `ReservaLocacao`
(`corretorId`, `equipeId` snapshot na criação, `imovelRef` obrigatório, `status`
`ATIVA` / `FINALIZADA` / `CANCELADA`, `dataReferencia`, `observacao?`, `criadoPor`,
carimbos). **Toda reserva nasce `ATIVA`**; `FINALIZADA` e `CANCELADA` só entram por
edição explícita. Não incrementa Locados, VGV nem rankings. Ao virar negócio,
registra-se a `LOCACAO` e marca-se a reserva `FINALIZADA` — sem automação implícita
na v1.

### Faixa superior A/B (DEC-056)

Dois estados, 20 segundos cada, `A → B → A → B`, sem terceira tela. **Tela A**: a
atual, preservada. **Tela B**: "Propostas em andamento" (até 3 `AGUARDANDO`) e
"Reservas de locação" (até 3 `ATIVA`), mais recentes primeiro, imóvel + corretor.
Lista vazia mostra "Nenhuma proposta em andamento" / "Nenhuma reserva ativa" — nunca
`0`: são listas operacionais, não métricas (DEC-014). Seleção, ordenação e corte em 3
são regra de domínio e moram no núcleo (DEC-013); o contrato de leitura/atualização
da F3.6 (DEC-044 a DEC-046) foi estendido para transportar as listas.

**Implementado na E4 (`c24a0c9`).** Ver a seção da E4 abaixo para o comportamento
efetivo, incluindo os desempates da ordenação e a política de retenção das listas.

### Incompatibilidades mapeadas — o que a E2 e a E3 resolveram e o que resta

Levantamento arquivo por arquivo feito na E1, atualizado pelo que a E2 e a E3
publicaram:

**Resolvido pela E2:**

- `prisma/schema.prisma` — tem `ParticipacaoVenda`, `ReservaLocacao`,
  `valorProposta`, `statusProposta` e `precisao`, com os enums correspondentes
  (`c6464b5`);
- `src/lib/validacao/lancamento.ts` — conhece o domínio de `statusProposta` e trata
  `valorProposta` como campo próprio, fora de `TIPOS_MONETARIOS` (`fe00fd2`);
- `src/app/admin/lancamentos/*` — criação e edição gravam status e valor de proposta
  e exigem imóvel em `PROPOSTA` (`fe00fd2`);
- `src/app/admin/saldo-historico/*` — criação e edição gravam a precisão (`fe00fd2`);
- `src/app/admin/reservas-locacao/*` — administração completa das reservas
  (`18a6599`).

**Resolvido pela E3 (`2a50965`):**

- `prisma/schema.prisma` — `Lancamento.corretorId`/`equipeId` são `String?`, com
  relações opcionais, e o `CHECK` final da DEC-051 está instalado;
- `src/lib/metricas.ts` — `LancamentoMetrica` é união discriminada
  (`VendaMetrica | EventoIndividualMetrica`); a venda não tem `corretorId`/`equipeId`,
  o crédito sai das participações e a divisão de frações existe;
- `src/lib/metricas-prisma.ts` — lê as participações aninhadas no próprio `findMany`
  de lançamentos e exige o contrato final dos dois lados;
- `src/lib/validacao/lancamento.ts` e `src/app/admin/lancamentos/*` — a venda passou a
  ser multi-participante; o fluxo Q7 permanece intocado para os tipos de participante
  único, em `src/lib/lancamento-equipe.ts`.

**Resolvido pela E4 (`c24a0c9`):**

- `src/lib/metricas.ts` — `PrecisaoSaldoMetrica` viaja no acumulado, que virou união
  discriminada; `selecionarPropostasEmAndamento` e `selecionarReservasAtivas` fazem
  filtro, ordenação e corte em três;
- `src/lib/metricas-prisma.ts` — projeta as candidatas e ganhou a quinta leitura, a de
  `reservas_locacao`;
- `leitura-painel.ts` / `contrato-atualizacao-painel.ts` / `retencao-painel.ts` —
  transportam, validam e retêm as duas listas; a leitura tem cinco blocos;
- `src/lib/apresentacao-painel.ts` — conhece o qualificador "+ de" e as duas listas;
- `src/components/painel/*` — faixa superior alternando A/B, com a Tela B nova.

**Nada do contrato de produto da E1 continua pendente de implementação.** O que resta
da Entrega v1 é o gate completo (E5) e o go-live (E6).

### Ordem de entrega e deploy (DEC-057)

E1 (contratos, **concluída em `078f360`**) → E2 (migration **aditiva** + admin de
propostas, saldo e reservas — sem cutover de VENDA; **concluída em `c6464b5`,
`fe00fd2` e `18a6599`**) → E3 (venda compartilhada + métricas + **cutover final** —
**concluída em `2a50965`**) → E4 (painel A/B e novos estados — **concluída em
`c24a0c9`**) → E5 (gate completo — **concluída**, `RELEASE_CANDIDATE_READY_FOR_E6 =
YES`) → E6 (go-live no Render + smoke público — **concluída**, `adabe2d` implantado).
**As seis etapas estão concluídas e a Entrega v1 está em produção**, hoje no release
`25e62b5`, posterior ao go-live por conta das correções da auditoria S1. O go-live
precedia a F4.5, que desde então foi retomada e hoje está **concluída** (DEC-065, DEC-068). A infraestrutura de
produção foi decidida no E6: **Render**, e não Vercel como a §7 do PLANO previa. F5
continua futura e não está iniciada. O transporte de precisão e das listas
operacionais para o painel não exigiu preparação na E3: o contrato de leitura ficou
intocado até a E4, que fez o desenho inteiro sem tocar schema nem migration.

## Pendências

**Encerradas no E6:** a rotação da credencial da P1 (feita e revogação provada), a
aplicação das quatro migrations em produção e a própria Entrega v1 (E1 a E6 concluídas,
`adabe2d` implantado no go-live). Nenhuma das três é mais pendência.

**Encerrados na auditoria S1:** SEC-001, SEC-002, SEC-003 e SEC-004, todos corrigidos e
verificados em produção. Ao final dessa faixa o release era o `5caecc3` e as migrations
aplicadas passaram a ser seis.

**Encerrados no hardening que veio depois:** SEC-009, SEC-006 e SEC-005, nessa ordem. O
release era o `5491fb2` ao fim do SEC-006 e passou a ser o `25e62b5` com o SEC-005; o
número de migrations não mudou em nenhum dos três.

**Encerrada na F4.5A:** a inspeção do `Phantom Alien 4K IPTV` (DEC-049) — ela foi
executada em 2026-08-16, e o resultado foi o **descarte do aparelho** como plataforma do
painel (DEC-065). O que a substitui como pendência é a **seleção da plataforma
substituta**, abaixo.

**Encerrada na O1:** a reconciliação do dossiê secreto, em quatro ciclos — auditoria
(O1A), rotação emergencial da senha exposta (O1-S0), contrato de conexões (O1-S1,
DEC-066) e reconciliação efetiva do cofre e do `.env` local (O1B). Ver "Etapas
operacionais".

O que resta:

1. **O2 — carga operacional inicial**: **parcialmente concluída**. `AVALIACAO_GOOGLE` já
   está cadastrado; **falta a linha de `VENDA`**, e enquanto ela não existir os
   acumulados de imóveis vendidos e VGV continuam em `—`. **Não é defeito técnico** — é
   ausência de dado, que o sistema afirma corretamente em vez de inventar zero (DEC-014,
   DEC-037). Só o proprietário tem os números de abertura, e **nenhum valor é inventado**.
2. **F4.5 — operação em hardware real**: **CONCLUÍDA**. A **F4.5A** rejeitou o Phantom
   (DEC-065) e a **F4.5B a F4.5E** fecharam com a **Samsung Smart TV do escritório** como
   plataforma definitiva (DEC-068). **Com ela encerrou-se também a F4.**
3. **Decidir a política de auto-deploy.** Hoje está **OFF**: toda versão futura exige
   deploy manual. **Isso é política operacional vigente, não pendência técnica
   obrigatória** — pode permanecer como está indefinidamente, e mudá-lo é decisão do
   proprietário.
4. **F4 — Identidade e modo TV**: **CONCLUÍDA**, com F4.0 a F4.5 encerradas (DEC-065,
   DEC-068). Nada falta nela:
   - a **plataforma de operação está escolhida e aprovada** — o Phantom foi avaliado e
     rejeitado (DEC-065), e a substituta é a **Samsung Smart TV do escritório**, pelo
     navegador nativo dela, sem hardware externo (DEC-068);
   - o **SO, o navegador e a saída de vídeo da Samsung continuam não medidos**, e
     **seguem não inferidos** — o princípio da DEC-049 vale até o fim. A **F4.5C** fechou
     por aceite operacional, não por certificação laboratorial;
   - **a F4.5D aprovou o power cycle** e a **F4.5E deu PASS** no gate físico final, com
     aceite explícito do proprietário. A percepção das hairlines a 3–6 metros (F4.3) e o
     julgamento do Wake Lock (DEC-050) não foram instrumentados e **não bloquearam** o
     fechamento.
5. **F2.6 — aviso de lançamento anterior ao corte**: opcional, não bloqueia nada.
6. **Hardening de segurança residual** — ver a lista logo abaixo. Três dos seis já foram
   encerrados. **Nenhum item bloqueia a v1** e nenhum deles é regressão dos quatro
   achados obrigatórios. **Nenhum deles foi iniciado neste ciclo.**

### Hardening da auditoria S1 — estado por item

Os seis achados de hardening foram medidos, classificados e priorizados em ciclo
próprio. Três estão encerrados; os demais estão separados por decisão tomada, não por
severidade.

#### Encerrados

| Item | Estado | O que foi feito |
|---|---|---|
| **SEC-005** | **corrigido e verificado em produção** | Bloqueio de framing global: `Content-Security-Policy: frame-ancestors 'none'` como política, com `X-Frame-Options: DENY` de encosto legado (DEC-064). A CSP contém **essa diretiva e nenhuma outra**. Verificado por HTTP real no deploy `dep-da0ggsk9v7es739aj24g` — presente em `/`, `/login`, `/preview`, `/admin`, `/painel/<TOKEN>` e `/painel/<TOKEN>/dados`, com HSTS e `X-Robots-Tag` preservados |
| **SEC-006** | **corrigido e verificado em produção** | HSTS global: `Strict-Transport-Security: max-age=31536000` em todas as respostas, sem `includeSubDomains` e sem `preload` (DEC-063). Verificado por HTTP real no deploy `dep-da0fume7bikc73f2dc40` — presente em `/`, `/login`, `/preview`, `/admin`, `/painel/<TOKEN>` e `/painel/<TOKEN>/dados`, com o `X-Robots-Tag` do painel preservado |
| **SEC-009** | **corrigido e encerrado** | O seed, ao encontrar usuário já cadastrado, atualiza **apenas o nome**: `senhaHash` e `ativo` não entram no update, então uma reexecução não reativa conta desativada nem devolve senha antiga (DEC-019). Commit funcional `9b59663` |

O SEC-009 **não exigiu deploy dedicado**: o seed nunca fez parte do pipeline — o
pre-deploy do Render é `npm run db:deploy` — e o serviço não possui as variáveis
`SEED_ADMIN_*`, sem as quais o próprio código aborta antes de tocar o banco. As duas
barreiras foram verificadas antes de fechar. A correção chegou ao artefato live depois,
carregada naturalmente pelo deploy do SEC-006.

O SEC-005 permanece classificado como **INFO / defense-in-depth**, a classificação que
recebeu na medição — o fechamento não a reescreve para cima. O `SameSite=Lax` do cookie
(DEC-018) já mitigava o cenário autenticado cross-site, porque o cookie não acompanha
iframe cross-site; o que ele não fazia era impedir o enquadramento em si, que continuava
possível. A política explícita impede, com ou sem sessão.

Como contraprova adicional — não como fundamento do fechamento, que se apoia nos
cabeçalhos reais — um iframe servido de outra origem para `/login` foi bloqueado no
navegador, enquanto um iframe de controle para uma origem sem a política renderizou
normalmente na mesma página.

#### Ainda abertos

| Item | Classificação | Resumo |
|---|---|---|
| **SEC-008** | LOW | Logout apaga o cookie, mas o JWT emitido continua válido até expirar (7 dias). Não há revogação individual — trocar `AUTH_SECRET` é o botão global (DEC-018). Fazer depois |

#### Risco aceito na v1

| Item | Classificação | Por quê |
|---|---|---|
| **SEC-007** | LOW | Login sem rate limiting nem bloqueio após falhas. Mitigado na prática pelo bcrypt de custo 12 e por haver uma única conta. Se um dia for necessário, **preferir mitigação de borda a lockout persistente**: com uma conta só, bloqueio por tentativas entrega uma negação de serviço trivial contra o próprio administrador |
| **P-01** | plataforma | **Desligar a Data API** do Supabase reduziria superfície. Ela está no ar, mas **sem alcance às tabelas** desde o SEC-001. Opcional |

#### Fazer depois

| Item | Classificação | Custo |
|---|---|---|
| **P-02** | plataforma | **Habilitar o SSL Enforcement** do Supabase, que impediria regressão para conexão sem TLS. Exige janela: **provoca reboot do banco** |

#### Removido do backlog de segurança atual

**SEC-010** — `fotoUrl` aceita qualquer esquema de URL. Sai do backlog porque **não
existe sink**: o campo não é renderizado em lugar nenhum, e o único consumo é um
`defaultValue` de `<input>` no formulário administrativo. Passa a ser **requisito da
feature futura** que vier a exibir a foto — validar o esquema é obrigação de quem
implementar a renderização, e é lá que a validação deve nascer.

Pendências de informação herdadas do plano: número máximo de corretores por equipe
(dimensiona a altura dos quadros) e valores iniciais do saldo histórico. A terceira —
arquivos da marca em alta resolução — **está encerrada**: os PNGs oficiais foram
fornecidos em 2026-08-13 e integrados pela F4.2 em `7e0e35d`.

### Render — política operacional (planejada na E5, executada no E6)

Esta seção foi escrita na E5 como **plano**; o **E6 a executou**, e o resultado está na
seção da E6 acima. O que segue é a política que valeu — e continua valendo para
operações futuras.

- **Claude Code é o operador** da configuração e do deploy;
- **as autenticações interativas são do proprietário**, feitas por ele quando
  solicitadas — o agente não cria conta, não autentica e não guarda credencial. Foi
  assim no `render login`, no reset da senha do Supabase, no cadastro dos secrets e no
  login administrativo de produção;
- **secrets não vão para documentação, log ou conversa**, em hipótese alguma. O que se
  registra é nome de variável, nunca valor. A CLI do Render **não** deve ser usada com
  `--env-var` para valor sensível, porque isso o expõe em linha de comando e log;
- a **ausência de `engines` no `package.json`** foi resolvida por variável: o serviço
  define `NODE_VERSION=24.19.0`. O arquivo continua intocado;
- ambiente local medido na E5: **Node v24.19.0**, **npm 11.17.0**.

**Variáveis exigidas pelo código, por momento de uso** — nomes apenas:

| Variável | Build | Runtime | `migrate deploy` | Secret |
|---|:--:|:--:|:--:|:--:|
| `DATABASE_URL` | fallback do datasource | **sim** | fallback | **sim** |
| `DIRECT_URL` | — | — | **sim** — o pooler em modo transaction derruba os advisory locks do schema engine | **sim** |
| `AUTH_SECRET` | — | **sim**, mínimo 32 caracteres | — | **sim** |
| `PAINEL_TOKEN` | — | **sim** | — | **sim** |
| `SEED_ADMIN_NOME` / `_EMAIL` / `_SENHA` | — | — | só no seed inicial | **sim** (senha) |
| `TROCA_SENHA_EMAIL` / `_NOVA` | — | — | só no script manual | **sim** |
| `NODE_ENV` | plataforma | plataforma — controla o `secure` do cookie | — | não |

Comandos já existentes e relevantes ao E6: `build` (`next build`), `start`
(`next start`), `postinstall` (`prisma generate`), `db:deploy`
(`prisma migrate deploy`) e `db:seed` (`prisma db seed`).

### Observações para a validação da F4.5C

Nada aqui é afirmação sobre a **Samsung Smart TV**, hoje a plataforma escolhida
(DEC-068): são pontos a **provar nela**, e o princípio da DEC-049 sobrevive ao descarte
do Phantom (DEC-065) — nada de sistema, navegador, resolução ou API sem medição no
aparelho. O que **foi** medido no Phantom está na seção da F4.5A e vale só para ele; o
que já foi observado na Samsung está na seção "F4.5C" do estado executivo, separado do
que ainda falta medir.

**O mecanismo offline precisa ser reprovado no navegador real da plataforma.** A F4.4
foi validada em Chrome desktop, e no Phantom a medição ficou **inconclusiva** por
contexto HTTP inseguro. Na plataforma substituta é preciso demonstrar, na ordem:

- suporte a Service Worker;
- instalação;
- ativação;
- Cache Storage funcional;
- persistência de registro e cache após desligar e religar o equipamento;
- fallback institucional quando a aplicação não responde;
- recuperação automática quando ela volta.

**Achado do ambiente de teste Windows, não do aparelho.** Durante os testes da F4.4,
um perfil de Chrome em caminho temporário muito profundo fez `caches.open` falhar com
`UnknownError`; o `install` do Service Worker rejeitava e o registro era descartado em
silêncio, embora `register()` chegasse a resolver antes disso. Um perfil em caminho
curto funcionou. Registrado aqui porque **uma falha de Cache Storage é silenciosa** e
vale conhecer o sintoma ao validar qualquer outra plataforma — **não** porque se saiba
que a plataforma substituta use Windows ou sofra dessa limitação. (O Phantom, medido na
F4.5A, roda Android 7.0 com Chrome 112; ele não é a plataforma substituta e não é
descrito por este achado.)

**Hairlines.** A percepção física das duas hairlines a 3–6 metros continua pendente de
conferência no ensaio físico da **F4.5C**, conforme registrado na F4.3.

## Etapas operacionais

Duas etapas que não são fatia de código nem fase técnica. A **O1 está concluída**; a
**O2 está parcialmente concluída**.

### O1 — Reconciliação do dossiê secreto · CONCLUÍDA

**Objetivo cumprido:** o dossiê privado do proprietário — que vive no **Bitwarden, fora
do Git** — foi conferido contra o estado real de Render, Supabase, banco e administração,
e depois reconciliado. Correu em quatro ciclos, e **nenhum valor secreto entrou no
repositório** em nenhum deles: nem aqui, nem em outro arquivo, nem em log ou mensagem de
commit.

**O1A — auditoria read-only.** Varreu o cofre item a item contra o real. Três achados
principais: o dossiê estava **desatualizado quanto às conexões de banco**, registrava
ainda a **credencial de banco revogada** como se fosse vigente, e — durante a própria
auditoria — a **senha do administrador foi exposta na saída de um terminal**, por um
filtro de supressão que deixou passar valor curto.

**O1-S0 — rotação emergencial.** A senha exposta foi rotacionada pelo comando oficial
`db:trocar-senha-admin`. A anterior ficou **invalidada**, a nova ficou **sincronizada
com o cofre**, e a prova foi feita em memória, sem nada em stdout. Vale reter o limite:
trocar a senha **não derruba sessão já aberta** — o JWT vive 7 dias e só o `AUTH_SECRET`
é botão global (SEC-008).

**O1-S1 — contrato de conexões.** A rotação expôs uma inconsistência real: o script
administrativo recebia a `DIRECT_URL`, que é do Prisma CLI, e só rodou depois de a URL
ser traduzida à mão. Daí nasceu a **DEC-066** e a terceira variável — ver "Conexões de
banco" acima.

**O1B — reconciliação efetiva.** O item do cofre foi **reconstruído**, não remendado.
Estado final, sem nenhum valor aqui:

| Item | Estado |
|---|---|
| E-mail do administrador | reconciliado |
| Senha do administrador | reconciliada (a rotacionada no O1-S0) |
| `PAINEL_TOKEN` | reconciliado |
| `AUTH_SECRET` | reconciliado |
| Credencial de runtime (`casalouzada_runtime`) | reconciliada |
| Credencial administrativa (`postgres`) | reconciliada |
| Project Ref do Supabase | **corrigido** — o dossiê trazia o nome do projeto no lugar do ref |
| Credencial revogada da P1 | **removida** do estado atual |
| Histórico de rotações | saneado até onde há evidência |
| Bitwarden | é a fonte privada atual, e continua fora do Git |

**Ambiente local.** O `.env` **permanece fora do Git** (`.gitignore`, `.env*`), passou a
carregar o contrato das três conexões da DEC-066 e foi validado operacionalmente. Existe
também um **CA local estável, fora do repositório**, para a verificação de certificado
funcionar nesta máquina — o CA é público e não é segredo.

**TLS local, validado por consumidor real:**

| Conexão | Validada por | Resultado |
|---|---|---|
| `DATABASE_URL` | node-postgres | conecta como `casalouzada_runtime`, TLS negociado e certificado autorizado |
| `DIRECT_URL` | **Prisma CLI** (`migrate status`, read-only) | conecta, reconhece as 6 migrations, nenhuma aplicada |
| `ADMIN_DATABASE_URL` | node-postgres | conecta como `postgres`, TLS negociado e certificado autorizado |

#### Resíduos da O1 — nenhum deles bloqueia

- **Artifact "Diagnóstico do Phantom"** — continua publicado. Não contém segredo
  conhecido, e a ferramenta usada nos ciclos **não oferece remoção**; a exclusão é manual
  pela interface, quando o proprietário quiser. Não impede encerrar a O1.
- **Datas do histórico de rotações** — as que não têm evidência ficaram registradas como
  **"DATA NÃO COMPROVADA"**. Preferiu-se isso a adivinhar dia.
- **Procedência do CA local** — a cópia veio do **Secret File operacional do Render**, e
  os metadados do certificado foram conferidos. O download novo da fonte oficial não foi
  obtido naquele ciclo. Isso **não** impediu a validação de TLS das três conexões.

### O2 — Carga operacional inicial · PARCIALMENTE CONCLUÍDA

Cadastrar o **`saldo_historico` real pela administração**. Medido no banco de produção,
por leitura direta e não pela documentação anterior:

- **`AVALIACAO_GOOGLE` — cadastrado**, uma linha, precisão `EXATO`;
- **`VENDA` — ainda não cadastrado**.

Enquanto a linha de `VENDA` não existir, os acumulados que dependem dela — imóveis
vendidos e VGV acumulado — continuam afirmando `—`, que é a ausência dita corretamente,
não defeito (DEC-014, DEC-037).

**Isto é carga operacional, não auditoria contábil.** A existência da linha prova que o
cadastro foi feito; **não** prova que o número informado é o correto para a empresa. Os
valores são do proprietário, e nenhum foi inventado ou conferido aqui.

#### Reconciliação do `dataCorte` — não era bug

Durante o uso da administração observou-se que os acumulados pareciam não somar o saldo
histórico com os lançamentos correntes. Revisado: **não era defeito**. A causa era a
`dataCorte` preenchida de forma incompatível com o período que o saldo informado
realmente abrangia.

A regra segue exatamente como a **DEC-036** define, e não foi alterada: o saldo é
autoritativo **até o `dataCorte`, inclusive**, e somente lançamentos com
`dataReferencia > dataCorte` somam por cima. Nenhum cálculo mudou, nenhuma regressão
existiu e nenhum incidente fica aberto.

**Observação de UX, não bloqueante e não atribuída a fase:** o formulário de saldo sugere
o dia atual como `dataCorte`, o que exige atenção de quem cadastra. Um texto mais
explícito sobre a semântica do corte seria uma melhoria futura — não é obrigação de
ninguém agora e nenhum código foi alterado por causa disso.

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
4. **§6** — pede Jost ou Outfit. O layout raiz, `/admin` e `/login` seguem com Geist.
   A Jost está configurada dentro de **`PainelVisual`**, que é compartilhado por
   `/preview` e `/painel/[token]`; portanto **a rota real também usa Jost desde a
   ligação da F3.5** — ela nunca foi restrita ao preview. O que faltava para a F4 era
   **marca/assets e refinamento de modo TV**, não aplicar Jost ao painel real; a marca
   oficial entrou na F4.2, em `7e0e35d`.
5. **§8** — da estrutura prevista, `src/components/painel/`, `src/lib/metricas.ts`,
   `src/lib/datas.ts` e `public/marca/` eram citados, e os quatro existem hoje —
   `public/marca/` desde a F4.2. Continuam ausentes `src/components/ui/`,
   `src/app/api/` e `src/styles/`.
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
