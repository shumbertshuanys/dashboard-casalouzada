# Handoff Atual — Dashboard Casa Louzada

## Identificação

| Item | Valor |
|---|---|
| Repositório | `github.com/shumbertshuanys/dashboard-casalouzada` (público) |
| Branch | `main` |
| Commit de referência | `22bf943` — `feat: porta protótipo visual para preview` |
| Data do handoff | 2026-08-12 |

## Estado executivo

A Fase 1 está concluída e publicada: o projeto Next.js roda, o banco tem schema e
migração aplicados, o seed cria as três equipes e o administrador, e o login
funciona com sessão em cookie assinado. A área administrativa e o painel real
existem apenas como esqueletos protegidos — nenhum cadastro e nenhum cálculo foi
escrito.

O saneamento pós-F1 terminou: a F1 foi publicada no GitHub, um mecanismo explícito
de troca de senha foi adicionado, e todas as credenciais foram rotacionadas fora do
Git.

O **port do protótipo visual está concluído e versionado** (`22bf943`). A rota
`/preview` desenha o painel inteiro a partir de dados fictícios em
`src/lib/mock-painel.ts`: não consulta o banco, não lê configuração e não substitui
`/painel/[token]`.

A próxima fase é a **F2 — Administração**.

## Fases

| Fase | Estado | Evidência / resumo |
|---|---|---|
| F1 — Fundação | **Concluída** | `b463e86`; 5 tabelas, seed e login verificados no código |
| Protótipo visual | **Concluído** | `22bf943`; `/preview`, mock e componentes versionados |
| F2 — Administração | **Não iniciada** — próxima | nenhum CRUD e nenhuma rota de API na árvore |
| F3 — Painel | **Não iniciada** | `src/lib/metricas.ts` ausente; painel não consulta o banco |
| F4 — Identidade e modo TV | **Não iniciada** | tokens de cor na F1; tipografia e escala 4K comprovadas **só no protótipo** |
| F5 — Refinamentos | **Futura** | metas, comparativos, fotos, exportação |

## O que está implementado

Somente itens confirmados no código, não no plano.

### Fundação técnica

- **Next.js 16.3.0 (App Router) + TypeScript** — `package.json`, `src/app/`.
- **Tailwind CSS v4** — `@import "tailwindcss"` em `src/app/globals.css`, via `@tailwindcss/postcss`.
- **Prisma 7.9.1 sobre PostgreSQL** — `prisma/schema.prisma`, com driver adapter
  `@prisma/adapter-pg` em `src/lib/db.ts`. A partir do Prisma 7 as URLs saíram do
  `schema.prisma`: migrações leem `DIRECT_URL` pelo `prisma.config.ts` e a aplicação
  usa `DATABASE_URL` (pooler) em runtime.
- **Cliente Prisma gerado** em `src/generated/prisma`, fora do Git, recriado pelo
  `postinstall`.

### Modelo de dados

- **Migração `20260811014943_inicial`** aplicada, criando cinco tabelas —
  `equipes`, `corretores`, `lancamentos`, `saldo_historico`, `usuarios` — e o enum
  `tipo_lancamento` com sete valores: `VENDA`, `LOCACAO`, `CAPTACAO_VENDA`,
  `CAPTACAO_EXCLUSIVA`, `CAPTACAO_LOCACAO`, `PROPOSTA`, `AVALIACAO_GOOGLE`.
- **`metas` não existe** no banco, por decisão registrada no plano.
- **Seed** (`prisma/seed.ts`) — três equipes e o usuário administrador, sem
  corretores de exemplo. É idempotente e **não sobrescreve a senha** de um usuário
  que já exista.

### Autenticação e sessão

- **Login por e-mail e senha** — `src/lib/auth.ts`, com resposta de tempo constante
  para não denunciar quais e-mails estão cadastrados.
- **Senha em bcrypt custo 12** — `src/lib/senha.ts`, ponto único de geração e
  conferência de hash, compartilhado com o seed e com o script de troca.
- **Sessão em JWT HS256** assinado com `AUTH_SECRET` (`jose`), guardado em cookie
  `httpOnly`, `sameSite=lax`, `secure` em produção, validade de 7 dias —
  `src/lib/sessao.ts` e `src/lib/sessao-servidor.ts`.
