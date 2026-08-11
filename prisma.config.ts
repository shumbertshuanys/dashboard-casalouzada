import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migração e introspecção precisam da conexão direta — o pooler em modo
    // transaction derruba os advisory locks que o schema engine usa.
    // A aplicação em runtime usa DATABASE_URL (pooler), em src/lib/db.ts.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
