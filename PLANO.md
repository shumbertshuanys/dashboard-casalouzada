# Dashboard Casa Louzada — plano do projeto

Documento de planejamento e referência arquitetural. O texto abaixo descreve o
desenho pretendido; o estado real do que está construído fica em
`docs/HANDOFF_ATUAL.md`, e as decisões em `docs/DECISOES.md`.

**Situação em 2026-08-16:** Fase 1, protótipo visual, Fase 2 — Administração e
**Fase 3 — Painel** concluídos e publicados. As três camadas do painel existem:
`src/lib/metricas.ts` calcula (núcleo **puro**), `src/lib/metricas-prisma.ts` lê o
banco e alimenta esse núcleo, e `src/lib/apresentacao-painel.ts` traduz o resultado
no que a tela desenha. A **F4 — Identidade e modo TV está em andamento**, com F4.0 a
F4.4 concluídas: decisões nas DEC-047 a DEC-050, modo TV em `f49f912`, **marca
oficial aplicada** em `7e0e35d`, **verificação em 3840×2160** encerrada com o
microajuste dos quadros em `16490f0`, e **offline de navegação** em `8b9fce2`.

Por decisão do proprietário em 2026-08-14, a **F4.5 — operação em hardware real** foi
adiada em favor da **entrega da v1 por URL**, em seis etapas (E1 a E6, ver §9): ajustes
funcionais aprovados — venda compartilhada, propostas com status, saldo mínimo
conhecido, reservas de locação e a faixa superior alternada —, gate completo e go-live
no Render. **Essa entrega está concluída e no ar**, e a F4.5 foi retomada: a **F4.5A —
avaliação do `Phantom Alien 4K IPTV` — está concluída**, com resultado **HARDWARE
REJEITADO**. O aparelho **não será a plataforma do painel** (DEC-065), e a F4.5 passou a
ser "selecionar e validar a plataforma substituta", em **F4.5B a F4.5E, pendentes**.
Nenhuma marca ou modelo substituto foi escolhida.

A **E1 — contratos, documental — está concluída** (`078f360`); a **E2 está concluída**
em três commits — **`c6464b5`** (E2A — schema e migration aditiva com backfills),
**`fe00fd2`** (E2B — administração de propostas e precisão do saldo) e **`18a6599`**
(E2C — administração de reservas de locação); a **E3 está concluída e publicada** em
**`2a50965`**, que fechou o cutover da venda compartilhada; a **E4 está concluída e
publicada** em **`c24a0c9`**, que entregou o painel operacional; e a **E5 — gate
completo — está concluída**, com resultado **`RELEASE_CANDIDATE_READY_FOR_E6 = YES`**;
e a **E6 — go-live — está CONCLUÍDA**.

Depois da v1, a **Celebração de Venda** foi implementada, publicada e **aprovada pelo
proprietário em produção** em 2026-08-16, no release **`ed1c29f`** — ver a seção logo
abaixo do bloco da v1.

## A Entrega v1 está CONCLUÍDA e EM PRODUÇÃO

O release em produção é hoje o **`ed1c29f`**, em
`https://dashboard-casalouzada.onrender.com`, num Web Service do Render (região Virginia,
plano Starter, Node 24.19.0, auto-deploy **OFF**). As **oito migrations estão aplicadas**
no banco de produção — as seis da v1 mais as duas da Celebração de Venda — e a
**credencial exposta na P1 foi rotacionada e revogada** antes do go-live. **Nenhuma
feature da v1 continua pendente.** O painel da TV fica em
`https://dashboard-casalouzada.onrender.com/painel/<TOKEN>`.

O go-live original foi o `adabe2d`; o release atual é posterior porque a **auditoria de
segurança S1** entregou correções em produção.

### Auditoria de segurança S1 — concluída

A auditoria produziu dez achados. Os **quatro obrigatórios estão corrigidos e
verificados em produção**:

- **SEC-001** — as tabelas do produto deixaram de ser alcançáveis pela Data API do
  Supabase: RLS habilitado nas oito, sem policy, e sem privilégio para `anon` e
  `authenticated` (migration `20260815190000_seguranca_data_api`, a sexta aplicada);
- **SEC-002** — as duas conexões PostgreSQL passaram a usar TLS com verificação de
  certificado contra o CA oficial, entregue por Secret File do Render;
- **SEC-003** — o redirect pós-login passou a admitir somente o namespace `/admin`,
  decidido sobre a URL canonicalizada;
- **SEC-004** — o runtime deixou de usar o role administrativo `postgres` e passou a
  usar o role dedicado `casalouzada_runtime`, com privilégio mínimo; a `DIRECT_URL`
  continua administrativa para migrations.

As decisões duráveis estão nas **DEC-058 a DEC-062**; o estado detalhado, em
`docs/HANDOFF_ATUAL.md`.

Os outros seis achados (SEC-005 a SEC-010) foram classificados como hardening, entre LOW
e INFO. **Nenhum deles bloqueia a v1** e nenhum é regressão dos quatro encerrados. Depois
da priorização, **três foram corrigidos e verificados em produção**:

- **SEC-009** — o seed deixou de reativar administrador desativado: ao encontrar usuário
  já cadastrado, atualiza apenas o nome (DEC-019 reescrita);
- **SEC-006** — a aplicação passou a enviar `Strict-Transport-Security: max-age=31536000`
  em todas as respostas, sem `includeSubDomains` e sem `preload` (**DEC-063**);
- **SEC-005** — a aplicação deixou de poder ser embutida: `Content-Security-Policy:
  frame-ancestors 'none'` como política, com `X-Frame-Options: DENY` de encosto legado
  (**DEC-064**). A CSP tem essa diretiva e nenhuma outra.

O restante foi repriorizado: **SEC-008** (revogação de JWT) segue aberto; **SEC-007**
(rate limiting) é risco aceito na v1; o **SSL Enforcement** do Supabase fica para depois
porque exige reboot do banco; e **SEC-010** saiu do backlog de segurança por não ter
sink — vira requisito da feature que vier a renderizar a foto.

