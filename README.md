# Dashboard Casa Louzada

Painel de resultados da imobiliária para exibição em TV, alimentado por uma área
administrativa própria. O planejamento completo está em [PLANO.md](./PLANO.md).

Estado atual: **Fase 1 — Fundação**. Projeto, banco, schema, seed e login funcionando.
Os cadastros e o painel entram nas fases seguintes.

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS, PostgreSQL com Prisma, deploy na Vercel.

## Rodando local

Requer Node 20+ e um PostgreSQL acessível (Supabase ou Neon).

```bash
npm install
cp .env.example .env    # no PowerShell: Copy-Item .env.example .env
```

Preencha o `.env`:

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão via **pooler**, para a aplicação em **runtime** (node-postgres, `src/lib/db.ts`). |
| `DIRECT_URL` | Conexão **direta**, para o **Prisma CLI** — migrações e introspecção (engine Rust, `prisma.config.ts`). O modo transaction do pooler derruba os advisory locks do schema engine. |
| `ADMIN_DATABASE_URL` | Conexão **direta** com role administrativo, para os **scripts Node** — `db:seed` e `db:trocar-senha-admin` (node-postgres). Local/operacional: o Web Service não precisa dela. |
| `AUTH_SECRET` | Assina o cookie de sessão. Mínimo de 32 caracteres. |
| `PAINEL_TOKEN` | Token que entra na URL do painel. |
| `SEED_ADMIN_NOME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_SENHA` | Usuário administrador criado pelo seed. |

Os comandos para gerar `AUTH_SECRET` e `PAINEL_TOKEN` estão no próprio `.env.example`.

Depois:

```bash
npm run db:migrate      # aplica as migrações e regenera o Prisma Client
npm run db:seed         # três equipes + usuário administrador
npm run dev
```

- Administração: <http://localhost:3000/admin> (redireciona para `/login`)
- Painel da TV: `http://localhost:3000/painel/<PAINEL_TOKEN>`

O seed é idempotente. Se o e-mail do administrador já existir, a senha **não** é
sobrescrita — ele pode já ter trocado a senha pela área administrativa.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução em produção |
| `npm run lint` | ESLint |
| `npm run db:migrate` | `prisma migrate dev` — cria e aplica migração em desenvolvimento |
| `npm run db:deploy` | `prisma migrate deploy` — aplica migrações pendentes em produção |
| `npm run db:generate` | Regenera o Prisma Client |
| `npm run db:seed` | Roda `prisma/seed.ts` — exige `ADMIN_DATABASE_URL` |
| `npm run db:trocar-senha-admin` | Rotaciona a senha de login — exige `ADMIN_DATABASE_URL` |
| `npm run db:studio` | Prisma Studio |

## Estrutura

```
prisma/
  schema.prisma      # modelo de dados (seção 3 do plano)
  migrations/
  seed.ts            # três equipes + administrador
src/
  app/
    login/           # e-mail e senha
    admin/           # área administrativa (Fase 2)
    painel/[token]/  # tela da TV (Fase 3)
  lib/
    db.ts            # Prisma Client
    auth.ts          # verificação de credencial
    senha.ts         # hash bcrypt, compartilhado com o seed
    sessao.ts        # assinatura do cookie (também roda no middleware)
    sessao-servidor.ts
  proxy.ts           # middleware que protege /admin (o Next 16 renomeou a convenção)
prisma.config.ts     # a partir do Prisma 7 é aqui que mora a URL das migrações
```

## Decisões que valem lembrar

- **Prisma 7**: as URLs de conexão saíram do `schema.prisma`. Migrações leem
  `datasource.url` do `prisma.config.ts` (`DIRECT_URL`); a aplicação conecta pelo
  driver adapter em `src/lib/db.ts` (`DATABASE_URL`).
- **Três conexões, não duas** (DEC-066). Os scripts administrativos em Node usam
  `ADMIN_DATABASE_URL` e **não** têm fallback. O motivo não é organização: o
  engine Rust do Prisma lê `sslaccept=strict`/`sslcert` e **ignora**
  `sslmode=verify-full`/`sslrootcert`; o node-postgres faz o inverso. Reaproveitar
  a `DIRECT_URL` num script Node dá uma conexão que parece verificada e não valida
  certificado nenhum — e a `DATABASE_URL` sequer tem privilégio de escrita em
  `usuarios`.
- **Client gerado** em `src/generated/prisma` não vai para o git — o `postinstall`
  roda `prisma generate`.
- **Captação exclusiva** é um tipo de lançamento independente de captação de venda.
  Um lançamento é uma coisa ou outra, e os totais nunca se sobrepõem.
- **Metas** ficaram fora da v1 de propósito. Entram depois como migração aditiva.
- **Painel** não tem login: a proteção é o token longo na URL, e a rota responde
  404 para token errado — uma tela de "acesso negado" já confirmaria a rota.

## Deploy (Vercel)

Configure as mesmas variáveis do `.env` no projeto da Vercel e rode
`npm run db:deploy` contra o banco de produção.
