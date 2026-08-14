# Dashboard Casa Louzada — plano do projeto

Documento de planejamento e referência arquitetural. O texto abaixo descreve o
desenho pretendido; o estado real do que está construído fica em
`docs/HANDOFF_ATUAL.md`, e as decisões em `docs/DECISOES.md`.

**Situação em 2026-08-14:** Fase 1, protótipo visual, Fase 2 — Administração e
**Fase 3 — Painel** concluídos e publicados. As três camadas do painel existem:
`src/lib/metricas.ts` calcula (núcleo **puro**), `src/lib/metricas-prisma.ts` lê o
banco e alimenta esse núcleo, e `src/lib/apresentacao-painel.ts` traduz o resultado
no que a tela desenha. A **F4 — Identidade e modo TV está em andamento**, com F4.0 a
F4.4 concluídas: decisões nas DEC-047 a DEC-050, modo TV em `f49f912`, **marca
oficial aplicada** em `7e0e35d`, **verificação em 3840×2160** encerrada com o
microajuste dos quadros em `16490f0`, e **offline de navegação** em `8b9fce2`.

Por decisão do proprietário em 2026-08-14, a **F4.5 — operação em hardware real —
está ADIADA, não cancelada** (DEC-057). A prioridade imediata é a **entrega da v1
por URL**, em seis etapas (E1 a E6, ver §9): ajustes funcionais aprovados — venda
compartilhada, propostas com status, saldo mínimo conhecido, reservas de locação e a
faixa superior alternada —, gate completo e go-live provisório no Render. Depois da
entrega, a F4.5 é retomada. **Nada dessas novidades está implementado ainda**: a E1
— os contratos, documental — está **concluída e publicada em `078f360`**, e schema e
código continuam no modelo anterior até a E2.

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

### Aprovado para a v1, ainda NÃO implementado (E1 → E2)

Modelo conceitual aprovado em 2026-08-14 (DEC-051 a DEC-055). A migration é da E2 —
o schema atual continua exatamente como descrito acima.

#### `participacoes_venda` (nova — DEC-051)

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

**Contrato excludente no estado final:** depois do **cutover da E3**, toda `VENDA`
fica com `Lancamento.corretorId = NULL` e `Lancamento.equipeId = NULL` — o crédito
mora exclusivamente nas participações; os tipos não-VENDA continuam exigindo os dois
campos e nunca usam participações. O cutover protege isso com um CHECK
semanticamente equivalente a `(tipo = 'VENDA' AND ambos NULL) OR (tipo <> 'VENDA'
AND ambos NOT NULL)`.

**Sequenciamento (DEC-051):** a **E2 é aditiva** — cria a estrutura, faz o backfill
inicial (uma participação `ordem = 1` por VENDA existente) e o prova, mas **mantém**
os campos antigos `NOT NULL`, preenchidos e como fonte executável, sem o CHECK final
e **sem UI de múltiplos participantes**, porque a métrica ainda não sabe
interpretá-los. A **E3 faz o cutover atômico**: completa idempotentemente a
participação de qualquer VENDA criada entre E2 e E3, prova cobertura integral,
adapta aplicação e métricas, torna os campos nullable, grava `NULL` nas VENDA e
valida o CHECK. A dualidade da transição é temporária e controlada; o histórico só
sai dos campos antigos depois de materializado na participação. Crédito e divisão de
VGV: DEC-052 — empresa conta a venda e o valor uma vez; cada participante recebe +1
e sua fração igualitária exata; cada equipe distinta recebe +1 e a soma das frações
dos seus participantes.

#### `lancamentos` — campos novos de proposta (DEC-053)

| Campo | Tipo | Observação |
|---|---|---|
| valor_proposta | numeric? | opcional em `PROPOSTA`, **`NULL` nos demais tipos**; **não é VGV** e não entra em agregado monetário |
| status_proposta | enum? | `AGUARDANDO` (padrão) / `ACEITA` / `REJEITADA`; **obrigatório em `PROPOSTA`, `NULL` nos demais** |

Em `PROPOSTA`, imóvel é obrigatório (novas submissões) e o `valor` do lançamento
permanece `NULL`. A integridade é da aplicação e, quando viável, de proteção
equivalente no banco (E2). Toda proposta conta na métrica mensal qualquer que seja o
status; só `AGUARDANDO` entra na lista operacional da TV. Backfill: existentes
recebem `AGUARDANDO`.

#### `saldo_historico` — precisão (DEC-054)

| Campo | Tipo | Observação |
|---|---|---|
| precisao | enum | `EXATO` / `MINIMO_CONHECIDO` |

Toda linha existente antes da migration E2 recebe **`EXATO`** como
backfill/default, preservando a semântica atual — **nenhum saldo é convertido
automaticamente** para mínimo conhecido; a troca é sempre edição explícita do
administrador. `MINIMO_CONHECIDO` é um piso: o cálculo não muda, e a apresentação
prefixa o acumulado com "+ de" (ex.: "+ de 527", "+ de R$ 800 mi"). Saldo continua
entrando somente nos acumulados.