### Estado final da faixa superior (E4, `c24a0c9`)

A faixa superior deixou de ser estática e passou a alternar entre duas telas, 20
segundos cada, `A → B → A → B`, sem terceira tela (DEC-056):

- **Tela A** — a de sempre: Imóveis vendidos, VGV acumulado e Avaliações Google;
- **Tela B** — duas listas operacionais: **Propostas em andamento** (até 3 propostas
  `AGUARDANDO`) e **Reservas de locação** (até 3 reservas `ATIVA`), cada item com
  imóvel e corretor, e nada além.

As duas listas ordenam por `dataReferencia` decrescente, desempatam por `criadoEm`
decrescente e, persistindo o empate, por `id` crescente — sem isso dois itens
empatados poderiam trocar de lugar a cada atualização da TV sem nada ter mudado.
Lista vazia é dado legítimo e vira frase — "Nenhuma proposta em andamento" /
"Nenhuma reserva ativa" —, nunca `0`: lista operacional não é métrica (DEC-014).
Proposta legada sem imóvel (DEC-053) continua na lista, dizendo "Imóvel não
informado" em vez de sumir da parede.

**Seleção, ordenação e corte moram em `src/lib/metricas.ts`** (DEC-013). A leitura
Prisma não filtra status, não ordena operacionalmente e não aplica `take`; os
componentes não filtram, não ordenam e não cortam.

O saldo `MINIMO_CONHECIDO` também chegou à tela: ele **não muda cálculo nenhum** e
qualifica a apresentação dos acumulados com "+ de" — "+ de 527", "+ de R$ 800 mi". A
precisão do saldo de `VENDA` qualifica imóveis vendidos **e** VGV acumulado; a do
saldo de `AVALIACAO_GOOGLE` qualifica as avaliações. "+ de" **nunca** aparece em mês,
trimestre, ano, quadro mensal ou ranking, e `SEM_SALDO_HISTORICO` continua sendo `—`,
nunca "+ de —".

### Estado final da VENDA (E3, `2a50965`)

O cutover foi executado e a dualidade que a E2 deixou aberta acabou. Hoje:

- `Lancamento.corretorId` e `Lancamento.equipeId` são **`NULL`** em toda `VENDA`, e o
  crédito mora **exclusivamente** em `ParticipacaoVenda` (DEC-051);
- os tipos não-VENDA continuam com os dois campos obrigatórios e nunca usam
  participações; o `CHECK lancamentos_venda_credito_check` garante os dois lados;
- a administração registra **venda com N participantes**, em transação: nenhuma venda
  observável fica sem elenco;
- o VGV é dividido em **partes iguais e exatas**, em centavos `bigint`, com os
  centavos residuais distribuídos por `ordem` crescente (DEC-052) — a empresa conta a
  venda e o valor **uma vez**, cada participante recebe +1 e a sua fração, e cada
  equipe recebe a soma das frações dos seus participantes;
- cada participação carrega o **snapshot histórico** da equipe, que a edição nunca
  rederiva;
- a `ordem` é contígua `1..N`: sai da posição no formulário na criação, preserva a
  relativa na edição, o participante novo entra ao final e a remoção recompacta. Não
  há reordenação manual na v1;
- os filtros administrativos de corretor e equipe casam pelas participações; quando
  combinados, exigem que **a mesma** participação satisfaça os dois.

Desde a F3.5 a tela da TV está ligada, e desde a F3.6 ela se mantém sozinha:
`/painel/[token]` valida o token e, só então, faz a leitura inicial no servidor —
`prisma → lerPainel → AtualizadorPainel → PainelVisual`, com um único `agora`
atravessando leitura e apresentação. No cliente, o `AtualizadorPainel` consulta
`GET /painel/[token]/dados` a cada 60 segundos, com timeout de 15 segundos, e
preserva o último valor conhecido conforme a política de retenção quando uma
atualização falha. `/preview` continua com dados fictícios, mas desenha pela
**mesma** composição visual da rota real.

---

## 1. Objetivo

Painel de resultados da imobiliária, exposto em TV na parede do escritório, alimentado
manualmente através de uma área administrativa própria. Mais de 20 corretores divididos
em 3 equipes (Suellen, Lena e Fernanda L.).

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Entrada de dados | Por evento — cada venda, captação, locação, proposta e avaliação é um registro individual |
| Exibição | TV na parede, tela cheia, modo somente leitura, atualização automática |
| Hospedagem | Nuvem |
| Quadros de equipe | Mostram todas as métricas, alternando automaticamente a cada 20 segundos |
| Números do rascunho | Fictícios, apenas ilustrativos |
| Exclusividade | Métrica independente — captação exclusiva **não** soma em captação de venda |
| Acesso ao painel | URL secreta, sem login, para a TV abrir sozinha |
| Acesso administrativo | Login obrigatório, usuário único |
| Tela | TV de 80 polegadas, 4K (3840×2160), horizontal |
| Metas | Fora da primeira versão — modelagem documentada para entrar depois |
| Corretores | Cadastrados e editados exclusivamente pela área administrativa |

---

## 3. Modelo de dados

### `equipes`
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| nome | text | "Equipe Suellen" |
| gerente_nome | text | |
| ordem_exibicao | int | posição do quadro no painel |
| ativa | boolean | |

### `corretores`
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| nome_completo | text | |
| nome_exibicao | text | como aparece na TV — nomes curtos leem melhor à distância |
| foto_url | text | opcional |
| creci | text | opcional |
| equipe_id | uuid | FK |
| ativo | boolean | inativo some do painel mas mantém o histórico |
| data_entrada | date | |