- **Proteção de `/admin`** pelo middleware `src/proxy.ts` (no Next 16 a convenção
  passou a ser `proxy`), que redireciona para `/login` preservando o destino em
  `proximo`, com proteção contra open redirect em `src/app/login/acoes.ts`.

### Painel

- **Rota `/painel/[token]`** protegida por token na URL, comparado com
  `timingSafeEqual`, respondendo **404** quando o token não confere — uma tela de
  "acesso negado" já confirmaria a existência da rota.
- **`noindex`** em duas camadas: cabeçalho `X-Robots-Tag` em `next.config.ts` e
  `metadata.robots` na própria página.
- O conteúdo é o texto "Painel em construção". **A página não consulta o banco.**

### Protótipo visual em `/preview`

Tudo abaixo está no commit `22bf943` — seis arquivos, 785 linhas, nenhum arquivo
preexistente tocado.

- **Rota `/preview`** (`src/app/preview/page.tsx`), sem token e sem login: é uma
  tela de conferência de layout, não a tela da TV.
- **`noindex`** por `metadata.robots` — `index: false`, `follow: false`,
  `nocache: true`.
- **Dados fictícios** em `src/lib/mock-painel.ts`. O módulo **não tem nenhum
  import**: não toca Prisma, nem `src/lib/db.ts`, nem `process.env`. Os valores
  chegam prontos — totais somados, rankings já ordenados e rótulo de período fixo.
- **Três faixas**, como no protótipo: big numbers, VGV por período (anual,
  trimestral e mensal) e a base com o quadro mensal geral à esquerda e os três
  quadros de equipe à direita.
- **Ciclo de oito métricas**, 20 s cada — volta completa de 2min40s. As três
  equipes compartilham um único índice ativo e trocam em sincronia (ver DEC-033).
- **Um único Client Component**, `quadros-equipe.tsx`, e só por causa da rotação.
  As faixas de cima são componentes de servidor.
- **CSS Module** (`painel.module.css`) com toda a escala em `cqw`. `.tv` é o query
  container 16:9 — o maior retângulo 16:9 que cabe na viewport — e não carrega
  padding, porque `cqw` resolve contra o *content box* e o padding encolheria a
  própria referência; o respiro visual mora no filho `.conteudo`.
- **Tipografia Jost** restrita a esta rota, servida pelo build, sem depender do
  Google Fonts em runtime.
- **`prefers-reduced-motion: reduce`** desliga a animação do marcador e a transição
  da lista.

**A rota não consulta o banco e não substitui `/painel/[token]`.** Nada aqui é
cálculo: `src/lib/metricas.ts` continua ausente.

### Rotas existentes

Cinco, ao todo: `/` (redireciona para `/admin`), `/login`, `/admin`,
`/painel/[token]` e `/preview`.

### Operação

- `scripts/trocar-senha-admin.ts` e o comando `npm run db:trocar-senha-admin`
  (commit `c59be18`) — troca a senha de um usuário existente, exige que ele exista,
  nunca cria conta e altera exclusivamente `senhaHash`.

## O que ainda NÃO está implementado

Verificado na árvore versionada, arquivo por arquivo — não presumido pelo plano.

| Item | Estado | Fase |
|---|---|---|
| CRUD de equipes | ausente | F2 |
| CRUD de corretores | ausente | F2 |
| CRUD de lançamentos | ausente | F2 |
| Saldo histórico na administração | ausente | F2 |
| `src/lib/metricas.ts` | ausente | F3 |
| `src/lib/datas.ts` | ausente | F3 |
| Painel ligado ao banco | ausente | F3 |
| Atualização do painel real a cada 60s | ausente | F3 |
| `src/components/ui/` | ausente | F2 |
| `src/app/api/` | ausente | F2/F3 |
| `src/styles/`, `public/marca/` | ausentes | F4 |
| Identidade aplicada ao painel real | ausente | F4 |
| Modo TV: comportamento offline e quiosque | ausente | F4 |
| Metas | ausente por decisão | fora da v1 |

Verificado nesta data: `src/lib/metricas.ts`, `src/lib/datas.ts`, `src/app/api/`,
`src/components/ui/`, `src/styles/` e `public/marca/` continuam sem existir na
árvore. O que existe em `src/components/` é exclusivamente `src/components/painel/`,
com os quatro arquivos do protótipo.

