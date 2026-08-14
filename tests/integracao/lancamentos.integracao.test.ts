import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { deDataCivil, paraDataCivil } from "@/lib/datas";
import { POR_PAGINA, decidirLancamentoParaCorretor } from "@/lib/validacao/lancamento";

/**
 * Integração de lançamentos contra o PostgreSQL **local**.
 *
 * Prefixo `__F23_TESTE_`. A limpeza respeita as FKs `Restrict`: lançamento
 * primeiro, depois corretor, depois equipe. As equipes do seed são só
 * referência — nada nelas é alterado.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__F23_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

let equipeA = "";
let equipeB = "";
let equipeInativa = "";
let corretorA = "";
let corretorInativo = "";
let corretorEmEquipeInativa = "";
let adminId = "";

before(async () => {
  await limpar(prisma);

  const doSeed = await prisma.equipe.findMany({
    where: { nome: { in: ["Equipe Suellen", "Equipe Lena"] } },
    orderBy: { ordemExibicao: "asc" },
    select: { id: true },
  });
  assert.equal(doSeed.length, 2);
  equipeA = doSeed[0].id;
  equipeB = doSeed[1].id;

  const admin = await prisma.usuario.findFirstOrThrow({ select: { id: true } });
  adminId = admin.id;

  equipeInativa = (
    await prisma.equipe.create({
      data: { nome: nome("EQUIPE_OFF"), gerenteNome: "G", ordemExibicao: 91, ativa: false },
    })
  ).id;

  corretorA = (
    await prisma.corretor.create({
      data: { nomeCompleto: nome("corretorA"), nomeExibicao: "A", equipeId: equipeA },
    })
  ).id;
  corretorInativo = (
    await prisma.corretor.create({
      data: { nomeCompleto: nome("inativo"), nomeExibicao: "Off", equipeId: equipeA, ativo: false },
    })
  ).id;
  corretorEmEquipeInativa = (
    await prisma.corretor.create({
      data: { nomeCompleto: nome("naEquipeOff"), nomeExibicao: "EqOff", equipeId: equipeInativa },
    })
  ).id;
});

after(async () => {
  await limpar(prisma);
  const restantes = await prisma.lancamento.count({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  console.log(`  fixtures de lancamento restantes: ${restantes}`);
  await prisma.$disconnect();
});

/** Cria um lançamento do jeito que a action cria: equipe vinda do corretor. */
async function lancar(
  corretorId: string,
  tipo: Parameters<typeof prisma.lancamento.create>[0]["data"]["tipo"],
  data: string,
  valor: string | null = null,
) {
  const corretor = await prisma.corretor.findUniqueOrThrow({
    where: { id: corretorId },
    select: { equipeId: true },
  });
  return prisma.lancamento.create({
    data: {
      tipo,
      corretorId,
      equipeId: corretor.equipeId,
      // Desde a E2B o CHECK exige status em toda proposta.
      ...(tipo === "PROPOSTA" ? { statusProposta: "AGUARDANDO" as const } : {}),
      dataReferencia: paraDataCivil(data),
      valor,
      criadoPor: adminId,
    },
  });
}

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string; usuario: string }[]
    >`SELECT current_database() AS db, current_user AS usuario`;
    assert.equal(linha.db, "casalouzada_test");
    assert.equal(linha.usuario, "casalouzada_test");
  });
});

describe("criação — valor e precisão", () => {
  it("VENDA guarda 1250000.00 sem perder centavo", async () => {
    const criado = await lancar(corretorA, "VENDA", "2026-08-10", "1250000.00");

    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
    // Comparação por string: um double não representaria isto exatamente.
    assert.equal(relido.valor?.toFixed(2), "1250000.00");
    assert.equal(relido.tipo, "VENDA");
  });

  it("guarda o topo de Decimal(14,2) exato", async () => {
    const criado = await lancar(corretorA, "VENDA", "2026-08-11", "999999999999.99");
    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.valor?.toFixed(2), "999999999999.99");
  });

  it("LOCACAO guarda o valor", async () => {
    const criado = await lancar(corretorA, "LOCACAO", "2026-08-12", "3500.00");
    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.valor?.toFixed(2), "3500.00");
  });

  it("tipos não monetários guardam valor null", async () => {
    for (const tipo of [
      "CAPTACAO_VENDA",
      "CAPTACAO_EXCLUSIVA",
      "CAPTACAO_LOCACAO",
      "PROPOSTA",
      "AVALIACAO_GOOGLE",
    ] as const) {
      const criado = await lancar(corretorA, tipo, "2026-08-13");
      const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
      assert.equal(relido.valor, null, tipo);
    }
  });

  it("dataReferencia faz round-trip civil", async () => {
    const criado = await lancar(corretorA, "PROPOSTA", "2024-02-29");
    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(deDataCivil(relido.dataReferencia), "2024-02-29");
  });
});