### `lancamentos` — tabela central
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| tipo | enum | ver lista abaixo |
| corretor_id | uuid | FK |
| equipe_id | uuid | gravado no momento do lançamento, para o histórico não mudar se o corretor trocar de equipe |
| data_referencia | date | data do fato, não a data em que foi digitado |
| valor | numeric | preenchido apenas em vendas e locações |
| imovel_ref | text | código ou endereço, opcional |
| observacao | text | opcional |
| criado_por | uuid | FK usuários |
| criado_em / atualizado_em | timestamp | |

**Tipos:** `VENDA`, `LOCACAO`, `CAPTACAO_VENDA`, `CAPTACAO_EXCLUSIVA`, `CAPTACAO_LOCACAO`,
`PROPOSTA`, `AVALIACAO_GOOGLE`

> Captação exclusiva é um tipo próprio e independente. Um lançamento é uma coisa ou outra,
> nunca as duas — os totais das duas linhas do quadro mensal não se sobrepõem.

### `saldo_historico`
Evita cadastrar retroativamente centenas de vendas antigas.

| Campo | Tipo |
|---|---|
| id | uuid |
| tipo | enum (mesmo do lançamento) |
| quantidade | int |
| valor_total | numeric |
| data_corte | date |
| descricao | text |

Entra apenas nos big numbers acumulados. Nunca nos períodos.

> Restringido depois pela Q8, já implementado: só `VENDA` e `AVALIACAO_GOOGLE`
> recebem saldo, e existe no máximo uma linha por tipo, garantida por índice
> único. Ver DEC-035.

### Estrutura da Entrega v1 — implantada

Modelo aprovado em 2026-08-14 (DEC-051 a DEC-055). **As quatro estruturas abaixo
existem no schema e no banco local de teste** desde a E2 (`c6464b5`, `fe00fd2`,
`18a6599`), e o cutover da VENDA foi concluído na E3 (`2a50965`). O que ainda depende
da apresentação na TV está marcado em cada bloco.

#### `participacoes_venda` (DEC-051) — **fonte única do crédito de VENDA**

Uma venda comercial continua sendo **um** lançamento `VENDA`; o crédito passa para
cá, um registro por corretor participante.

| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| lancamento_id | uuid | FK `Cascade` — participação é parte do fato |
| corretor_id | uuid | FK `Restrict` |
| equipe_id | uuid | **snapshot** da equipe no momento do fato, FK `Restrict` |
| ordem | int | determinística, a partir de 1; decide os centavos residuais |
| criado_em | timestamptz | |

`UNIQUE (lancamento_id, corretor_id)` e `UNIQUE (lancamento_id, ordem)`. Toda VENDA
tem pelo menos uma participação (garantido por transação na aplicação).

**Estado real.** A tabela nasceu na E2A (`c6464b5`) com as duas unicidades e as FKs
(`Cascade` para o lançamento, `Restrict` para corretor e equipe), e o backfill inicial
gravou uma participação `ordem = 1` por VENDA existente. O **cutover da E3**
(`2a50965`) completou as vendas criadas na janela entre as duas etapas, provou
cobertura integral, tornou `corretor_id`/`equipe_id` anuláveis, gravou `NULL` em toda
VENDA e instalou o `CHECK lancamentos_venda_credito_check` —
`(tipo = 'VENDA' AND ambos NULL) OR (tipo <> 'VENDA' AND ambos NOT NULL)`. A
informação histórica só saiu dos campos antigos **depois** de materializada na
participação: nenhuma venda mudou de dono ou de equipe.

**Crédito e divisão (DEC-052), em execução desde a E3:** a empresa conta a venda e o
valor **uma vez**, qualquer que seja o elenco; cada participante recebe +1 vendido e a
sua fração igualitária; cada equipe distinta recebe a soma das frações dos seus
participantes, e a soma de todas fecha exatamente o valor da venda. A divisão é
inteira em centavos `bigint`, e os centavos residuais vão para os primeiros por
`ordem` crescente — `R$ 100,00` entre três dá `33,34 / 33,33 / 33,33`. A fração não é
persistida: deriva de (valor, N, ordem) no núcleo, toda vez.

#### `lancamentos` — campos de proposta (DEC-053) — **implementado**

| Campo | Tipo | Observação |
|---|---|---|
| valor_proposta | numeric? | opcional em `PROPOSTA`, **`NULL` nos demais tipos**; **não é VGV** e não entra em agregado monetário |
| status_proposta | enum? | `AGUARDANDO` (padrão) / `ACEITA` / `REJEITADA`; **obrigatório em `PROPOSTA`, `NULL` nos demais** |

Em `PROPOSTA`, imóvel é obrigatório (novas submissões) e o `valor` do lançamento
permanece `NULL`. Toda proposta conta na métrica mensal qualquer que seja o status; só
`AGUARDANDO` entra na lista operacional da TV.

**Estado real.** Os dois campos existem desde a E2A (`c6464b5`), com backfill de
`AGUARDANDO` nas propostas existentes. A **administração** foi entregue na E2B
(`fe00fd2`): status e valor próprio no formulário e na listagem, imóvel exigido pela
aplicação em criação **e** edição, e campos de proposta forçados a `NULL` nos demais
tipos. A integridade também é do banco — a migration `20260814210000_contrato_proposta`
instalou o `CHECK` correspondente, que **de propósito não exige `imovel_ref`**: a
proposta histórica sem imóvel continua válida enquanto não for editada. A lista
operacional "Propostas em andamento" na TV foi entregue na **E4** (`c24a0c9`) e mostra
só `AGUARDANDO`, no máximo três, com a proposta legada sem imóvel exibindo "Imóvel não
informado".

#### `saldo_historico` — precisão (DEC-054) — **implementado**

| Campo | Tipo | Observação |
|---|---|---|
| precisao | enum | `EXATO` / `MINIMO_CONHECIDO` |

Toda linha existente antes da migration E2 recebe **`EXATO`** como
backfill/default, preservando a semântica atual — **nenhum saldo é convertido
automaticamente** para mínimo conhecido; a troca é sempre edição explícita do
administrador. `MINIMO_CONHECIDO` é um piso: o cálculo não muda, e a apresentação
prefixa o acumulado com "+ de" (ex.: "+ de 527", "+ de R$ 800 mi"). Saldo continua
entrando somente nos acumulados.

