import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

/**
 * O contrato de conexão dos scripts administrativos (DEC-066).
 *
 * As três variáveis do projeto têm consumidores diferentes e **duas sintaxes de
 * TLS incompatíveis**: o engine Rust do Prisma lê `sslaccept`/`sslcert` e ignora
 * `sslmode=verify-full`/`sslrootcert`; o node-postgres faz o contrário. Um
 * fallback de `ADMIN_DATABASE_URL` para `DIRECT_URL` seria pior do que não
 * conectar: a conexão subiria *parecendo* verificada e não validaria certificado
 * nenhum. Cair para `DATABASE_URL` seria outro engano — aquele role tem
 * `usuarios` somente leitura, e o erro chegaria como falha de permissão.
 *
 * Daí o que se prova aqui: sem `ADMIN_DATABASE_URL` os dois comandos **falham
 * antes de abrir conexão**, mesmo com as outras duas variáveis definidas e
 * apetitosas ao lado.
 *
 * As URLs de chamariz apontam para uma porta local sem servidor. Elas existem
 * por dois motivos: provam que a presença das outras variáveis não salva a
 * execução, e garantem que uma regressão que reintroduza o fallback bata num
 * destino morto — nunca em produção.
 */

const CHAMARIZ = "postgresql://ninguem:nada@127.0.0.1:1/banco_inexistente";

/** Sinais de que a execução chegou a tentar rede — nenhum deve aparecer. */
const SINAIS_DE_CONEXAO = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo|connect /i;

function rodarSemAdminUrl(alvo: string): { status: number | null; saida: string } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: CHAMARIZ,
    DIRECT_URL: CHAMARIZ,
    TROCA_SENHA_EMAIL: "__contrato_conexao@exemplo.test",
    TROCA_SENHA_NOVA: "senha-de-teste-apenas-local",
    SEED_ADMIN_NOME: "__Contrato",
    SEED_ADMIN_EMAIL: "__contrato_conexao@exemplo.test",
    SEED_ADMIN_SENHA: "senha-de-teste-apenas-local",
  };
  delete env.ADMIN_DATABASE_URL;

  const resultado = spawnSync("npx", ["tsx", alvo], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env,
  });
  return { status: resultado.status, saida: (resultado.stdout ?? "") + (resultado.stderr ?? "") };
}

describe("contrato de conexão administrativa — fail closed (DEC-066)", () => {
  for (const [rotulo, alvo] of [
    ["seed", "prisma/seed.ts"],
    ["troca de senha", "scripts/trocar-senha-admin.ts"],
  ] as const) {
    it(`${rotulo}: sem ADMIN_DATABASE_URL, falha e não tenta conectar`, () => {
      const { status, saida } = rodarSemAdminUrl(alvo);

      assert.notEqual(status, 0, "o comando devia falhar sem ADMIN_DATABASE_URL");
      assert.match(saida, /ADMIN_DATABASE_URL/, "a mensagem devia nomear a variável que falta");
      assert.doesNotMatch(
        saida,
        SINAIS_DE_CONEXAO,
        "a falha devia acontecer antes de qualquer tentativa de conexão",
      );
    });

    it(`${rotulo}: não cai silenciosamente para DATABASE_URL nem para DIRECT_URL`, () => {
      const { saida } = rodarSemAdminUrl(alvo);

      // O chamariz está definido nas duas; se algum fallback existisse, a
      // execução teria ido até a rede — e os sinais acima apareceriam.
      assert.doesNotMatch(saida, SINAIS_DE_CONEXAO);
      // E a URL nunca pode aparecer na saída, com ou sem erro.
      assert.ok(!saida.includes(CHAMARIZ), "nenhuma URL de conexão pode ser impressa");
      assert.ok(!saida.includes("ninguem:nada"), "nenhuma credencial pode ser impressa");
    });
  }
});