Os tokens de cor da seção 6 do plano **já existem** em `src/app/globals.css`
(`--color-fundo`, `--color-superficie`, `--color-texto`, `--color-texto-secundario`,
`--color-destaque`, `--color-positivo`, `--color-negativo`), desde a F1.

**A F4 não começou.** O protótipo comprovou, numa tela isolada, que a tipografia
Jost, a paleta e a escala 4K funcionam — a `/preview` atinge os quatro mínimos da
seção 6 do plano num painel de 3840px (big numbers 220,03px; VGV 110,21px; nomes
44,16px; rótulos 32,26px). Mas isso é evidência colhida no protótipo, não entrega de
F4: aplicar a identidade e o modo TV ao **painel real**, com comportamento offline e
quiosque, continua sendo F4 e depende da F3.

## Saneamento pós-F1

Três pendências foram tratadas depois da F1, nesta ordem:

1. **Publicação no GitHub.** Uma auditoria constatou que a F1 nunca havia sido
   enviada: o repositório remoto existia e estava vazio, e o clone local não tinha
   `origin`. Um gate de segurança inspecionou os 37 arquivos versionados antes do
   push e não encontrou segredo real. `b463e86` foi publicado.
2. **Mecanismo de troca de senha.** O seed preserva de propósito a senha de quem já
   existe, então mudar `SEED_ADMIN_SENHA` e rodar o seed de novo não troca senha
   nenhuma. Faltava um caminho explícito para rotacionar a senha de login — daí o
   `c59be18`.
3. **Rotação de credenciais.** Concluída fora do Git, no ambiente local: senha do
   banco PostgreSQL/Supabase, `DATABASE_URL`, `DIRECT_URL`, `PAINEL_TOKEN`,
   `AUTH_SECRET`, senha administrativa e `SEED_ADMIN_SENHA`. Cada revogação foi
   comprovada por teste — credencial antiga do banco recusada, senha antiga do admin
   recusada, token antigo do painel em 404, e JWT assinado com o segredo anterior
   rejeitado pelo novo.

Para a rotação foi usado temporariamente um Personal Access Token do Supabase,
exclusivamente contra a Management API. Esse PAT foi removido do `.env` ao final e
**revogado manualmente pelo proprietário da conta no Dashboard do Supabase** — ação
externa à árvore Git, confirmada pelo proprietário, sem evidência no repositório.

**Nenhum valor secreto foi versionado em momento algum.** O `.env` local contém as
credenciais deste ambiente de desenvolvimento e permanece ignorado pelo Git
(`.gitignore`, regra `.env*` com exceção para `.env.example`). Outros ambientes ou
máquinas não foram auditados nesta etapa. Quando existirem ambientes de deploy, suas
credenciais devem viver no mecanismo de environment/secrets do provedor e nunca em
arquivos versionados.

Se as credenciais estiverem replicadas em algum ambiente de deploy (Vercel, CI, outra
máquina), esses lugares apontam para valores antigos e precisam ser atualizados. Só o
`.env` local foi tocado.

## Estado Git

| Commit | Mensagem | Conteúdo |
|---|---|---|
| `b463e86` | `Fase 1: fundação do projeto` | toda a F1 |
| `c59be18` | `chore: adiciona troca segura de senha do admin` | script de troca, comando no `package.json`, variáveis no `.env.example` |
| `f4b5463`, `2ea03fd` | `docs: …` | handoff e decisões |
| `22bf943` | `feat: porta protótipo visual para preview` | port visual: `/preview`, mock fictício e os componentes do painel |

A rotação de credenciais **não gerou commit**: ela ocorreu somente no ambiente não
versionado, e é assim que deve ser.

## Protótipo visual

- O **HTML de referência permanece fora do repositório**, como fonte de consulta.
  Fica em `Downloads/prototipo-painel.html` na máquina do proprietário, com
  SHA-256 `9b6b875093b3f4940c698d7bf9af9905835fe9841d847350ff096d53b9d5bd10`
  (calculado em 2026-08-12). Não é versionado e não é dependência de build.
- Ele **foi auditado regra a regra antes da implementação** — cores, grid, paddings,
  tracking, réguas, marcadores e temporização. O desenho foi **portado, não
  recriado** (DEC-027).