**Estado real.** O campo existe desde a E2A (`c6464b5`), com backfill `EXATO`, e a
E2B (`fe00fd2`) levou a precisão ao admin: ela é escolhida na criação e alterável nos
dois sentidos na edição, e aparece na listagem. A **apresentação "+ de" foi entregue na
E4** (`c24a0c9`), só nos acumulados: a decisão está **completa na v1**.

#### `reservas_locacao` (DEC-055) — **modelo e administração implementados**

Reserva não é produção: não usa `Lancamento`, não conta em Locados, VGV ou ranking.

| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| corretor_id | uuid | FK `Restrict` |
| equipe_id | uuid | snapshot na criação, FK `Restrict` |
| imovel_ref | text | obrigatório |
| status | enum | `ATIVA` / `FINALIZADA` / `CANCELADA` — **nasce sempre `ATIVA`** |
| data_referencia | date | |
| observacao | text? | |
| criado_por | uuid | |
| criado_em / atualizado_em | timestamptz | |

Quando vira negócio: registra-se a `LOCACAO` normalmente e a reserva é marcada
`FINALIZADA` — sem automação implícita na v1. A TV mostra só `ATIVA`, mais recentes
primeiro, no máximo 3.

**Estado real.** A tabela existe desde a E2A (`c6464b5`) e ganhou administração na E2C
(`18a6599`): listagem, criação, edição e mudança explícita de status em
`/admin/reservas-locacao`. Toda reserva nasce `ATIVA`; a equipe é snapshot lido pelo
servidor na criação e imutável na edição; **não há hard delete** — `CANCELADA` é o
estado de uma reserva que deixou de valer; e finalizar **não cria `LOCACAO`
automaticamente**. A **lista de reservas `ATIVA` na TV foi entregue na E4**
(`c24a0c9`): só `ATIVA`, no máximo três, imóvel e corretor.

## Celebração de Venda — CONCLUÍDA E EM PRODUÇÃO

Feature de **integração da equipe**, aprovada pelo proprietário depois da v1. A
finalidade é comemorar: quando uma venda é fechada, a TV do escritório para o que está
mostrando por alguns segundos e anuncia quem vendeu. O ganho é de ambiente, não de
informação — os números já estavam na parede.

O que a define é a separação: a celebração é **evento de UX, nunca dado comercial**.
Ela não entra em métrica, VGV, ranking, contagem, saldo nem período, e a tabela guarda
apenas a referência ao lançamento e o instante do pedido. Valor, imóvel, participantes
e equipe histórica são **resolvidos do fato comercial** pela relação, e não copiados —
um snapshot criaria uma segunda versão da venda, livre para divergir da primeira depois
de uma edição. A decisão durável está na **DEC-067**.

Como funciona, em uma passada:

- **disparo automático** — cadastrar uma nova `VENDA` gera **uma** celebração, usando o
  id devolvido pelo próprio `create`. É uma venda, uma celebração: elenco de três
  participantes não gera três. A tentativa acontece **depois** da escrita comercial e
  fora dela, e falhar **não** desfaz a venda nem transforma o cadastro em erro — o que
  se perde é a animação;
- **disparo manual** — o botão "Comemorar última venda", no `/admin/lancamentos`, cria
  um evento novo a cada acionamento. Serve para quando a TV estava desligada ou a sala
  vazia. Não cria lançamento, participação, valor nem ranking;
- **a TV** — consulta uma rota **irmã** de `/dados`, a cada 5 segundos, e recebe todas
  as celebrações dos últimos 5 minutos, no máximo 10, da mais antiga para a mais nova.
  A leitura é plural de propósito: devolver só a última perderia eventos quando duas
  vendas são cadastradas entre duas consultas;
- **fila e deduplicação** — o cliente guarda os ids já vistos e enfileira os inéditos.
  Cada celebração ocupa a tela por ~10 s e a próxima entra sozinha. O estado é **só em
  memória**: recarregar a página pode repetir um evento ainda dentro da janela, e isso
  foi aceito no MVP — não há `localStorage`, cookie nem campo `consumido` no banco;
- **o popup** — "É VENDA!", o valor em destaque, o **imóvel** quando houver, os
  participantes com a **equipe histórica** de cada um, confete em CSS puro e a **marca
  oficial assinando embaixo**. Escala em unidades relativas à viewport, como o painel.
  Sem áudio. O **dashboard continua montado atrás**: a celebração é camada, não tela;
- **zero impacto em métricas** — `metricas.ts`, `metricas-prisma.ts`,
  `leitura-painel.ts` e a rota `/dados` não foram tocados por nenhuma das fatias.

**Estado. CONCLUÍDA E EM PRODUÇÃO.** Implementada e provada na `main` (C1, C1-R1, C2,
C3, C3-R1, mais o saneamento T1, o hardening T1-R1 e a correção P1-R1) e publicada no
release **`ed1c29f`**, com as **duas migrations aplicadas no banco de produção** —
`prisma migrate status` responde 8/8 e schema em dia, sem falha ativa.

Houve **dois gates humanos, distintos**: o proprietário aprovou a feature **no navegador
local** e, depois do deploy, abriu o painel real e **confirmou que a animação foi
executada corretamente**. O hardware usado nesse segundo gate **não está identificado**,
e nada se afirma sobre ele. Nenhum dos dois foi automatizado.

O detalhamento, os commits, as provas de produção e o incidente da migration 8 estão em
`docs/HANDOFF_ATUAL.md`.

Esta feature **não** encerra a F4: a **F4.5 — operação em hardware real** continua
pendente, com a plataforma substituta ainda não escolhida (DEC-065).

### `metas` — não entra na v1

