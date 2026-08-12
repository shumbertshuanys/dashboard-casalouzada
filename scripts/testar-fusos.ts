import { spawnSync } from "node:child_process";

/**
 * Roda a suíte inteira uma vez por fuso, para provar que nenhum teste depende do
 * relógio da máquina.
 *
 * A garantia principal não é este script: vem da construção dos helpers, que só
 * usam getters UTC e `Intl` com `timeZone` explícito. Isto aqui é a confirmação
 * empírica.
 *
 * O `TZ` entra pelo `env` do processo filho, e não como prefixo de comando —
 * `TZ=UTC npm test` é sintaxe POSIX e não funciona no `cmd.exe` do Windows.
 */

const FUSOS = ["UTC", "America/Sao_Paulo", "Asia/Tokyo"];

const ARGUMENTOS = [
  "--import",
  "tsx",
  // `server-only` só resolve para o stub vazio sob esta condição de exportação;
  // é a mesma que o Next usa nos Server Components.
  "--conditions=react-server",
  "--test",
  "tests/**/*.test.ts",
];

let houveFalha = false;

for (const fuso of FUSOS) {
  console.log(`\n=== TZ=${fuso} ===`);

  const resultado = spawnSync(process.execPath, ARGUMENTOS, {
    stdio: "inherit",
    env: { ...process.env, TZ: fuso },
  });

  if (resultado.status !== 0) {
    houveFalha = true;
    console.error(`FALHOU com TZ=${fuso} (exit ${resultado.status})`);
  }
}

if (houveFalha) {
  console.error("\nA suíte depende do fuso da máquina — isso é defeito.");
  process.exit(1);
}

console.log(`\nSuíte estável nos ${FUSOS.length} fusos testados.`);
