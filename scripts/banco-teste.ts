import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { urlBancoTeste } from "../tests/helpers/banco-teste";

/**
 * Roda um comando qualquer apontando para o PostgreSQL **local** de teste.
 *
 *   tsx scripts/banco-teste.ts npx prisma migrate deploy
 *   tsx scripts/banco-teste.ts npx next dev
 *
 * O `.env` não é tocado: `DATABASE_URL`, `DIRECT_URL` e `ADMIN_DATABASE_URL` são
 * sobrescritas apenas no `env` do processo filho. A URL passa antes pelas exigências de
 * `urlBancoTeste()`, então um comando destrutivo não tem como cair em produção
 * por descuido de ambiente.
 *
 * A URL nunca é impressa — só o destino já validado, que não é segredo.
 */

const comando = process.argv.slice(2);
if (comando.length === 0) {
  console.error("uso: tsx scripts/banco-teste.ts <comando...>");
  process.exit(1);
}

/**
 * Mapeia `X_TEST` para `X` — `SEED_ADMIN_SENHA_TEST` vira `SEED_ADMIN_SENHA`,
 * `AUTH_SECRET_TEST` vira `AUTH_SECRET`, e assim por diante. Serve para o
 * processo filho rodar inteiramente com credenciais locais, sem que nada de
 * produção precise ser lido.
 *
 * O `prisma/seed.ts` e o Next fazem carga de `.env`, mas nenhum dos dois
 * sobrescreve variável já definida no processo — então o que é injetado aqui
 * vence o `.env`.
 *
 * `DATABASE_URL_TEST` fica de fora: ela é tratada à parte, por
 * `urlBancoTeste()`, que a valida antes de qualquer uso.
 */
function variaveisDeTeste(): Record<string, string> {
  const mapeadas: Record<string, string> = {};
  let conteudo: string;
  try {
    conteudo = readFileSync(".env.test.local", "utf8");
  } catch {
    return mapeadas;
  }

  for (const linha of conteudo.split(/\r?\n/)) {
    const igual = linha.indexOf("=");
    if (linha.startsWith("#") || igual < 0) continue;

    const chave = linha.slice(0, igual).trim();
    if (!chave.endsWith("_TEST") || chave === "DATABASE_URL_TEST") continue;

    mapeadas[chave.slice(0, -"_TEST".length)] = linha
      .slice(igual + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return mapeadas;
}

const url = urlBancoTeste();
const variaveis = variaveisDeTeste();

console.log(`[banco-teste] destino: 127.0.0.1:5432/casalouzada_test (validado)`);
console.log(`[banco-teste] variaveis locais mapeadas: ${Object.keys(variaveis).join(", ") || "nenhuma"}`);
console.log(`[banco-teste] executando: ${comando.join(" ")}`);

const resultado = spawnSync(comando[0], comando.slice(1), {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ...variaveis,
    // As três apontam para o mesmo banco local: não há pooler, não há TLS e o
    // role é um só, então a distinção entre runtime, Prisma CLI e scripts
    // administrativos (DEC-066) deixa de ter efeito aqui. Ela existe para o
    // ambiente real, e é lá que as três divergem.
    DATABASE_URL: url,
    DIRECT_URL: url,
    ADMIN_DATABASE_URL: url,
  },
});

process.exit(resultado.status ?? 1);
