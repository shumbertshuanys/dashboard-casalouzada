import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { criarPrismaTeste, urlBancoTeste } from "../helpers/banco-teste";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * O contrato do seed sobre um usuário que já existe (DEC-019, SEC-009).
 *
 * O que se prova aqui não é a função e sim **o comando**: `npm run db:seed` é
 * rodado como processo filho, exatamente como um operador o rodaria, contra o
 * banco local. Testar a função importada deixaria de fora justamente o que
 * interessa — que uma reexecução real não desfaz decisão administrativa.
 *
 * O caso central é o segundo: uma conta desativada de propósito precisa
 * continuar desativada depois do seed. Desativar é hoje a forma de cortar
 * acesso na hora, porque a guarda relê `ativo` a cada operação e o JWT
 * sobrevive ao logout até expirar; um seed que reativa desfaz exatamente isso.
 *
 * Nada de senha ou hash é impresso: a preservação do `senhaHash` é verificada
 * por fingerprint SHA-256 truncado, que prova igualdade sem revelar o valor.
 */

const EMAIL = "__sec009_teste_seed@exemplo.test";
const SENHA = "senha-de-teste-apenas-local";
const NOME_INICIAL = "__SEC009 Nome Inicial";
const NOME_ATUALIZADO = "__SEC009 Nome Atualizado";

let prisma: PrismaClient;

/** Identidade do hash sem expor o hash. */
function impressao(hash: string): string {
  return createHash("sha256").update(hash).digest("hex").slice(0, 16);
}

/**
 * Roda o comando real do seed contra o banco local.
 *
 * A URL vem de `urlBancoTeste()`, o mesmo guard do projeto — host local,
 * database e role `casalouzada_test` —, então o destino é validado antes de
 * qualquer execução. O `scripts/banco-teste.ts` não entra no caminho de
 * propósito: ele mapeia `SEED_ADMIN_*_TEST` do `.env.test.local` por cima do
 * ambiente, e o teste precisa que as suas próprias variáveis prevaleçam.
 */
function rodarSeed(nome: string): { status: number | null; saida: string } {
  const url = urlBancoTeste();
  const resultado = spawnSync("npx", ["prisma", "db", "seed"], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      SEED_ADMIN_NOME: nome,
      SEED_ADMIN_EMAIL: EMAIL,
      SEED_ADMIN_SENHA: SENHA,
    },
  });
  return { status: resultado.status, saida: (resultado.stdout ?? "") + (resultado.stderr ?? "") };
}

async function contaDeTeste() {
  return prisma.usuario.findUnique({
    where: { email: EMAIL },
    select: { id: true, nome: true, ativo: true, senhaHash: true },
  });
}

before(async () => {
  prisma = criarPrismaTeste();
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("seed do administrador — conta ausente", () => {
  it("cria a conta, ativa, com senha configurada", async () => {
    assert.equal(await contaDeTeste(), null, "a conta não devia existir antes");

    const { status } = rodarSeed(NOME_INICIAL);
    assert.equal(status, 0, "o seed devia terminar com sucesso");

    const conta = await contaDeTeste();
    assert.ok(conta, "a conta devia ter sido criada");
    assert.equal(conta.nome, NOME_INICIAL);
    assert.equal(conta.ativo, true, "conta nova nasce ativa pelo default do schema");
    assert.ok(conta.senhaHash.length > 0, "a senha devia estar configurada");
    // Hash bcrypt, não a senha em claro.
    assert.match(conta.senhaHash, /^\$2[aby]\$/, "senhaHash devia ser um hash bcrypt");
  });
});

describe("seed do administrador — conta existente e desativada (SEC-009)", () => {
  it("atualiza o nome, mas preserva ativo=false e o senhaHash", async () => {
    const antes = await contaDeTeste();
    assert.ok(antes, "o cenário anterior devia ter criado a conta");

    // Fixture: a desativação administrativa que o seed não pode desfazer.
    await prisma.usuario.update({ where: { email: EMAIL }, data: { ativo: false } });

    const desativada = await contaDeTeste();
    assert.ok(desativada);
    assert.equal(desativada.ativo, false, "o setup devia ter desativado a conta");
    const hashAntes = impressao(desativada.senhaHash);

    const { status } = rodarSeed(NOME_ATUALIZADO);
    assert.equal(status, 0, "o seed devia terminar com sucesso");

    const depois = await contaDeTeste();
    assert.ok(depois);

    // 1) o uso legítimo da reexecução continua funcionando
    assert.equal(depois.nome, NOME_ATUALIZADO, "o nome devia ter sido atualizado");

    // 2) o núcleo do SEC-009
    assert.equal(depois.ativo, false, "a conta desativada NÃO pode ser reativada pelo seed");

    // 3) a garantia antiga da DEC-019 continua valendo
    assert.equal(impressao(depois.senhaHash), hashAntes, "o senhaHash devia permanecer idêntico");
    assert.equal(depois.id, desativada.id, "devia ser a mesma linha, não uma recriação");
  });

  it("continua preservando ativo=false em execuções repetidas", async () => {
    // Idempotência do que importa: rodar de novo não muda a decisão.
    const { status } = rodarSeed(NOME_ATUALIZADO);
    assert.equal(status, 0);

    const conta = await contaDeTeste();
    assert.ok(conta);
    assert.equal(conta.ativo, false);
  });
});