Desenhada aqui apenas para registro. Nenhuma tabela ou tela depende dela, então criar depois
é uma migração aditiva, sem mexer no que já estiver funcionando.
| Campo | Tipo | Observação |
|---|---|---|
| id | uuid | |
| escopo | enum | GERAL, EQUIPE, CORRETOR |
| referencia_id | uuid | nulo quando escopo é GERAL |
| metrica | enum | mesmo conjunto de tipos, mais VGV |
| ano / mes | int | |
| valor_alvo | numeric | |

### `usuarios`
id, nome, email, senha_hash, ativo.

Apenas um registro na primeira versão. A tabela existe mesmo assim para que adicionar
um segundo acesso no futuro não exija migração. Não há tela de gestão de usuários na v1 —
o registro inicial vem pelo seed e a senha se troca pela própria área administrativa.

> A tela de troca de senha nunca foi construída. O mecanismo real é o comando
> `npm run db:trocar-senha-admin`. Continua sendo um item legítimo para o futuro.

---

## 4. Regras de cálculo

- **Big numbers** = saldo histórico do tipo **+** os lançamentos daquele tipo com
  `dataReferencia` **estritamente posterior** ao `dataCorte` daquele saldo. Cada linha de
  `saldo_historico` é a fonte do acumulado até o próprio corte, inclusive; somar também os
  lançamentos anteriores contaria a mesma produção duas vezes. Ver DEC-036.
- **VGV mensal** = soma de `valor` das vendas do mês civil corrente.
- **VGV trimestral** = trimestre civil corrente (jan–mar, abr–jun, jul–set, out–dez).
- **VGV anual** = ano civil corrente.
- **Quadro mensal geral** = mês civil corrente, contagem por tipo.
- **Quadros de equipe** = mês civil corrente, corretores ordenados do maior para o menor na
  métrica que estiver ativa no momento.
- Fuso horário fixo em `America/Sao_Paulo` para o corte de mês não errar.

> **O saldo histórico nunca participa de mês, trimestre ou ano.** Ele só entra nos
> acumulados dos big numbers. Os recortes por período usam exclusivamente lançamentos,
> e ignoram `dataCorte` (DEC-004, DEC-036).

Os limites desses recortes vêm da F3.1: `mesCorrente`, `trimestreCorrente` e
`anoCorrente`, em `src/lib/datas.ts`, devolvem a janela civil corrente em
`America/Sao_Paulo` como intervalo semiaberto `[inicio, fimExclusivo)`. Desde a F3.2,
`src/lib/metricas.ts` as consome: o VGV da empresa usa as três janelas, e o quadro
mensal geral e os rankings de equipe usam a do mês corrente. O saldo histórico
continua entrando somente nos acumulados.

A **leitura** foi implementada na F3.3, em `src/lib/metricas-prisma.ts`: ela lê as
tabelas, converte cada linha para os tipos de domínio e chama o núcleo. A regra de
cálculo continua inteira em `src/lib/metricas.ts` (DEC-013) — a fronteira não soma,
não conta, não filtra status, não ordena e não corta lista.

O resultado da leitura é separado em blocos, cada um com as próprias dependências:
`empresa.periodos` (lançamentos), `empresa.acumulados` (lançamentos e saldo
histórico), `equipes` (lançamentos, corretores e equipes) e, desde a **E4**,
`propostas` (lançamentos) e `reservas` (leitura própria de `reservas_locacao`, a
quinta). Uma leitura que falha derruba só quem dependia dela — falhar o saldo não
apaga o VGV do mês, e falhar a leitura de reservas não derruba as propostas nem as
métricas (DEC-040, DEC-042).

A **apresentação** foi implementada na F3.4, em `src/lib/apresentacao-painel.ts`:
ela recebe o resultado da leitura e um `agora`, e devolve rótulos e valores já
formatados — moeda compacta (`R$ 4,2 bi`), contagens em pt-BR e `—` para cada estado
que não afirma número. Também ali não se calcula nada: a regra continua inteira no
núcleo.

A cadeia, portanto, é `Prisma → ResultadoPainel → ApresentacaoPainel`, e desde a F3.5
ela está **composta na rota da TV**: `/painel/[token]` cria um `agora` só — depois de
validar o token — e o passa às duas camadas, para o cabeçalho não anunciar um mês
diferente daquele que produziu os números.

A **atualização** veio com a F3.6: a leitura inicial continua no servidor, e o
cliente consulta `GET /painel/[token]/dados` a cada 60 segundos — o mesmo guard de
token antes do banco e o mesmo `agora` único por leitura. Cada payload é validado em
runtime (`ehLeituraPainel`) antes de passar pela política de retenção
(`resolverAtualizacao` → `comporApresentacao`): falha de atualização não apaga dado
bom da tela, e leitura válida substitui o que estava lá.

---

## 5. Telas

### 5.1 Painel (URL secreta, modo TV)

Rota protegida por um token longo na própria URL — sem tela de login, para a TV abrir
sozinha ao ligar. O token fica em variável de ambiente e pode ser trocado a qualquer momento.
A rota envia cabeçalho `noindex` para não aparecer em buscador.

Três faixas, sem rolagem, ocupando 3840×2160:

1. **Faixa superior** — alterna entre a **Tela A** (imóveis vendidos, VGV total,
   avaliações Google) e a **Tela B** (propostas em andamento e reservas de locação).
2. **Faixa de VGV** — anual, trimestral e mensal lado a lado.
3. **Base** — quadro "mensal geral" à esquerda (7 métricas) e os três quadros de equipe à direita.

> **Implementado na E4** (`c24a0c9`, DEC-056): a faixa superior alterna entre duas
> telas de 20 segundos — a **Tela A**, preservada, e a **Tela B** com duas listas
> operacionais: "Propostas em andamento" (até 3 propostas `AGUARDANDO`) e "Reservas de
> locação" (até 3 reservas `ATIVA`), mais recentes primeiro, imóvel + corretor. Lista
> vazia mostra "Nenhuma proposta em andamento" / "Nenhuma reserva ativa", nunca `0`. A
> faixa tem altura estrutural fixa em `11.6cqw`, igual nas duas telas, para a rotação
> não deslocar o que está abaixo dela.