- O port está em **`22bf943`** e implementa a rota `/preview`.
- `/preview` é **implementação visual com dados fictícios**: não consulta o banco e
  **não substitui `/painel/[token]`**, que continua sendo a tela da TV.
- Divergências deliberadas em relação ao HTML original, todas registradas na
  auditoria: nome de corretor maior (`1.15cqw` em vez de `1.02cqw`, para alcançar os
  44px da seção 6); período fixo no mock em vez de derivado do relógio; marcadores
  não clicáveis; ciclo de 20 s exatos por métrica com o fade dentro da janela; e
  ancoragem à viewport com letterbox, no lugar do `max-width: 1600px` do original.
- **A F3 reaproveita o desenho e troca a origem dos dados** — os componentes passam
  a receber valores calculados em `src/lib/metricas.ts`, no lugar do mock.

## Pendências

Após este commit documental, na ordem:

1. **F2 — Administração** — CRUD de equipes, corretores e lançamentos, saldo
   histórico.
2. **F3 — Painel** — depende da F2 e do protótipo, que já está pronto.
3. **F4 — Identidade e modo TV** — depende da F3.

Pendências de informação herdadas do plano, nenhuma bloqueante: número máximo de
corretores por equipe (dimensiona a altura dos quadros), valores iniciais do saldo
histórico e arquivos da marca em alta resolução.

## Divergências entre o repositório e o PLANO.md

Registradas aqui, sem alterar o `PLANO.md`:

1. **`PLANO.md`, linha 3** — "Nenhuma linha de código foi escrita ainda". Desatualizado:
   a F1 está implementada e publicada.
2. **`PLANO.md`, seção 3 (`usuarios`)** e **`README.md`** — dizem que "a senha se troca
   pela própria área administrativa". Essa tela não existe. O mecanismo real hoje é o
   script `npm run db:trocar-senha-admin`. Uma tela de troca de senha continua sendo
   um item legítimo de F2.
3. **`PLANO.md`, seção 8** — da estrutura prevista, `src/components/painel/` já
   existe, criado pelo port. Continuam ausentes `src/components/ui/`,
   `src/lib/metricas.ts`, `src/lib/datas.ts`, `src/app/api/`, `src/styles/` e
   `public/marca/`. Esperado: são fases posteriores.
4. **`PLANO.md`, seção 6** — pede tipografia Jost ou Outfit. Hoje convivem as duas
   coisas: o layout raiz, o `/admin` e o `/login` seguem com Geist, o padrão do
   template, enquanto `/preview` usa Jost, restrita àquela rota. Aplicar a
   identidade ao painel real continua sendo F4.
5. **`PLANO.md`, seção 7** — cita `github.com/<usuário>/dashboard-casalouzada`; o
   repositório hoje é concreto e público.
6. **`PLANO.md`, seção 5.2** — o texto diz "Ciclo de 7 métricas × 20 segundos =
   2min20s", mas a própria frase seguinte enumera **oito** métricas: vendidos, VGV,
   locados, captação de venda, exclusividades, captação de locação, propostas e
   avaliações. O HTML de referência e o port implementado usam **oito métricas ×
   20 s = 2min40s**. Resolvido pela DEC-033; o `PLANO.md` não foi alterado.

## Bloqueios

Nenhum bloqueio estrutural conhecido.

## Próximo passo

**Iniciar a F2 — Administração:** CRUD de equipes, corretores e lançamentos, e a
administração do saldo histórico. Ao fim dela o sistema pode ser alimentado de
verdade, mesmo sem o painel real pronto.

A F2 **não** foi planejada nem iniciada nesta entrega.

## Observação processual

Durante a entrega de `c59be18` houve um `git commit --amend` local antes do primeiro
push, embora a política daquela execução o proibisse. O remoto nunca recebeu o commit
intermediário, e não houve force push nem reescrita de histórico remoto. Nenhuma
correção Git é necessária.

Na entrega de `22bf943` a mensagem do primeiro commit saiu corrompida por erro de
sintaxe de shell — um `@` espúrio no assunto e outro no fim do corpo. A correção foi
feita por um `git commit --amend` explicitamente autorizado para esse fim, antes de
qualquer push, com prova de que a *tree* (`3799b371…`) e o *parent* (`2ea03fdd…`)
permaneceram idênticos e o diff entre os dois commits era vazio. O remoto nunca
recebeu o commit defeituoso e não houve force push.
