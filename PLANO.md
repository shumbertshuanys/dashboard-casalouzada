# Dashboard Casa Louzada — plano do projeto

Documento de planejamento. Nenhuma linha de código foi escrita ainda.

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

---

## 4. Regras de cálculo

- **Big numbers** = `saldo_historico` + soma de todos os lançamentos, sem recorte de data.
- **VGV mensal** = soma de `valor` das vendas do mês civil corrente.
- **VGV trimestral** = trimestre civil corrente (jan–mar, abr–jun, jul–set, out–dez).
- **VGV anual** = ano civil corrente.
- **Quadro mensal geral** = mês civil corrente, contagem por tipo.
- **Quadros de equipe** = mês civil corrente, corretores ordenados do maior para o menor na
  métrica que estiver ativa no momento.
- Fuso horário fixo em `America/Sao_Paulo` para o corte de mês não errar.

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

Cuidados de leitura à distância, considerando 80 polegadas vistas de 3 a 6 metros. Valores
em pixels de tela 4K real:

| Elemento | Tamanho mínimo |
|---|---|
| Big numbers | 220px |
| VGV por período | 110px |
| Nome do corretor e valores das listas | 44px |
| Rótulos e legendas | 32px |

Contraste alto, espaçamento generoso, e nenhuma informação transmitida só por cor.

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

**Fase 1 — Fundação**
Projeto Next.js, Tailwind, conexão com o banco, schema Prisma, migrações, seed com as três
equipes e o usuário administrador, login funcionando. Sem corretores de exemplo — você
cadastra os reais na Fase 2.

**Fase 2 — Administração**
CRUD de equipes, corretores e lançamentos. Saldo histórico. Ao final desta fase você
já consegue alimentar o sistema de verdade, mesmo sem o painel pronto.

**Fase 3 — Painel**
Camada de cálculo, as três faixas do layout, atualização automática, rotação de métricas,
proteção por token na URL.

**Fase 4 — Identidade e modo TV**
Cores, tipografia, marca, ajuste fino para 3840×2160, transições, comportamento offline,
configuração do mini PC em modo quiosque.

**Fase 5 — Refinamentos**
Metas com barra de progresso, destaque do mês, comparativo com o mês anterior, fotos dos
corretores, exportação.

---

## 10. Pendências

Nenhuma bloqueia o início do desenvolvimento.

1. Quantidade máxima de corretores por equipe, para dimensionar a altura dos quadros.
   Se uma equipe passar de 8 ou 9 nomes, o quadro precisa de rolagem automática ou de
   mostrar só os primeiros colocados.
2. Valores iniciais do saldo histórico (quantidades e VGV acumulado antes do sistema).
3. Arquivos da marca em alta resolução para a TV 4K.