Comportamentos: atualização dos dados a cada 60 segundos sem recarregar a página, e
reconexão automática se a internet cair (mantém o último valor na tela em vez de zerar).

**Escala.** Todo o layout dimensionado em unidades relativas à largura da tela, não em
pixels fixos. Assim o mesmo código serve para a TV de 80" e para o monitor onde você
vai conferir, sem manter duas versões.

**Hardware.** O navegador embutido em smart TV costuma ser lento e desatualizado, e muitas
travam ou desligam a tela após um tempo ocioso. A recomendação é um mini PC conectado à TV
rodando Chrome em modo quiosque, com a URL secreta na inicialização automática. Custa pouco
e resolve de uma vez o autostart, a suspensão de tela e a compatibilidade.

> **Estado em 2026-08-16.** O `Phantom Alien 4K IPTV`, que a DEC-049 tinha registrado
> como hardware alvo, foi **inspecionado fisicamente na F4.5A e rejeitado** como
> plataforma do painel (DEC-065) — plataforma antiga, Android 7, patch de 2018, Chrome
> 112, UI limitada a 1080p e 2160p só até 30 Hz. Ele não foi declarado defeituoso: é
> **inadequado ao objetivo**. A plataforma substituta é a **F4.5B** e **não está
> escolhida**; o mini PC descrito acima continua sendo **uma alternativa entre outras**,
> não a escolha feita. Os critérios de seleção estão na DEC-065.

### 5.2 Rotação dos quadros de equipe

Ciclo de 7 métricas × 20 segundos = 2min20s por volta completa. Ordem sugerida:
vendidos → VGV → locados → captação de venda → exclusividades → captação de locação → propostas → avaliações.

> A contagem acima está errada: a própria lista enumera **oito** métricas. O
> protótipo e o port usam oito × 20s = 2min40s. Resolvido pela DEC-033.

O título do quadro mostra a métrica ativa, com pequenos marcadores de posição no ciclo.
Transição por fade curto — nada de movimento chamativo, cansa em tela permanente.
As três equipes trocam sempre em sincronia.

### 5.3 Área administrativa (com login)

- Login por e-mail e senha
- Lançamento rápido: tipo, corretor, data, valor — poucos cliques, é a tela mais usada
- Listagem de lançamentos com filtro por período, corretor, equipe e tipo; editar e excluir
- Cadastro de equipes e corretores
- Saldo histórico
- Configurações do painel: intervalo de rotação, métricas exibidas, ordem das equipes

---

## 6. Identidade visual

Derivada do logotipo:

| Token | Valor | Uso |
|---|---|---|
| Fundo | `#544C3F` | fundo do painel |
| Superfície | `#5F5749` | cartões sobre o fundo |
| Texto principal | `#F1EFEA` | números e títulos |
| Texto secundário | `#BDB5A6` | rótulos |
| Destaque | `#C9A96A` | VGV e barras de meta |
| Positivo / negativo | verde e terracota dessaturados | variação vs. mês anterior |

Tipografia geométrica alinhada ao logo (Jost ou Outfit) nos títulos e números, com numerais
tabulares para os valores não deslocarem ao atualizar.

> Resolvido com **Jost**, configurada dentro de `src/components/painel/painel-visual.tsx`.
> Como essa composição é compartilhada desde a F3.5, a Jost vale para `/preview` **e**
> para `/painel/[token]` — não é exclusiva do preview. O layout raiz, `/admin` e
> `/login` seguem com Geist, de propósito. A **marca oficial** foi aplicada na F4.2
> (`7e0e35d`): o cabeçalho desenha o lockup horizontal de `public/marca/`, e o texto
> `CASA LOUZADA` deixou de ser desenhado (DEC-047).

Cuidados de leitura à distância, considerando 80 polegadas vistas de 3 a 6 metros. Valores
em pixels de tela 4K real:

| Elemento | Tamanho mínimo |
|---|---|
| Big numbers | 220px |
| VGV por período | 110px |
| Nome do corretor e valores das listas | 44px |
| Rótulos e legendas | 32px |

Contraste alto, espaçamento generoso, e nenhuma informação transmitida só por cor.

> Os quatro mínimos foram **medidos e atendidos** na F4.3, num Chrome com viewport de
> 3840×2160 e `devicePixelRatio` 1: 220.032px, 110.208px, 44.16px (nome) e 48px
> (valor de lista), e 32.256px nos rótulos. As margens dos big numbers e dos rótulos
> são estreitas, e ficam registradas como tais no `docs/HANDOFF_ATUAL.md`.

---

## 7. Stack

| Camada | Escolha |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Estilo | Tailwind CSS |
| Banco | PostgreSQL gerenciado (Supabase ou Neon) |
| ORM | Prisma |
| Autenticação | e-mail e senha, sessão em cookie |
| Deploy | **Render** — Web Service, região Virginia, plano Starter, Node 24.19.0 (a §7 previa Vercel; a decisão do E6 foi Render) |
| Repositório | github.com/&lt;usuário&gt;/dashboard-casalouzada |

Justificativa: painel e administração no mesmo projeto, plano gratuito suficiente para este
volume, e a TV precisa apenas abrir uma URL no navegador.

---

## 8. Estrutura de pastas prevista

```
dashboard-casalouzada/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── painel/           # tela da TV
│   │   ├── admin/            # área administrativa
│   │   ├── api/
│   │   └── login/
│   ├── components/
│   │   ├── painel/           # big numbers, quadros, rotação
│   │   └── ui/
│   ├── lib/
│   │   ├── metricas.ts       # todo o cálculo concentrado aqui
│   │   ├── datas.ts
│   │   └── db.ts
│   └── styles/
├── public/
│   └── marca/
├── PLANO.md
└── README.md
```