describe("equipe histórica e autoria", () => {
  it("grava a equipe atual do corretor no evento", async () => {
    const criado = await lancar(corretorA, "PROPOSTA", "2026-08-14");
    assert.equal(criado.equipeId, equipeA);
  });

  it("criadoPor aponta para o administrador de teste", async () => {
    const criado = await lancar(corretorA, "PROPOSTA", "2026-08-15");
    const relido = await prisma.lancamento.findUniqueOrThrow({
      where: { id: criado.id },
      select: { criadoPor: true, autor: { select: { id: true, email: true } } },
    });
    assert.equal(relido.criadoPor, adminId);
    assert.equal(relido.autor?.id, adminId);
  });

  it("mover o corretor de equipe não mexe no lançamento já criado", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("mudanca"), nomeExibicao: "Mud", equipeId: equipeA },
    });
    const criado = await lancar(corretor.id, "VENDA", "2026-08-16", "100000.00");
    assert.equal(criado.equipeId, equipeA);

    await prisma.corretor.update({ where: { id: corretor.id }, data: { equipeId: equipeB } });

    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.equipeId, equipeA);
    assert.notEqual(relido.equipeId, equipeB);
  });

  it("a listagem lê a equipe do evento, não a atual do corretor", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("listagem_hist"), nomeExibicao: "Hist", equipeId: equipeA },
    });
    const criado = await lancar(corretor.id, "PROPOSTA", "2026-08-17");
    await prisma.corretor.update({ where: { id: corretor.id }, data: { equipeId: equipeB } });

    // Exatamente o `select` da página de listagem.
    const linha = await prisma.lancamento.findUniqueOrThrow({
      where: { id: criado.id },
      select: {
        equipe: { select: { id: true, nome: true } },
        corretor: { select: { equipeId: true } },
      },
    });
    assert.equal(linha.equipe.id, equipeA, "a linha tem de mostrar a equipe do evento");
    assert.equal(linha.corretor.equipeId, equipeB, "e o corretor já está na outra");
  });
});

describe("captações independentes", () => {
  it("CAPTACAO_VENDA cria uma linha e não gera exclusividade", async () => {
    const antes = await prisma.lancamento.count({
      where: { corretorId: corretorA, tipo: "CAPTACAO_EXCLUSIVA" },
    });
    await lancar(corretorA, "CAPTACAO_VENDA", "2026-08-18");
    const depois = await prisma.lancamento.count({
      where: { corretorId: corretorA, tipo: "CAPTACAO_EXCLUSIVA" },
    });
    assert.equal(depois, antes, "captação de venda não pode criar exclusividade");
  });

  it("CAPTACAO_EXCLUSIVA cria uma linha distinta e não gera captação de venda", async () => {
    const antes = await prisma.lancamento.count({
      where: { corretorId: corretorA, tipo: "CAPTACAO_VENDA" },
    });
    const criado = await lancar(corretorA, "CAPTACAO_EXCLUSIVA", "2026-08-19");
    const depois = await prisma.lancamento.count({
      where: { corretorId: corretorA, tipo: "CAPTACAO_VENDA" },
    });
    assert.equal(depois, antes);
    assert.equal(criado.tipo, "CAPTACAO_EXCLUSIVA");
  });

  it("cada criação acrescenta exatamente uma linha", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("uma_linha"), nomeExibicao: "Um", equipeId: equipeA },
    });

    const contar = () => prisma.lancamento.count({ where: { corretorId: corretor.id } });
    assert.equal(await contar(), 0);

    await lancar(corretor.id, "PROPOSTA", "2026-08-20");
    assert.equal(await contar(), 1);

    await lancar(corretor.id, "CAPTACAO_VENDA", "2026-08-20");
    assert.equal(await contar(), 2);

    await lancar(corretor.id, "CAPTACAO_EXCLUSIVA", "2026-08-20");
    assert.equal(await contar(), 3);
  });
});

describe("quem pode receber lançamento", () => {
  it("corretor ativo em equipe ativa: permitido", async () => {
    const corretor = await prisma.corretor.findUniqueOrThrow({
      where: { id: corretorA },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });
    assert.deepEqual(decidirLancamentoParaCorretor(corretor), { ok: true, equipeId: equipeA });
  });

  it("corretor inativo: recusado", async () => {
    const corretor = await prisma.corretor.findUniqueOrThrow({
      where: { id: corretorInativo },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });
    const r = decidirLancamentoParaCorretor(corretor);
    assert.equal(r.ok === false && r.erro, "Este corretor está inativo.");
  });

  it("corretor ativo em equipe desativada: recusado, sem mexer em nada", async () => {
    const corretor = await prisma.corretor.findUniqueOrThrow({
      where: { id: corretorEmEquipeInativa },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });
    const r = decidirLancamentoParaCorretor(corretor);
    assert.equal(r.ok, false);

    // Nada foi alterado por conta própria.
    const depois = await prisma.corretor.findUniqueOrThrow({
      where: { id: corretorEmEquipeInativa },
      select: { equipeId: true, ativo: true },
    });
    assert.equal(depois.equipeId, equipeInativa);
    assert.equal(depois.ativo, true);
    const equipe = await prisma.equipe.findUniqueOrThrow({ where: { id: equipeInativa } });
    assert.equal(equipe.ativa, false);
  });
});

