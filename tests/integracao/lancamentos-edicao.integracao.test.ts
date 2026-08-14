import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { deDataCivil, paraDataCivil } from "@/lib/datas";
import { resolverEquipeDoLancamento } from "@/lib/lancamento-equipe";
import { decidirLancamentoParaCorretor } from "@/lib/validacao/lancamento";

/**
 * Edição e exclusão de lançamento contra o PostgreSQL **local**.
 *
 * Prefixo `__F24_TESTE_`. Limpeza na ordem lançamento → corretor → equipe, por
 * causa das FKs `Restrict`.
 *
 * Os testes reproduzem o caminho da action: resolvem a equipe pela função pura
 * sobre o que o banco diz **no momento**, e só então gravam.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__F24_TESTE_";
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
let equipeC = "";
let equipeInativa = "";
let adminId = "";

before(async () => {
  await limpar(prisma);

  const doSeed = await prisma.equipe.findMany({
    where: { nome: { in: ["Equipe Suellen", "Equipe Lena", "Equipe Fernanda L."] } },
    orderBy: { ordemExibicao: "asc" },
    select: { id: true },
  });
  assert.equal(doSeed.length, 3);
  [equipeA, equipeB, equipeC] = doSeed.map((e) => e.id);

  adminId = (await prisma.usuario.findFirstOrThrow({ select: { id: true } })).id;

  equipeInativa = (
    await prisma.equipe.create({
      data: { nome: nome("EQ_OFF"), gerenteNome: "G", ordemExibicao: 92, ativa: false },
    })
  ).id;
});

after(async () => {
  await limpar(prisma);
  const restantes = await prisma.lancamento.count({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  console.log(`  fixtures de edicao restantes: ${restantes}`);
  await prisma.$disconnect();
});

async function criarCorretor(sufixo: string, equipeId: string, ativo = true) {
  return prisma.corretor.create({
    data: { nomeCompleto: nome(sufixo), nomeExibicao: sufixo, equipeId, ativo },
  });
}

async function criarLancamento(
  corretorId: string,
  equipeId: string,
  tipo: "LOCACAO" | "PROPOSTA" | "CAPTACAO_LOCACAO" = "PROPOSTA",
  valor: string | null = null,
  data = "2026-08-10",
) {
  return prisma.lancamento.create({
    data: {
      tipo,
      corretorId,
      equipeId,
      dataReferencia: paraDataCivil(data),
      valor,
      // Desde a E2B o CHECK exige status em toda proposta.
      ...(tipo === "PROPOSTA" ? { statusProposta: "AGUARDANDO" as const } : {}),
      criadoPor: adminId,
    },
  });
}

/** Reproduz o miolo da action: resolve e, se resolver, grava. */
async function editar(
  id: string,
  corretorIdNovo: string,
  escolha: string | null,
  extras: { tipo?: "LOCACAO" | "PROPOSTA" | "CAPTACAO_LOCACAO"; valor?: string | null; data?: string } = {},
) {
  const atual = await prisma.lancamento.findUniqueOrThrow({
    where: { id },
    select: { corretorId: true, equipeId: true, tipo: true },
  });

  const novo = await prisma.corretor.findUnique({
    where: { id: corretorIdNovo },
    select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
  });

  if (corretorIdNovo !== atual.corretorId) {
    const permitido = decidirLancamentoParaCorretor(novo);
    if (!permitido.ok) return { gravou: false as const, motivo: permitido.erro };
  }

  // Esta suíte só exercita tipos de participante único, onde os dois campos
  // são obrigatórios; venda credita por participação e tem suíte própria.
  const corretorIdAnterior = atual.corretorId as string;
  const equipeIdArmazenada = atual.equipeId as string;

  const resolucao = resolverEquipeDoLancamento({
    corretorIdAnterior,
    equipeIdArmazenada,
    corretorIdNovo,
    equipeAtualDoNovoCorretor: novo?.equipeId ?? equipeIdArmazenada,
    escolha,
  });
  if (!resolucao.ok) return { gravou: false as const, motivo: resolucao.erro };

  const tipo = extras.tipo ?? atual.tipo;
  const monetario = tipo === "LOCACAO";

  await prisma.lancamento.update({
    where: { id },
    data: {
      tipo,
      corretorId: corretorIdNovo,
      equipeId: resolucao.equipeId,
      valor: monetario ? (extras.valor ?? null) : null,
      // Como a action real: PROPOSTA exige status; outro tipo zera os campos
      // de proposta (CHECK da E2B).
      statusProposta: tipo === "PROPOSTA" ? "AGUARDANDO" : null,
      valorProposta: null,
      ...(extras.data ? { dataReferencia: paraDataCivil(extras.data) } : {}),
    },
  });
  return { gravou: true as const, equipeId: resolucao.equipeId };
}

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string }[]
    >`SELECT current_database() AS db`;
    assert.equal(linha.db, "casalouzada_test");
  });
});