---

## 9. Fases

**Fase 1 — Fundação** · *concluída*
Projeto Next.js, Tailwind, conexão com o banco, schema Prisma, migrações, seed com as três
equipes e o usuário administrador, login funcionando. Sem corretores de exemplo — você
cadastra os reais na Fase 2.

**Protótipo visual** · *concluído*
Não estava previsto como fase própria: o desenho do painel foi portado do HTML de
referência para a rota `/preview`, com dados fictícios. Serve de contrato visual para a F3.

**Fase 2 — Administração** · *concluída*
CRUD de equipes, corretores e lançamentos. Saldo histórico. Ao final desta fase você
já consegue alimentar o sistema de verdade, mesmo sem o painel pronto.

**Fase 3 — Painel** · *concluída*
Camada de cálculo, as três faixas do layout, atualização automática, rotação de métricas,
proteção por token na URL. `src/lib/metricas.ts` calcula, `src/lib/metricas-prisma.ts`
lê o banco, `src/lib/apresentacao-painel.ts` formata para a tela e `/painel/[token]`
compõe as três desde a F3.5 — **com dados reais**. Desde a F3.6 o `AtualizadorPainel`
mantém a tela atualizada sozinho, a cada 60 segundos, preservando o último valor
conhecido quando uma atualização falha.

A fase foi fatiada assim:

| Fatia | Escopo | Estado |
|---|---|---|
| F3.0 | decisões e contratos | **concluída** — DEC-036 a DEC-042 |
| F3.1 | janelas civis (mês, trimestre, ano) em `America/Sao_Paulo` | **concluída** — commit `592df35` |
| F3.2 | núcleo puro de métricas | **concluída** — `6cf0627` (empresa) e `8ec6cbc` (equipes) |
| F3.3 | leitura Prisma | **concluída** — commit `9ec8439` |
| F3.4 | shape de apresentação e tipos fora do mock | **concluída** — commit `a9fe849` |
| F3.5 | painel real ligado aos dados | **concluída** — commit `8684f1d` |
| F3.6 | atualização automática e último valor conhecido | **concluída** — commit `888f779` |

As decisões da F3.0 são implementáveis sobre o schema atual: **a F3 não exige migration**.

**Fase 4 — Identidade e modo TV** · *em andamento*
Cores, tipografia, marca, ajuste fino para 3840×2160, transições, comportamento offline
e operação da TV. Os tokens de cor existem desde a F1, e **a composição visual é
compartilhada desde a F3.5**: a Jost está configurada dentro de `PainelVisual`, que
serve `/preview` e `/painel/[token]`, então a tipografia da seção 6 **já chega ao painel
real**. A **marca oficial e seus assets**, a **verificação em 4K** e o **offline de
navegação** já foram entregues; o que resta da fase é a **operação na TV** — hoje **sem
plataforma escolhida**, depois do descarte do Phantom (DEC-065).

A fase foi fatiada assim:

| Fatia | Escopo | Estado |
|---|---|---|
| F4.0 | decisões de identidade e modo TV | **concluída** — DEC-047 a DEC-050, em `73f490d` |
| F4.1 | refinamento de modo TV | **concluída** — commit `f49f912` |
| F4.2 | marca oficial e assets | **concluída** — commit `7e0e35d` |
| F4.3 | verificação 4K e microajustes | **concluída** — commit `16490f0`, mais evidência visual sem commit |
| F4.4 | offline de navegação | **concluída** — commit `8b9fce2` |
| F4.5 | operação em hardware real | **em andamento** — reestruturada pela DEC-065, ver as cinco fatias abaixo |
| F4.5A | avaliação do `Phantom Alien 4K IPTV` | **concluída** — 2026-08-16, resultado **HARDWARE REJEITADO** (DEC-065); sem commit de código |
| F4.5B | seleção da plataforma substituta | **pendente** — critérios na DEC-065; nenhuma marca ou modelo escolhida |
| F4.5C | validação física da plataforma substituta | **pendente** |
| F4.5D | operação autônoma | **pendente** |
| F4.5E | gate físico final | **pendente** — fecha a F4.5 e, com ela, a F4 |

A **F4.1** trouxe o token `--color-moldura`, o cursor oculto no painel, as hairlines
em `cqw` e a remoção dos SVGs de scaffold.

A **F4.2** aplicou a **marca oficial**: o lockup horizontal e o símbolo entraram em
`public/marca/`, o favicon derivado do símbolo em `src/app/icon.png`, e o cabeçalho
do painel deixou de desenhar o wordmark textual (DEC-047).

A **F4.3** verificou o painel em **3840×2160** com `devicePixelRatio` 1 — viewport
medido no navegador, sem overflow, com os quatro mínimos da §6 atendidos — e publicou
um **microajuste dos quadros** (`min-width: 0` em `.quadro`), que impede um nome longo
de corretor de alargar a própria coluna e comprimir as demais. A percepção das
hairlines à distância de operação ficou para o ensaio físico da F4.5.

A **F4.4** entregou o **offline de navegação**: um Service Worker com scope `/painel/`
serve uma tela institucional quando a aplicação não responde — seja por falha de rede,
seja por resposta `5xx`. Ela **não persiste métrica nenhuma** (DEC-048): o cache tem só
a própria tela e a marca. Qualquer resposta abaixo de 500 passa normalmente, então o
`404` de token inválido continua sendo 404. A tela mantém a URL do painel e se
recupera sozinha assim que a aplicação volta. Exige **provisionamento online prévio**:
um navegador que nunca instalou o mecanismo ainda depende de rede no primeiro boot.

