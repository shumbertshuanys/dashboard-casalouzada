import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { deDataCivil, paraDataCivil } from "@/lib/datas";
import { ehTipoDuplicado } from "@/lib/validacao/saldo-historico";

/**
 * Saldo histórico contra o PostgreSQL **local**.
 *
 * Diferente das outras suítes, aqui não dá para usar prefixo em nome: o
 * registro é identificado pelo próprio tipo, e só existe um por tipo. Por isso
 * a limpeza é pelos dois tipos suportados — no banco local, onde nenhum saldo
 * real existe. O seed não cria saldo nenhum, e as outras suítes não tocam
 * nesta tabela.
 */

const prisma = criarPrismaTeste();
const TIPOS = ["VENDA", "AVALIACAO_GOOGLE"] as const;

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.saldoHistorico.deleteMany({ where: { tipo: { in: [...TIPOS] } } });
}

before(async () => {
  await limpar(prisma);
});

after(async () => {
  await limpar(prisma);
  const restantes = await prisma.saldoHistorico.count();
  console.log(`  saldos historicos restantes: ${restantes}`);
  await prisma.$disconnect();
});

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    assert.equal(linha.db, "casalouzada_test");
  });

  it("a migration da unicidade está aplicada", async () => {
    const migrations = await prisma.$queryRaw<
      { migration_name: string }[]
    >`SELECT migration_name FROM _prisma_migrations ORDER BY finished_at`;
    assert.equal(migrations.length, 2);
    assert.match(migrations[1].migration_name, /saldo_historico_tipo_unico/);
  });

  it("existe índice único sobre tipo", async () => {
    const indices = await prisma.$queryRaw<
      { indexname: string; indexdef: string }[]
    >`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'saldo_historico'`;
    const unico = indices.find((i) => i.indexdef.includes("UNIQUE") && i.indexdef.includes("tipo"));
    assert.ok(unico, "a coluna tipo precisa ter índice único");
  });
});

describe("VENDA", () => {
  it("faz round-trip de quantidade, valor, data e descrição", async () => {
    const criado = await prisma.saldoHistorico.create({
      data: {
        tipo: "VENDA",
        quantidade: 125,
        valorTotal: "1250000.00",
        dataCorte: paraDataCivil("2026-08-12"),
        descricao: "acumulado até a virada",
      },
    });

    const relido = await prisma.saldoHistorico.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.quantidade, 125);
    // Comparação por string: um double não representaria isto exatamente.
    assert.equal(relido.valorTotal.toFixed(2), "1250000.00");
    assert.equal(deDataCivil(relido.dataCorte), "2026-08-12");
    assert.equal(relido.descricao, "acumulado até a virada");
  });

  it("o banco recusa um segundo saldo de VENDA", async () => {
    // A prova é estrutural: quem barra é a constraint, não código nosso.
    await assert.rejects(
      () =>
        prisma.saldoHistorico.create({
          data: {
            tipo: "VENDA",
            quantidade: 1,
            valorTotal: "1.00",
            dataCorte: paraDataCivil("2026-01-01"),
          },
        }),
      (erro: unknown) => {
        assert.equal(ehTipoDuplicado(erro), true);
        return true;
      },
    );
  });

  it("guarda o topo de Decimal(14,2) exato", async () => {
    const atual = await prisma.saldoHistorico.findUniqueOrThrow({ where: { tipo: "VENDA" } });
    const editado = await prisma.saldoHistorico.update({
      where: { id: atual.id },
      data: { valorTotal: "999999999999.99" },
    });
    assert.equal(editado.valorTotal.toFixed(2), "999999999999.99");

    await prisma.saldoHistorico.update({
      where: { id: atual.id },
      data: { valorTotal: "1250000.00" },
    });
  });
});

describe("AVALIACAO_GOOGLE", () => {
  it("guarda quantidade com valor zero", async () => {
    const criado = await prisma.saldoHistorico.create({
      data: {
        tipo: "AVALIACAO_GOOGLE",
        quantidade: 480,
        valorTotal: "0.00",
        dataCorte: paraDataCivil("2026-08-12"),
      },
    });

    const relido = await prisma.saldoHistorico.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.quantidade, 480);
    assert.equal(relido.valorTotal.toFixed(2), "0.00");
    assert.equal(relido.descricao, null);
  });

  it("o banco recusa um segundo saldo de AVALIACAO_GOOGLE", async () => {
    await assert.rejects(
      () =>
        prisma.saldoHistorico.create({
          data: {
            tipo: "AVALIACAO_GOOGLE",
            quantidade: 9,
            valorTotal: "0.00",
            dataCorte: paraDataCivil("2026-01-01"),
          },
        }),
      (erro: unknown) => ehTipoDuplicado(erro),
    );
  });
});

