import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Acesso ao PostgreSQL local de testes.
 *
 * **Não importa `src/lib/db.ts` de propósito.** Aquele módulo lê `DATABASE_URL`
 * do ambiente da aplicação, que aponta para produção. Teste de integração apaga
 * e recria linhas; apontar para o lugar errado uma vez só já é estrago
 * irreversível. Aqui a URL vem de `.env.test.local` e passa por quatro
 * exigências positivas antes de qualquer conexão.
 */

const ARQUIVO = ".env.test.local";
const CHAVE = "DATABASE_URL_TEST";
const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "::1"]);
const DATABASE_ESPERADO = "casalouzada_test";
const ROLE_ESPERADA = "casalouzada_test";
const PROTOCOLOS = new Set(["postgres:", "postgresql:"]);

/** Nunca inclui o valor lido na mensagem — é aí que credencial vaza. */
function recusar(motivo: string): never {
  throw new Error(`${CHAVE} inválida: ${motivo}. Corrija ${ARQUIVO}.`);
}

function lerBruto(): string {
  let conteudo: string;
  try {
    conteudo = readFileSync(ARQUIVO, "utf8");
  } catch {
    recusar(`não foi possível ler ${ARQUIVO}`);
  }

  const linha = conteudo.split(/\r?\n/).find((l) => l.startsWith(`${CHAVE}=`));
  if (!linha) recusar("variável ausente");

  // O `.env` do projeto guarda valores entre aspas; tirar antes de analisar.
  return linha.slice(CHAVE.length + 1).trim().replace(/^["']|["']$/g, "");
}

/**
 * Devolve a URL do banco de teste, ou lança.
 *
 * As quatro exigências são positivas — o banco tem de *ser* o local esperado.
 * Não há comparação com a URL de produção: para isso seria preciso lê-la, e
 * ler segredo de produção só para conferir é risco sem contrapartida.
 */
export function urlBancoTeste(): string {
  const bruto = lerBruto();
  if (bruto === "") recusar("valor vazio");

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    // Sem repassar `bruto`: o construtor de URL põe o input na mensagem dele.
    recusar("não é uma URL analisável");
  }

  if (!PROTOCOLOS.has(url.protocol)) recusar("protocolo não é PostgreSQL");
  if (!HOSTS_LOCAIS.has(url.hostname)) recusar("host não é local");

  const database = url.pathname.replace(/^\//, "");
  if (database !== DATABASE_ESPERADO) recusar(`database não é ${DATABASE_ESPERADO}`);
  if (url.username !== ROLE_ESPERADA) recusar(`usuário não é ${ROLE_ESPERADA}`);

  return bruto;
}

/** Cliente Prisma ligado exclusivamente ao banco local de teste. */
export function criarPrismaTeste(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: urlBancoTeste() }) });
}

/**
 * Prefixo dos registros criados por teste. Serve para limpar sem risco: nada
 * que o seed cria começa com isto.
 */
export const PREFIXO_FIXTURE = "__F21_TESTE_";

/** Apaga só o que o teste criou. Nunca toca nas equipes do seed. */
export async function limparFixtures(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.equipe.deleteMany({
    where: { nome: { startsWith: PREFIXO_FIXTURE } },
  });
  return count;
}
