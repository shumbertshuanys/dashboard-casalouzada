# Handoff Atual — Dashboard Casa Louzada

## Identificação

| Item | Valor |
|---|---|
| Repositório | `github.com/shumbertshuanys/dashboard-casalouzada` (público) |
| Branch | `main` |
| Commit de referência | `c59be18` — `chore: adiciona troca segura de senha do admin` |
| Data do handoff | 2026-08-11 |

## Estado executivo

A Fase 1 está concluída e publicada: o projeto Next.js roda, o banco tem schema e
migração aplicados, o seed cria as três equipes e o administrador, e o login
funciona com sessão em cookie assinado. A área administrativa e o painel existem
apenas como esqueletos protegidos — nenhum cadastro e nenhum cálculo foi escrito.

O saneamento pós-F1 terminou: a F1 foi publicada no GitHub, um mecanismo explícito
de troca de senha foi adicionado, e todas as credenciais foram rotacionadas fora do
Git.

A próxima entrega de desenvolvimento é o **port do protótipo visual já existente**,
não a Fase 2.

## Fases

| Fase | Estado | Evidência / resumo |
|---|---|---|
| F1 — Fundação | **Concluída** | `b463e86`; 4 rotas, 5 tabelas, seed e login verificados no código |
| Protótipo visual | **Design externo existente, integração pendente** | HTML de referência produzido fora do repositório; nada versionado |
| F2 — Administração | **Não iniciada** | nenhum CRUD, nenhum componente, nenhuma rota de API na árvore |
| F3 — Painel | **Não iniciada** | `src/lib/metricas.ts` ausente; painel não consulta o banco |
| F4 — Identidade e modo TV | **Não iniciada** | tokens de cor já existem; tipografia e dimensionamento 4K não |
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

### Rotas existentes

Quatro, ao todo: `/` (redireciona para `/admin`), `/login`, `/admin` e
`/painel/[token]`.

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
| Rotação automática de métricas, atualização a cada 60s | ausente | F3 |
| `/preview` | ausente | protótipo |
| `src/lib/mock-painel.ts` | ausente | protótipo |
| `src/components/` | ausente | F2/F3 |
| `src/app/api/` | ausente | F2/F3 |
| Tipografia da identidade (Jost/Outfit) | ausente — hoje usa Geist | F4 |
| Dimensionamento para 3840×2160, modo TV, comportamento offline | ausente | F4 |
| Metas | ausente por decisão | fora da v1 |

Os tokens de cor da seção 6 do plano **já existem** em `src/app/globals.css`
(`--color-fundo`, `--color-superficie`, `--color-texto`, `--color-texto-secundario`,
`--color-destaque`, `--color-positivo`, `--color-negativo`). É a única parte da F4
que já aterrissou; o restante da identidade não.

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

A rotação de credenciais **não gerou commit**: ela ocorreu somente no ambiente não
versionado, e é assim que deve ser.

## Protótipo visual

- Existe um **HTML de referência visual produzido anteriormente em uma sessão do
  Claude.ai**, fora deste repositório.
- Ele contém o design pretendido para o painel.
- **Ainda não foi integrado ao repositório** e não foi portado para
  React/Next.js/Tailwind.
- **Não constitui implementação da rota `/preview`**, que não existe.
- **O design não deve ser recriado do zero.** O HTML original precisa ser analisado
  antes de qualquer implementação — redesenhar por conta própria descartaria decisões
  visuais já tomadas.

## Pendências

Após este commit documental, na ordem:

1. **Port do protótipo visual existente** — próxima entrega de desenvolvimento.
2. **F2 — Administração** — CRUD de equipes, corretores e lançamentos, saldo
   histórico.
3. **F3 — Painel** — depende da F2 e do protótipo.
4. **F4 — Identidade e modo TV** — depende da F3.

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
3. **`PLANO.md`, seção 8** — a estrutura prevista inclui `src/components/`,
   `src/lib/metricas.ts`, `src/lib/datas.ts`, `src/app/api/`, `src/styles/` e
   `public/marca/`. Nenhum existe ainda. Esperado: são fases posteriores.
4. **`PLANO.md`, seção 6** — pede tipografia Jost ou Outfit; o projeto usa Geist, o
   padrão do template. Ajuste previsto para a F4.
5. **`PLANO.md`, seção 7** — cita `github.com/<usuário>/dashboard-casalouzada`; o
   repositório hoje é concreto e público.

## Bloqueios

Nenhum bloqueio estrutural conhecido.

## Próximo passo

**Receber e analisar o HTML de referência e portá-lo para `/preview`, com dados
fictícios, respeitando os invariantes do projeto** — em especial a independência
entre `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA`, o dimensionamento relativo à viewport
e a distinção entre zero real e ausência de lançamento.

Essa ação **não** foi executada nesta entrega.

## Observação processual

Durante a entrega de `c59be18` houve um `git commit --amend` local antes do primeiro
push, embora a política daquela execução o proibisse. O remoto nunca recebeu o commit
intermediário, e não houve force push nem reescrita de histórico remoto. Nenhuma
correção Git é necessária.