describe("unicidade sob concorrência", () => {
  it("duas inserções simultâneas do mesmo tipo: no máximo uma vence", async () => {
    // `LOCACAO` não é tipo suportado pela UI, mas serve para exercitar a
    // constraint sem colidir com as fixtures dos dois tipos reais.
    await prisma.saldoHistorico.deleteMany({ where: { tipo: "LOCACAO" } });

    const tentativa = () =>
      prisma.saldoHistorico.create({
        data: {
          tipo: "LOCACAO",
          quantidade: 1,
          valorTotal: "1.00",
          dataCorte: paraDataCivil("2026-01-01"),
        },
      });

    const resultados = await Promise.allSettled([tentativa(), tentativa()]);
    const vitorias = resultados.filter((r) => r.status === "fulfilled").length;
    const recusas = resultados.filter((r) => r.status === "rejected");

    assert.equal(vitorias, 1, "só uma inserção pode vencer");
    assert.equal(recusas.length, 1);
    assert.equal(
      ehTipoDuplicado((recusas[0] as PromiseRejectedResult).reason),
      true,
      "a recusa tem de vir da unicidade",
    );

    await prisma.saldoHistorico.deleteMany({ where: { tipo: "LOCACAO" } });
  });
});

describe("edição", () => {
  it("altera quantidade, valor, data e descrição da VENDA", async () => {
    const atual = await prisma.saldoHistorico.findUniqueOrThrow({ where: { tipo: "VENDA" } });

    const editado = await prisma.saldoHistorico.update({
      where: { id: atual.id },
      data: {
        quantidade: 200,
        valorTotal: "2000000.50",
        dataCorte: paraDataCivil("2026-09-30"),
        descricao: "revisado",
      },
    });

    assert.equal(editado.quantidade, 200);
    assert.equal(editado.valorTotal.toFixed(2), "2000000.50");
    assert.equal(deDataCivil(editado.dataCorte), "2026-09-30");
    assert.equal(editado.descricao, "revisado");
    assert.equal(editado.tipo, "VENDA", "o tipo não muda");
  });

  it("altera a quantidade da avaliação mantendo o valor zerado", async () => {
    const atual = await prisma.saldoHistorico.findUniqueOrThrow({
      where: { tipo: "AVALIACAO_GOOGLE" },
    });

    const editado = await prisma.saldoHistorico.update({
      where: { id: atual.id },
      data: { quantidade: 512, valorTotal: "0.00" },
    });

    assert.equal(editado.quantidade, 512);
    assert.equal(editado.valorTotal.toFixed(2), "0.00");
    assert.equal(editado.tipo, "AVALIACAO_GOOGLE");
  });

  it("o tipo permanece o mesmo depois de várias edições", async () => {
    const antes = await prisma.saldoHistorico.findMany({
      where: { tipo: { in: [...TIPOS] } },
      select: { id: true, tipo: true },
      orderBy: { tipo: "asc" },
    });

    for (const saldo of antes) {
      await prisma.saldoHistorico.update({
        where: { id: saldo.id },
        data: { descricao: "toque" },
      });
    }

    const depois = await prisma.saldoHistorico.findMany({
      where: { id: { in: antes.map((s) => s.id) } },
      select: { id: true, tipo: true },
      orderBy: { tipo: "asc" },
    });
    assert.deepEqual(depois, antes);
  });
});

describe("exclusão individual", () => {
  it("remover VENDA não afeta AVALIACAO_GOOGLE", async () => {
    const venda = await prisma.saldoHistorico.findUniqueOrThrow({ where: { tipo: "VENDA" } });

    await prisma.saldoHistorico.delete({ where: { id: venda.id } });

    assert.equal(
      await prisma.saldoHistorico.findUnique({ where: { tipo: "VENDA" } }),
      null,
      "VENDA sai",
    );
    assert.ok(
      await prisma.saldoHistorico.findUnique({ where: { tipo: "AVALIACAO_GOOGLE" } }),
      "avaliação fica",
    );
  });

  it("remover AVALIACAO_GOOGLE deixa os dois tipos ausentes", async () => {
    const google = await prisma.saldoHistorico.findUniqueOrThrow({
      where: { tipo: "AVALIACAO_GOOGLE" },
    });

    await prisma.saldoHistorico.delete({ where: { id: google.id } });

    const restantes = await prisma.saldoHistorico.findMany({
      where: { tipo: { in: [...TIPOS] } },
    });
    assert.equal(restantes.length, 0);
  });

  it("depois de excluir, o tipo pode ser cadastrado de novo", async () => {
    // Ausência é ausência: nada impede recadastrar.
    const novo = await prisma.saldoHistorico.create({
      data: {
        tipo: "VENDA",
        quantidade: 7,
        valorTotal: "7.00",
        dataCorte: paraDataCivil("2026-08-12"),
      },
    });
    assert.equal(novo.tipo, "VENDA");

    await prisma.saldoHistorico.delete({ where: { id: novo.id } });
    assert.equal(await prisma.saldoHistorico.findUnique({ where: { tipo: "VENDA" } }), null);
  });
});

describe("ausência", () => {
  it("nenhum saldo é criado automaticamente", async () => {
    // Nada no seed nem no código cria linha zerada.
    const total = await prisma.saldoHistorico.count({ where: { tipo: { in: [...TIPOS] } } });
    assert.equal(total, 0);
  });
});
