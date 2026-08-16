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
 * Entrada pelo ambiente do processo, nunca por argumento de linha de comando:
 * argumento vaza no histórico do shell e na lista de processos. O .env é o
 * caminho normal; para uma senha sensível, prefira injetar a variável só no
 * processo, sem escrevê-la em arquivo nenhum.
 *
 *   ADMIN_DATABASE_URL  conexão administrativa (ver abaixo)
 *   TROCA_SENHA_EMAIL   e-mail do usuário; se ausente, usa SEED_ADMIN_EMAIL
 *   TROCA_SENHA_NOVA    a nova senha
 *
 * A nova senha tem variável própria em vez de reaproveitar SEED_ADMIN_SENHA:
 * aquela guarda a senha com que o usuário foi criado, e reusá-la faria uma
 * execução distraída reinstalar um valor velho. Depois de trocar, apague
 * TROCA_SENHA_NOVA de onde tiver ficado.
 */

const MINIMO_SENHA = 8; // mesmo mínimo exigido pelo seed

/**
 * Conexão administrativa **própria**, por `ADMIN_DATABASE_URL` (DEC-066).
 *
 *   - `DATABASE_URL` não serve: é o role `casalouzada_runtime`, que tem
 *     `usuarios` **somente leitura** — o UPDATE de senha falharia por permissão;
 *   - `DIRECT_URL` não serve: pertence ao Prisma CLI, cujo engine Rust lê
 *     `sslaccept=strict` e `sslcert`. Este script roda sobre node-postgres, que
 *     ignora as duas e exige `sslmode=verify-full` + `sslrootcert`; reaproveitar
 *     a URL do CLI dá uma conexão que parece verificada e não valida nada.
 *
 * Sem fallback: escolher sozinho a URL errada transformaria um erro de
 * configuração num erro obscuro de permissão — ou, pior, numa conexão sem
 * verificação de certificado.
 */
const connectionString = process.env.ADMIN_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "ADMIN_DATABASE_URL precisa estar definida para trocar a senha — veja o .env.example. " +
      "DATABASE_URL e DIRECT_URL não servem: a primeira usa o role de runtime, " +
      "a segunda tem a sintaxe de TLS do Prisma CLI.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function trocarSenha() {
  // Mesma normalização do seed e do login, senão o e-mail não casa.
  const email = (process.env.TROCA_SENHA_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const novaSenha = process.env.TROCA_SENHA_NOVA ?? "";

  if (!email) {
    throw new Error("Defina TROCA_SENHA_EMAIL (ou SEED_ADMIN_EMAIL)");
  }
  if (!novaSenha) {
    throw new Error("Defina TROCA_SENHA_NOVA com a nova senha");
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

  // Sem eco da senha, do hash nem da URL de conexão.
  console.log(`senha trocada: ${email}`);
  console.log("apague TROCA_SENHA_NOVA de onde ela estiver agora.");
}

trocarSenha()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    await prisma.$disconnect();
    process.exit(1);
  });
