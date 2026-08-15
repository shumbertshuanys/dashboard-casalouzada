import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { gerarHashSenha } from "../src/lib/senha";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL ou DATABASE_URL precisa estar definida — veja o .env.example");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Sem corretores de exemplo: os reais são cadastrados pela área administrativa.
const EQUIPES = [
  { nome: "Equipe Suellen", gerenteNome: "Suellen", ordemExibicao: 1 },
  { nome: "Equipe Lena", gerenteNome: "Lena", ordemExibicao: 2 },
  { nome: "Equipe Fernanda L.", gerenteNome: "Fernanda L.", ordemExibicao: 3 },
];

async function semearEquipes() {
  for (const equipe of EQUIPES) {
    await prisma.equipe.upsert({
      where: { nome: equipe.nome },
      update: { gerenteNome: equipe.gerenteNome, ordemExibicao: equipe.ordemExibicao },
      create: equipe,
    });
    console.log(`equipe ok: ${equipe.nome}`);
  }
}

async function semearAdministrador() {
  const nome = process.env.SEED_ADMIN_NOME ?? "Administrador";
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const senha = process.env.SEED_ADMIN_SENHA ?? "";

  if (!email || !senha) {
    throw new Error(
      "Defina SEED_ADMIN_EMAIL e SEED_ADMIN_SENHA no .env antes de rodar o seed — veja o .env.example",
    );
  }
  if (senha.length < 8) {
    throw new Error("SEED_ADMIN_SENHA precisa ter pelo menos 8 caracteres");
  }

  const existente = await prisma.usuario.findUnique({ where: { email } });

  if (existente) {
    // Só o nome. `senhaHash` e `ativo` ficam de fora porque o seed é
    // reexecutável, e uma reexecução não pode desfazer decisão administrativa:
    // sobrescrever a senha devolveria o valor da variável de ambiente por cima
    // de uma troca feita depois, e regravar `ativo` reativaria uma conta que foi
    // desativada de propósito — que é hoje a forma de cortar acesso na hora,
    // já que a guarda relê `ativo` no banco a cada operação.
    await prisma.usuario.update({ where: { email }, data: { nome } });
    console.log(`usuário já existia, senha e estado preservados: ${email}`);
    return;
  }

  await prisma.usuario.create({
    data: { nome, email, senhaHash: await gerarHashSenha(senha) },
  });
  console.log(`usuário criado: ${email}`);
}

async function main() {
  await semearEquipes();
  await semearAdministrador();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    await prisma.$disconnect();
    process.exit(1);
  });