describe("edição sem troca de corretor — equipe intocada", () => {
  it("editar só o valor mantém equipeId", async () => {
    const c = await criarCorretor("valor", equipeA);
    const l = await criarLancamento(c.id, equipeA, "LOCACAO", "100000.00");

    await prisma.lancamento.update({ where: { id: l.id }, data: { valor: "250000.00" } });

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.equipeId, equipeA);
    assert.equal(depois.valor?.toFixed(2), "250000.00");
  });

  it("editar a data mantém equipeId, mesmo com o corretor já em outra equipe", async () => {
    const c = await criarCorretor("data", equipeA);
    const l = await criarLancamento(c.id, equipeA, "PROPOSTA", null, "2026-01-05");

    // O corretor muda de equipe; a edição seguinte não é sobre isso.
    await prisma.corretor.update({ where: { id: c.id }, data: { equipeId: equipeB } });

    const r = await editar(l.id, c.id, null, { data: "2026-02-05" });
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.equipeId, equipeA, "o histórico não pode seguir o corretor");
    assert.equal(deDataCivil(depois.dataReferencia), "2026-02-05");
  });

  it("editar a observação mantém equipeId", async () => {
    const c = await criarCorretor("obs", equipeA);
    const l = await criarLancamento(c.id, equipeA);

    await prisma.lancamento.update({ where: { id: l.id }, data: { observacao: "corrigida" } });

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.equipeId, equipeA);
    assert.equal(depois.observacao, "corrigida");
  });
});

describe("troca de corretor", () => {
  it("para corretor da MESMA equipe: preserva sem pedir escolha", async () => {
    const c1 = await criarCorretor("mesma1", equipeA);
    const c2 = await criarCorretor("mesma2", equipeA);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, null);
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c2.id);
    assert.equal(depois.equipeId, equipeA);
  });

  it("para corretor de OUTRA equipe sem escolha: não grava", async () => {
    const c1 = await criarCorretor("semEsc1", equipeA);
    const c2 = await criarCorretor("semEsc2", equipeB);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, null);
    assert.equal(r.gravou, false);
    assert.equal(r.gravou === false && r.motivo, "ESCOLHA_OBRIGATORIA");

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c1.id, "nada pode ter sido alterado");
    assert.equal(depois.equipeId, equipeA);
  });

  it("PRESERVAR: corretor muda, equipe histórica fica", async () => {
    const c1 = await criarCorretor("pres1", equipeA);
    const c2 = await criarCorretor("pres2", equipeB);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, "PRESERVAR");
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c2.id);
    assert.equal(depois.equipeId, equipeA);
  });

  it("CORRIGIR: corretor muda e a equipe passa a ser a atual do novo", async () => {
    const c1 = await criarCorretor("corr1", equipeA);
    const c2 = await criarCorretor("corr2", equipeB);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, "CORRIGIR");
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c2.id);
    assert.equal(depois.equipeId, equipeB);
  });

  it("escolha inválida: nada é alterado", async () => {
    const c1 = await criarCorretor("inval1", equipeA);
    const c2 = await criarCorretor("inval2", equipeB);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, "TERCEIRA");
    assert.equal(r.gravou, false);
    assert.equal(r.gravou === false && r.motivo, "ESCOLHA_INVALIDA");

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c1.id);
    assert.equal(depois.equipeId, equipeA);
  });
});

describe("ESCOLHA OBSOLETA — hidden do browser não é autoridade", () => {
  it("recusa a escolha quando a equipe do novo corretor mudou no meio do caminho", async () => {
    const c1 = await criarCorretor("obs_orig", equipeA);
    const c2 = await criarCorretor("obs_novo", equipeB);
    const l = await criarLancamento(c1.id, equipeA);

    // 1–3. O sistema apresentaria o conflito A vs B.
    const apresentada = (
      await prisma.corretor.findUniqueOrThrow({ where: { id: c2.id }, select: { equipeId: true } })
    ).equipeId;
    assert.equal(apresentada, equipeB);

    // 4. Antes da confirmação, o corretor novo vai para C.
    await prisma.corretor.update({ where: { id: c2.id }, data: { equipeId: equipeC } });

    // 5. Chega a escolha baseada em A vs B.
    const agora = await prisma.corretor.findUniqueOrThrow({
      where: { id: c2.id },
      select: { equipeId: true },
    });
    const obsoleta = apresentada !== agora.equipeId;
    assert.equal(obsoleta, true, "a situação mudou desde a pergunta");

    // A action descarta a escolha antiga: passa `null` ao resolvedor.
    const resolucao = resolverEquipeDoLancamento({
      corretorIdAnterior: c1.id,
      equipeIdArmazenada: equipeA,
      corretorIdNovo: c2.id,
      equipeAtualDoNovoCorretor: agora.equipeId,
      escolha: obsoleta ? null : "CORRIGIR",
    });
    assert.equal(resolucao.ok, false);
    assert.equal(resolucao.ok === false && resolucao.erro, "ESCOLHA_OBRIGATORIA");

    // Nenhum UPDATE aconteceu.
    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c1.id);
    assert.equal(depois.equipeId, equipeA);

    // E a nova pergunta seria A vs C, não A vs B.
    assert.equal(agora.equipeId, equipeC);
  });
});

