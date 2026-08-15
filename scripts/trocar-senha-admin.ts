import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { gerarHashSenha } from "../src/lib/senha";

/**
 * Troca a senha de um usuário que JÁ EXISTE.
 *
 * Não confundir com `prisma/seed.ts`: o seed é reexecutável e por isso preserva a
 * senha e o estado `ativo` de quem já está cadastrado (DEC-019). Este script é o
 * contrário — é rodado à mão, exige que o usuário exista e substitui a senha de
 * propósito. É por aqui que a senha de login é rotacionada.
 *
 *   npm run db:trocar-senha-admin
 *
 * Entrada pelo .env (que não vai para o git), nunca por argumento de linha de
 * comando: argumento vaza no histórico do shell e na lista de processos.
 *
 *   TROCA_SENHA_EMAIL  e-mail do usuário; se ausente, usa SEED_ADMIN_EMAIL
 *   TROCA_SENHA_NOVA   a nova senha
 *
 * A nova senha tem variável própria em vez de reaproveitar SEED_ADMIN_SENHA:
 * aquela guarda a senha com que o usuário foi criado, e reusá-la faria uma
 * execução distraída reinstalar um valor velho. Depois de trocar, apague
 * TROCA_SENHA_NOVA do .env.
 */

const MINIMO_SENHA = 8; // mesmo mínimo exigido pelo seed

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DIRECT_URL ou DATABASE_URL precisa estar definida — veja o .env.example");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function trocarSenha() {
  // Mesma normalização do seed e do login, senão o e-mail não casa.
  const email = (process.env.TROCA_SENHA_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const novaSenha = process.env.TROCA_SENHA_NOVA ?? "";

  if (!email) {
    throw new Error("Defina TROCA_SENHA_EMAIL (ou SEED_ADMIN_EMAIL) no .env");
  }
  if (!novaSenha) {
    throw new Error("Defina TROCA_SENHA_NOVA no .env com a nova senha");
  }
  if (novaSenha.length < MINIMO_SENHA) {
    throw new Error(`TROCA_SENHA_NOVA precisa ter pelo menos ${MINIMO_SENHA} caracteres`);
  }

  // Só o id: não há motivo para trazer o hash atual para a memória do script.
  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });

  // De propósito não é upsert: rotação de senha nunca deve criar conta nova.
  // Um e-mail digitado errado tem que falhar, não virar um usuário fantasma.
  if (!usuario) {
    throw new Error(`Nenhum usuário cadastrado com esse e-mail: ${email}`);
  }

  // Só o hash é tocado — nome, e-mail e ativo ficam como estão.
  await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await gerarHashSenha(novaSenha) } });

  // Sem eco da senha nem do hash.
  console.log(`senha trocada: ${email}`);
  console.log("apague TROCA_SENHA_NOVA do .env agora.");
}

trocarSenha()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    await prisma.$disconnect();
    process.exit(1);
  });
