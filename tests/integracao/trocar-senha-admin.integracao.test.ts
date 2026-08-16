import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { criarPrismaTeste, urlBancoTeste } from "../helpers/banco-teste";
import { conferirSenha, gerarHashSenha } from "@/lib/senha";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * O contrato do `npm run db:trocar-senha-admin` (DEC-066), provado como
 * **comando**, não como função: ele é rodado como processo filho, do jeito que
 * um operador o rodaria, contra o banco local.
 *
 * O script é a única forma de rotacionar a senha de login — não existe tela para
 * isso —, e foi por ele que a rotação emergencial passou. Então o que se prova é
 * o conjunto: a senha nova vale, a anterior deixa de valer, o resto da linha
 * sobrevive, e um e-mail errado não vira conta fantasma.
 *
 * Nenhuma senha real entra aqui, e nada é impresso: as duas senhas são literais
 * locais, e a identidade do hash é verificada por comparação bcrypt, nunca por
 * exibição.
 */

const EMAIL = "__o1s1_troca_senha@exemplo.test";
const EMAIL_INEXISTENTE = "__o1s1_nao_existe@exemplo.test";
const NOME = "__O1S1 Conta de Teste";
const SENHA_ANTIGA = "senha-antiga-apenas-local";
const SENHA_NOVA = "senha-nova-apenas-local";

let prisma: PrismaClient;

function rodarTroca(email: string, novaSenha: string): { status: number | null; saida: string } {
  const url = urlBancoTeste();
  const resultado = spawnSync("npx", ["tsx", "scripts/trocar-senha-admin.ts"], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      // A conexão administrativa própria — é isto que o script exige agora.
      ADMIN_DATABASE_URL: url,
      TROCA_SENHA_EMAIL: email,
      TROCA_SENHA_NOVA: novaSenha,
    },
  });
  return { status: resultado.status, saida: (resultado.stdout ?? "") + (resultado.stderr ?? "") };
}

async function conta() {
  return prisma.usuario.findUnique({
    where: { email: EMAIL },
    select: { id: true, nome: true, email: true, ativo: true, senhaHash: true },
  });
}

before(async () => {
  prisma = criarPrismaTeste();
  await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL, EMAIL_INEXISTENTE] } } });
  await prisma.usuario.create({
    data: { nome: NOME, email: EMAIL, senhaHash: await gerarHashSenha(SENHA_ANTIGA) },
  });
});

after(async () => {
  await prisma.usuario.deleteMany({ where: { email: { in: [EMAIL, EMAIL_INEXISTENTE] } } });
  await prisma.$disconnect();
});

describe("troca de senha administrativa — usuário existente", () => {
  it("troca o hash, invalida a senha anterior e preserva o resto da linha", async () => {
    const antes = await conta();
    assert.ok(antes, "a fixture devia existir");
    assert.ok(await conferirSenha(SENHA_ANTIGA, antes.senhaHash), "a senha inicial devia valer");

    const { status, saida } = rodarTroca(EMAIL, SENHA_NOVA);
    assert.equal(status, 0, "o script devia terminar com sucesso");

    const depois = await conta();
    assert.ok(depois);

    // 1) a senha nova vale
    assert.ok(await conferirSenha(SENHA_NOVA, depois.senhaHash), "a senha nova devia conferir");

    // 2) a anterior deixou de valer — o ponto da rotação
    assert.ok(
      !(await conferirSenha(SENHA_ANTIGA, depois.senhaHash)),
      "a senha anterior NÃO pode continuar valendo",
    );

    // 3) o hash mudou de fato
    assert.notEqual(depois.senhaHash, antes.senhaHash, "o hash devia ter sido substituído");

    // 4) nada além da senha foi tocado
    assert.equal(depois.id, antes.id, "devia ser a mesma linha, não uma recriação");
    assert.equal(depois.nome, antes.nome);
    assert.equal(depois.email, antes.email);
    assert.equal(depois.ativo, antes.ativo);

    // 5) nem senha nem hash aparecem na saída
    assert.ok(!saida.includes(SENHA_NOVA), "a senha não pode ser impressa");
    assert.ok(!saida.includes(SENHA_ANTIGA), "a senha anterior não pode ser impressa");
    assert.ok(!saida.includes(depois.senhaHash), "o hash não pode ser impresso");
  });
});

describe("troca de senha administrativa — usuário inexistente", () => {
  it("falha e não cria conta nenhuma", async () => {
    const { status } = rodarTroca(EMAIL_INEXISTENTE, SENHA_NOVA);
    assert.notEqual(status, 0, "e-mail desconhecido devia falhar");

    const fantasma = await prisma.usuario.findUnique({ where: { email: EMAIL_INEXISTENTE } });
    assert.equal(fantasma, null, "rotação de senha nunca pode criar usuário");
  });
});

describe("troca de senha administrativa — senha curta", () => {
  it("recusa senha abaixo do mínimo e não altera o hash", async () => {
    const antes = await conta();
    assert.ok(antes);

    const { status } = rodarTroca(EMAIL, "curta");
    assert.notEqual(status, 0, "senha abaixo do mínimo devia falhar");

    const depois = await conta();
    assert.ok(depois);
    assert.equal(depois.senhaHash, antes.senhaHash, "o hash não podia ter mudado");
  });
});