describe("troca de tipo descarta valor", () => {
  it("LOCACAO → PROPOSTA zera o valor", async () => {
    const c = await criarCorretor("vp", equipeA);
    const l = await criarLancamento(c.id, equipeA, "LOCACAO", "500000.00");
    assert.equal(l.valor?.toFixed(2), "500000.00");

    const r = await editar(l.id, c.id, null, { tipo: "PROPOSTA" });
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.tipo, "PROPOSTA");
    assert.equal(depois.valor, null);
  });

  it("LOCACAO → CAPTACAO_LOCACAO zera o valor", async () => {
    const c = await criarCorretor("lc", equipeA);
    const l = await criarLancamento(c.id, equipeA, "LOCACAO", "3500.00");

    await prisma.lancamento.update({
      where: { id: l.id },
      data: { tipo: "CAPTACAO_LOCACAO", valor: null },
    });

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.tipo, "CAPTACAO_LOCACAO");
    assert.equal(depois.valor, null);
  });
});

describe("autoria e corretor inativo", () => {
  it("criadoPor não muda durante a edição", async () => {
    const c = await criarCorretor("autoria", equipeA);
    const l = await criarLancamento(c.id, equipeA);
    assert.equal(l.criadoPor, adminId);

    await editar(l.id, c.id, null, { data: "2026-09-09" });

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.criadoPor, adminId, "a autoria é de quem registrou o evento");
  });

  it("lançamento de corretor inativado continua editável", async () => {
    const c = await criarCorretor("exCorretor", equipeA);
    const l = await criarLancamento(c.id, equipeA, "PROPOSTA", null, "2026-03-01");

    await prisma.corretor.update({ where: { id: c.id }, data: { ativo: false } });

    // Sem troca de corretor, o original não é reconsultado — e deve funcionar.
    const r = await editar(l.id, c.id, null, { data: "2026-03-02" });
    assert.equal(r.gravou, true);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(deDataCivil(depois.dataReferencia), "2026-03-02");
    assert.equal(depois.equipeId, equipeA);
  });

  it("trocar para corretor inativo é recusado", async () => {
    const c1 = await criarCorretor("destOrig", equipeA);
    const c2 = await criarCorretor("destOff", equipeB, false);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, "CORRIGIR");
    assert.equal(r.gravou, false);
    assert.match(r.gravou === false ? r.motivo : "", /inativo/i);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c1.id);
  });

  it("trocar para corretor ativo em equipe inativa é recusado", async () => {
    const c1 = await criarCorretor("eqOrig", equipeA);
    const c2 = await criarCorretor("eqOff", equipeInativa);
    const l = await criarLancamento(c1.id, equipeA);

    const r = await editar(l.id, c2.id, "CORRIGIR");
    assert.equal(r.gravou, false);
    assert.match(r.gravou === false ? r.motivo : "", /equipe atual deste corretor está desativada/i);

    const depois = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(depois.corretorId, c1.id);
    assert.equal(depois.equipeId, equipeA);
  });
});

describe("exclusão — hard delete de uma linha", () => {
  it("remove exatamente o lançamento escolhido e nada mais", async () => {
    const c = await criarCorretor("del", equipeA);
    const x = await criarLancamento(c.id, equipeA, "LOCACAO", "700000.00", "2026-04-01");
    const y = await criarLancamento(c.id, equipeA, "PROPOSTA", null, "2026-04-02");

    // Asserções por identidade, não por contagem global: as suítes de
    // integração rodam em paralelo no mesmo banco, e um total geral mediria
    // também o que as outras estão criando.
    await prisma.lancamento.delete({ where: { id: x.id } });

    assert.equal(await prisma.lancamento.findUnique({ where: { id: x.id } }), null, "X sai");
    assert.ok(await prisma.lancamento.findUnique({ where: { id: y.id } }), "Y fica");
    assert.ok(await prisma.corretor.findUnique({ where: { id: c.id } }), "corretor fica");
    assert.ok(await prisma.equipe.findUnique({ where: { id: equipeA } }), "equipe fica");
  });

  it("excluir não é soft delete — a linha some da contagem", async () => {
    const c = await criarCorretor("delcount", equipeA);
    const l = await criarLancamento(c.id, equipeA);

    const antes = await prisma.lancamento.count({ where: { corretorId: c.id } });
    await prisma.lancamento.delete({ where: { id: l.id } });
    const depois = await prisma.lancamento.count({ where: { corretorId: c.id } });

    assert.equal(depois, antes - 1);
  });
});
