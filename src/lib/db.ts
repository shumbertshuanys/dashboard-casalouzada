import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function criarCliente(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida — veja o .env.example");
  }
  // Runtime usa o pooler; migrações usam DIRECT_URL (ver prisma.config.ts).
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Em dev o hot reload reavalia o módulo a cada alteração; sem o cache global
// cada recarga abriria um pool de conexões novo.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function obterCliente(): PrismaClient {
  if (!globalParaPrisma.prisma) {
    globalParaPrisma.prisma = criarCliente();
  }
  return globalParaPrisma.prisma;
}

/**
 * O cliente é criado na primeira consulta, não ao importar o módulo: o
 * `next build` carrega as páginas para ler metadados e não deve exigir banco.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const cliente = obterCliente();
    const valor = Reflect.get(cliente, propriedade, cliente);
    return typeof valor === "function" ? valor.bind(cliente) : valor;
  },
});