#### `reservas_locacao` (nova — DEC-055)

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
quatro tabelas, converte cada linha para os tipos de domínio e chama o núcleo. A
regra de cálculo continua inteira em `src/lib/metricas.ts` (DEC-013) — a fronteira
não soma nem conta nada.

O resultado da leitura é separado em três blocos, cada um com as próprias
dependências: `empresa.periodos` (lançamentos), `empresa.acumulados` (lançamentos e
saldo histórico) e `equipes` (lançamentos, corretores e equipes). Uma leitura que
falha derruba só quem dependia dela — falhar o saldo não apaga o VGV do mês
(DEC-040, DEC-042).

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

1. **Big numbers** — imóveis vendidos, VGV total, avaliações Google.
2. **Faixa de VGV** — anual, trimestral e mensal lado a lado.
3. **Base** — quadro "mensal geral" à esquerda (7 métricas) e os três quadros de equipe à direita.

> Aprovado para a v1, **ainda não implementado** (DEC-056, fatia E4): a faixa
> superior passa a alternar entre duas telas de 20 segundos — a **Tela A** acima,
> preservada, e a **Tela B** com duas listas operacionais: "Propostas em andamento"
> (até 3 propostas `AGUARDANDO`) e "Reservas de locação" (até 3 reservas `ATIVA`),
> mais recentes primeiro, imóvel + corretor. Lista vazia mostra "Nenhuma proposta em
> andamento" / "Nenhuma reserva ativa", nunca `0`.

Comportamentos: atualização dos dados a cada 60 segundos sem recarregar a página, e
reconexão automática se a internet cair (mantém o último valor na tela em vez de zerar).

**Escala.** Todo o layout dimensionado em unidades relativas à largura da tela, não em
pixels fixos. Assim o mesmo código serve para a TV de 80" e para o monitor onde você
vai conferir, sem manter duas versões.

**Hardware.** O navegador embutido em smart TV costuma ser lento e desatualizado, e muitas
travam ou desligam a tela após um tempo ocioso. A recomendação é um mini PC conectado à TV
rodando Chrome em modo quiosque, com a URL secreta na inicialização automática. Custa pouco
e resolve de uma vez o autostart, a suspensão de tela e a compatibilidade.

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
| Deploy | Vercel |
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
navegação** já foram entregues; o que resta da fase é a **operação na TV**.

A fase foi fatiada assim:

| Fatia | Escopo | Estado |
|---|---|---|
| F4.0 | decisões de identidade e modo TV | **concluída** — DEC-047 a DEC-050, em `73f490d` |
| F4.1 | refinamento de modo TV | **concluída** — commit `f49f912` |
| F4.2 | marca oficial e assets | **concluída** — commit `7e0e35d` |
| F4.3 | verificação 4K e microajustes | **concluída** — commit `16490f0`, mais evidência visual sem commit |
| F4.4 | offline de navegação | **concluída** — commit `8b9fce2` |
| F4.5 | operação em hardware real | **adiada** — retomada após o go-live da v1 (DEC-057); inventário do aparelho primeiro (DEC-049) |

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

A **operação no `Phantom Alien 4K IPTV` continua futura e está adiada** (DEC-057): a
plataforma do aparelho ainda precisa ser comprovada (DEC-049) — o mini PC com Chrome
em quiosque descrito na §5.1 continua sendo alternativa, não o que está em mãos. A F4
segue **em andamento** e só se encerra com a F4.5.

**Entrega v1** · *em andamento — prioridade imediata (DEC-057)*
Aprovada pelo proprietário em 2026-08-14, entra **antes** da F4.5 e não abre a F5. As
regras de produto estão nas DEC-051 a DEC-056: venda compartilhada por participações,
propostas com status e valor próprios, saldo histórico mínimo conhecido, reservas de
locação e a faixa superior alternando entre métricas e destaques operacionais.

| Etapa | Escopo | Estado |
|---|---|---|
| E1 | contratos e modelo de dados | **concluída** — `078f360`, sem código |
| E2 | migration **aditiva** + admin de propostas, saldo e reservas | **próxima** |
| E3 | venda compartilhada + métricas + **cutover final** | futura |
| E4 | painel operacional A/B e novos estados | futura |
| E5 | gate completo | futura |
| E6 | go-live no Render + smoke test | futura |

A decisão de infraestrutura/plano de produção é do E6 — nada de Render é configurado
antes. Depois do E6, retoma-se a **F4.5**.

**Fase 5 — Refinamentos** · *futura*
Metas com barra de progresso, destaque do mês, comparativo com o mês anterior, fotos dos
corretores, exportação.

---

## 10. Pendências

Nenhuma bloqueia o início do desenvolvimento.

1. Quantidade máxima de corretores por equipe, para dimensionar a altura dos quadros.
   Se uma equipe passar de 8 ou 9 nomes, o quadro precisa de rolagem automática ou de
   mostrar só os primeiros colocados.
2. Valores iniciais do saldo histórico (quantidades e VGV acumulado antes do sistema).
3. ~~Arquivos da marca em alta resolução para a TV 4K.~~ **Encerrada** — os PNGs
   oficiais foram fornecidos e integrados pela F4.2 (`7e0e35d`).