describe("filtros", () => {
  let corretorF = "";

  before(async () => {
    corretorF = (
      await prisma.corretor.create({
        data: { nomeCompleto: nome("filtros"), nomeExibicao: "Filtro", equipeId: equipeA },
      })
    ).id;

    await lancar(corretorF, "VENDA", "2026-01-10", "100000.00");
    await lancar(corretorF, "PROPOSTA", "2026-02-10");
    await lancar(corretorF, "PROPOSTA", "2026-03-10");
    // Este fica na equipe B, para o filtro de equipe separar.
    await prisma.corretor.update({ where: { id: corretorF }, data: { equipeId: equipeB } });
    await lancar(corretorF, "VENDA", "2026-04-10", "200000.00");
  });

  it("filtra por período", async () => {
    const encontrados = await prisma.lancamento.findMany({
      where: {
        corretorId: corretorF,
        dataReferencia: { gte: paraDataCivil("2026-02-01"), lte: paraDataCivil("2026-03-31") },
      },
      select: { dataReferencia: true },
      orderBy: { dataReferencia: "asc" },
    });
    assert.deepEqual(encontrados.map((l) => deDataCivil(l.dataReferencia)), [
      "2026-02-10",
      "2026-03-10",
    ]);
  });

  it("filtra por corretor", async () => {
    const total = await prisma.lancamento.count({ where: { corretorId: corretorF } });
    assert.equal(total, 4);
  });

  it("filtra por equipe do evento", async () => {
    const naA = await prisma.lancamento.count({ where: { corretorId: corretorF, equipeId: equipeA } });
    const naB = await prisma.lancamento.count({ where: { corretorId: corretorF, equipeId: equipeB } });
    // Três foram lançados enquanto ele estava na A; um depois de mudar.
    assert.equal(naA, 3);
    assert.equal(naB, 1);
  });

  it("filtra por tipo", async () => {
    const vendas = await prisma.lancamento.count({ where: { corretorId: corretorF, tipo: "VENDA" } });
    assert.equal(vendas, 2);
  });

  it("combina filtros", async () => {
    const combinado = await prisma.lancamento.findMany({
      where: {
        corretorId: corretorF,
        tipo: "VENDA",
        equipeId: equipeA,
        dataReferencia: { gte: paraDataCivil("2026-01-01"), lte: paraDataCivil("2026-12-31") },
      },
      select: { dataReferencia: true, valor: true },
    });
    assert.equal(combinado.length, 1);
    assert.equal(deDataCivil(combinado[0].dataReferencia), "2026-01-10");
    assert.equal(combinado[0].valor?.toFixed(2), "100000.00");
  });
});

describe("paginação", () => {
  let corretorP = "";
  const TOTAL = POR_PAGINA + 7;

  before(async () => {
    corretorP = (
      await prisma.corretor.create({
        data: { nomeCompleto: nome("paginacao"), nomeExibicao: "Pag", equipeId: equipeA },
      })
    ).id;

    // Datas distintas para a ordenação ser determinística. O status entra
    // porque desde a E2B o CHECK exige em toda proposta.
    await prisma.lancamento.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        tipo: "PROPOSTA" as const,
        corretorId: corretorP,
        equipeId: equipeA,
        dataReferencia: paraDataCivil(`2026-05-${String((i % 28) + 1).padStart(2, "0")}`),
        statusProposta: "AGUARDANDO" as const,
        criadoPor: adminId,
      })),
    });
  });

  it("conta o total com o mesmo filtro", async () => {
    assert.equal(await prisma.lancamento.count({ where: { corretorId: corretorP } }), TOTAL);
  });

  it("a primeira página traz 50", async () => {
    const primeira = await prisma.lancamento.findMany({
      where: { corretorId: corretorP },
      orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }],
      skip: 0,
      take: POR_PAGINA,
      select: { id: true },
    });
    assert.equal(primeira.length, POR_PAGINA);
  });

  it("a segunda traz o restante, sem repetir nenhum id", async () => {
    const consulta = (pagina: number) =>
      prisma.lancamento.findMany({
        where: { corretorId: corretorP },
        orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }, { id: "asc" }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: { id: true },
      });

    const primeira = await consulta(1);
    const segunda = await consulta(2);

    assert.equal(segunda.length, TOTAL - POR_PAGINA);

    const ids = new Set([...primeira, ...segunda].map((l) => l.id));
    assert.equal(ids.size, TOTAL, "nenhum id pode aparecer nas duas páginas");
  });
});