A **F4.5 foi retomada depois do go-live da v1** (DEC-057) e **mudou de estrutura**
(DEC-065). A **F4.5A** inspecionou o `Phantom Alien 4K IPTV` em 2026-08-16 e o
**rejeitou** como plataforma do painel: Android 7.0, patch de segurança de 1 de dezembro
de 2018, kernel `3.18.24_hi3798mv2x`, build `NRD90M release-keys`, ARM 32 bits, Chrome
112.0.0.0, UI de resolução limitada a 720P/1080P e 2160P disponível apenas a
30/25/24 Hz. O painel **abre e mostra dados reais** no aparelho, e `fetch`,
`localStorage`, `Promise`/`async`, optional chaining, container queries e Fullscreen API
foram comprovados; **Service Worker, Cache Storage e Wake Lock ficaram inconclusivos**
porque a sonda rodou em contexto HTTP inseguro — **não se declara ausência de suporte**.

O aparelho **não é defeituoso**: é **inadequado ao objetivo definido**. A F4.5 passou a
ser **selecionar e validar a plataforma substituta**, que **não está escolhida** —
F4.5B a F4.5E, todas pendentes. O mini PC com Chrome em quiosque descrito na §5.1
continua sendo alternativa, não o que está em mãos. A F4 segue **em andamento** e só se
encerra com a F4.5.

**Entrega v1** · *concluída e em produção (DEC-057)*
Aprovada pelo proprietário em 2026-08-14, entrou **antes** da F4.5 e não abre a F5. As
regras de produto estão nas DEC-051 a DEC-056: venda compartilhada por participações,
propostas com status e valor próprios, saldo histórico mínimo conhecido, reservas de
locação e a faixa superior alternando entre métricas e destaques operacionais.

| Etapa | Escopo | Estado |
|---|---|---|
| E1 | contratos e modelo de dados | **concluída** — `078f360`, sem código |
| E2 | migration **aditiva** + admin de propostas, saldo e reservas | **concluída** — `c6464b5` + `fe00fd2` + `18a6599` |
| E3 | venda compartilhada + métricas + **cutover final** | **concluída** — `2a50965` |
| E4 | painel operacional A/B e novos estados | **concluída** — `c24a0c9` |
| E5 | gate completo | **concluída** — `RELEASE_CANDIDATE_READY_FOR_E6 = YES`, sem commit de código |
| E6 | go-live no Render + smoke público | **concluída** — `adabe2d` implantado no go-live, 5 migrations aplicadas |

A E2 saiu em três fatias: **E2A** (`c6464b5`) — enums, campos de proposta, precisão do
saldo, `ParticipacaoVenda`, `ReservaLocacao`, migration aditiva e backfills, sem
cutover; **E2B** (`fe00fd2`) — administração de propostas e precisão do saldo, mais o
`CHECK` de integridade da proposta; **E2C** (`18a6599`) — administração de reservas de
locação.

A **E3** saiu como uma **unidade atômica** (`2a50965`): schema, migration de cutover,
núcleo de métricas, leitura Prisma, administração de venda compartilhada e testes no
mesmo commit — publicar qualquer metade deixaria runtime e banco em contratos
diferentes.

A **E4** (`c24a0c9`) foi inteiramente de apresentação: 23 caminhos, **sem schema e sem
migration**. Ela entregou a rotação A/B da faixa superior, as duas listas operacionais,
o "+ de" dos acumulados e a extensão do contrato de atualização e da retenção para
transportar as listas. **Nenhuma das cinco publicações de código aplicou migration em
produção** — isso ficou inteiro para o E6, como planejado.

A **E5** certificou o release candidate sem publicar código. A **E6** fez o go-live: a
credencial exposta na P1 foi rotacionada e revogada, o Web Service foi criado no Render,
os secrets foram cadastrados sem passar por linha de comando, e um único deploy manual
do commit `adabe2d` aplicou as **quatro migrations pendentes na ordem** pelo
`pre-deploy`, antes de o processo novo receber tráfego. Com o go-live feito, a F4.5 foi
retomada — e hoje está **em andamento**, reestruturada pela DEC-065 (ver §9).

**Fase 5 — Refinamentos** · *futura*
Metas com barra de progresso, destaque do mês, comparativo com o mês anterior, fotos dos
corretores, exportação.

**Etapas operacionais**
Não são fases técnicas: correm ao lado do roadmap e dependem do proprietário.

| Etapa | Escopo | Estado |
|---|---|---|
| O1 | reconciliação do dossiê secreto do proprietário contra o estado real de Render, Supabase e administração — **o dossiê fica fora do Git e nenhum valor secreto entra no repositório** | **concluída** — auditoria, rotação da senha exposta, contrato de conexões (DEC-066) e reconciliação do cofre e do `.env` local |
| O2 | carga operacional inicial — cadastrar o `saldo_historico` real pela administração, **sem inventar valor** | **parcialmente concluída** — `AVALIACAO_GOOGLE` cadastrado; falta `VENDA` |

O detalhamento das duas está em `docs/HANDOFF_ATUAL.md`, em "Etapas operacionais".

---

## 10. Pendências

Nenhuma bloqueia o início do desenvolvimento.

1. Quantidade máxima de corretores por equipe, para dimensionar a altura dos quadros.
   Se uma equipe passar de 8 ou 9 nomes, o quadro precisa de rolagem automática ou de
   mostrar só os primeiros colocados.
2. Valores iniciais do saldo histórico (quantidades e VGV acumulado antes do sistema).
   Formalizados como a etapa operacional **O2**, **parcialmente concluída** — o saldo de
   `AVALIACAO_GOOGLE` está cadastrado e o de `VENDA` ainda não. Os números são do
   proprietário e **nenhum valor é inventado**.

   > Atenção operacional ao cadastrar: a `dataCorte` é **inclusiva** (DEC-036). O saldo
   > responde por tudo até ela, e só lançamentos posteriores somam por cima. Uma
   > `dataCorte` incompatível com o período que o saldo abrange faz o acumulado parecer
   > errado sem que haja defeito nenhum.
3. ~~Arquivos da marca em alta resolução para a TV 4K.~~ **Encerrada** — os PNGs
   oficiais foram fornecidos e integrados pela F4.2 (`7e0e35d`).
