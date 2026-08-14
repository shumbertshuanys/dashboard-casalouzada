import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { deDataCivil, paraDataCivil } from "@/lib/datas";
import { decidirEquipeDoCorretor } from "@/lib/validacao/corretor";

/**
 * Integração de corretores contra o PostgreSQL **local**.
 *
 * Prefixo próprio, `__F22_TESTE_`, para a limpeza não colidir com a da F2.1.
 * As três equipes do seed são apenas **referenciadas** — nenhuma é criada,
 * renomeada ou apagada aqui.
 *
 * A ordem da limpeza importa: lançamento antes de corretor, e corretor antes
 * de equipe, porque as FKs são `Restrict`.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__F22_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

/** Duas equipes ativas do seed, usadas como origem e destino das transferências. */
let equipeA = "";
let equipeB = "";
/** Equipe fictícia local, desativada — o seed nunca é desativado. */
let equipeInativa = "";

before(async () => {
  await limpar(prisma);

  const doSeed = await prisma.equipe.findMany({
    where: { nome: { in: ["Equipe Suellen", "Equipe Lena"] } },
    orderBy: { ordemExibicao: "asc" },
    select: { id: true },
  });
  assert.equal(doSeed.length, 2, "o seed local precisa ter as equipes de referência");
  equipeA = doSeed[0].id;
  equipeB = doSeed[1].id;

  const inativa = await prisma.equipe.create({
    data: { nome: nome("EQUIPE_INATIVA"), gerenteNome: "Gerente", ordemExibicao: 90, ativa: false },
  });
  equipeInativa = inativa.id;
});

after(async () => {
  await limpar(prisma);
  const restantes = await prisma.corretor.count({
    where: { nomeCompleto: { startsWith: PREFIXO } },
  });
  console.log(`  fixtures de corretor restantes: ${restantes}`);
  await prisma.$disconnect();
});

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string; usuario: string }[]
    >`SELECT current_database() AS db, current_user AS usuario`;
    assert.equal(linha.db, "casalouzada_test");
    assert.equal(linha.usuario, "casalouzada_test");
  });

  it("as três equipes do seed continuam intactas", async () => {
    const doSeed = await prisma.equipe.findMany({
      where: { nome: { in: ["Equipe Suellen", "Equipe Lena", "Equipe Fernanda L."] } },
      select: { ativa: true },
    });
    assert.equal(doSeed.length, 3);
    assert.ok(doSeed.every((e) => e.ativa), "o seed não pode ter sido desativado");
  });
});

describe("corretor — criação e round-trip", () => {
  it("cria em equipe ativa com os defaults", async () => {
    const criado = await prisma.corretor.create({
      data: { nomeCompleto: nome("criar"), nomeExibicao: "Criar", equipeId: equipeA },
    });
    assert.equal(criado.nomeExibicao, "Criar");
    assert.equal(criado.equipeId, equipeA);
    assert.equal(criado.ativo, true);
    assert.equal(criado.creci, null);
    assert.equal(criado.fotoUrl, null);
    assert.equal(criado.dataEntrada, null);
  });

  it("faz round-trip de todos os campos, inclusive a data civil", async () => {
    const dataEntrada = paraDataCivil("2024-02-29");
    const criado = await prisma.corretor.create({
      data: {
        nomeCompleto: nome("roundtrip"),
        nomeExibicao: "Round Trip",
        creci: "CRECI-SP 123456-F",
        fotoUrl: "https://exemplo.test/foto.jpg",
        equipeId: equipeA,
        dataEntrada,
      },
    });

    const relido = await prisma.corretor.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.nomeCompleto, nome("roundtrip"));
    assert.equal(relido.nomeExibicao, "Round Trip");
    assert.equal(relido.creci, "CRECI-SP 123456-F");
    assert.equal(relido.fotoUrl, "https://exemplo.test/foto.jpg");
    // O dia tem de voltar igual: `@db.Date` não guarda hora, e o fuso da
    // máquina não pode deslocar a data.
    assert.equal(deDataCivil(relido.dataEntrada!), "2024-02-29");
  });

  it("aceita opcionais nulos e depois preenchidos", async () => {
    const criado = await prisma.corretor.create({
      data: { nomeCompleto: nome("opcionais"), nomeExibicao: "Opc", equipeId: equipeA },
    });
    assert.equal(criado.creci, null);

    const atualizado = await prisma.corretor.update({
      where: { id: criado.id },
      data: { creci: "12345", fotoUrl: "https://exemplo.test/f.png" },
    });
    assert.equal(atualizado.creci, "12345");
    assert.equal(atualizado.fotoUrl, "https://exemplo.test/f.png");
  });
});

describe("corretor — edição e estado", () => {
  it("edita os textos", async () => {
    const criado = await prisma.corretor.create({
      data: { nomeCompleto: nome("editar"), nomeExibicao: "Antes", equipeId: equipeA },
    });

    const editado = await prisma.corretor.update({
      where: { id: criado.id },
      data: { nomeCompleto: nome("editado"), nomeExibicao: "Depois", creci: "999" },
    });

    assert.equal(editado.nomeCompleto, nome("editado"));
    assert.equal(editado.nomeExibicao, "Depois");
    assert.equal(editado.creci, "999");
    // Nada mais mudou.
    assert.equal(editado.equipeId, equipeA);
    assert.equal(editado.ativo, true);
  });

  it("inativa e reativa mexendo só em ativo", async () => {
    const criado = await prisma.corretor.create({
      data: { nomeCompleto: nome("estado"), nomeExibicao: "Estado", equipeId: equipeA },
    });

    const inativo = await prisma.corretor.update({
      where: { id: criado.id },
      data: { ativo: false },
    });
    assert.equal(inativo.ativo, false);
    assert.equal(inativo.equipeId, criado.equipeId);
    assert.equal(inativo.nomeExibicao, criado.nomeExibicao);

    const reativado = await prisma.corretor.update({
      where: { id: criado.id },
      data: { ativo: true },
    });
    assert.equal(reativado.ativo, true);
  });

  it("troca a equipe do corretor", async () => {
    const criado = await prisma.corretor.create({
      data: { nomeCompleto: nome("trocar"), nomeExibicao: "Trocar", equipeId: equipeA },
    });

    const trocado = await prisma.corretor.update({
      where: { id: criado.id },
      data: { equipeId: equipeB },
    });
    assert.equal(trocado.equipeId, equipeB);
  });
});

describe("INVARIANTE — trocar de equipe não reescreve histórico", () => {
  it("o lançamento continua creditado à equipe do momento do fato", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("historico"), nomeExibicao: "Histórico", equipeId: equipeA },
    });

    // PROPOSTA não exige valor; a data é civil, como manda o schema. Desde a
    // E2B o CHECK exige status em toda proposta.
    const lancamento = await prisma.lancamento.create({
      data: {
        tipo: "PROPOSTA",
        corretorId: corretor.id,
        equipeId: equipeA,
        dataReferencia: paraDataCivil("2026-08-10"),
        statusProposta: "AGUARDANDO",
      },
    });
    assert.equal(lancamento.equipeId, equipeA);

    // A troca de equipe do corretor — exatamente o que a action faz.
    await prisma.corretor.update({ where: { id: corretor.id }, data: { equipeId: equipeB } });

    const relido = await prisma.lancamento.findUniqueOrThrow({ where: { id: lancamento.id } });
    assert.equal(
      relido.equipeId,
      equipeA,
      "o lançamento não pode migrar junto com o corretor",
    );
    assert.notEqual(relido.equipeId, equipeB);

    // E o corretor de fato mudou de lotação.
    const corretorRelido = await prisma.corretor.findUniqueOrThrow({ where: { id: corretor.id } });
    assert.equal(corretorRelido.equipeId, equipeB);
  });

  it("nenhum lançamento da equipe de origem foi tocado em massa", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("massa"), nomeExibicao: "Massa", equipeId: equipeA },
    });

    await prisma.lancamento.createMany({
      data: [
        {
          tipo: "PROPOSTA",
          corretorId: corretor.id,
          equipeId: equipeA,
          dataReferencia: paraDataCivil("2026-07-01"),
          statusProposta: "AGUARDANDO",
        },
        {
          tipo: "AVALIACAO_GOOGLE",
          corretorId: corretor.id,
          equipeId: equipeA,
          dataReferencia: paraDataCivil("2026-07-02"),
        },
      ],
    });

    const antes = await prisma.lancamento.findMany({
      where: { corretorId: corretor.id },
      select: { id: true, equipeId: true, atualizadoEm: true },
      orderBy: { dataReferencia: "asc" },
    });

    await prisma.corretor.update({ where: { id: corretor.id }, data: { equipeId: equipeB } });

    const depois = await prisma.lancamento.findMany({
      where: { corretorId: corretor.id },
      select: { id: true, equipeId: true, atualizadoEm: true },
      orderBy: { dataReferencia: "asc" },
    });

    assert.deepEqual(
      depois.map((l) => l.equipeId),
      [equipeA, equipeA],
    );
    // `atualizadoEm` intacto prova que nenhum UPDATE passou por eles.
    assert.deepEqual(
      depois.map((l) => l.atualizadoEm.toISOString()),
      antes.map((l) => l.atualizadoEm.toISOString()),
    );
  });
});

describe("equipe inativa — regra de domínio contra o banco", () => {
  it("a equipe fictícia de teste existe e está inativa", async () => {
    const equipe = await prisma.equipe.findUniqueOrThrow({ where: { id: equipeInativa } });
    assert.equal(equipe.ativa, false);
    assert.ok(equipe.nome.startsWith(PREFIXO));
  });

  it("criação: equipe inativa não é destino válido", async () => {
    const destino = await prisma.equipe.findUnique({
      where: { id: equipeInativa },
      select: { id: true, ativa: true },
    });
    const decisao = decidirEquipeDoCorretor(equipeInativa, null, destino);
    assert.equal(decisao.ok, false);
  });

  it("edição: quem já está na equipe inativa continua editável sem trocar", async () => {
    // O corretor é criado direto na equipe inativa — situação real de quem
    // ficou para trás quando a equipe foi encerrada.
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("na_inativa"), nomeExibicao: "Preso", equipeId: equipeInativa },
    });

    const destino = await prisma.equipe.findUnique({
      where: { id: equipeInativa },
      select: { id: true, ativa: true },
    });
    const decisao = decidirEquipeDoCorretor(equipeInativa, corretor.equipeId, destino);
    assert.deepEqual(decisao, { ok: true });

    // E a edição de fato passa no banco.
    const editado = await prisma.corretor.update({
      where: { id: corretor.id },
      data: { creci: "555", dataEntrada: paraDataCivil("2026-01-15") },
    });
    assert.equal(editado.creci, "555");
    assert.equal(deDataCivil(editado.dataEntrada!), "2026-01-15");
    assert.equal(editado.equipeId, equipeInativa);
  });

  it("transferência: outro corretor não pode ir para a equipe inativa", async () => {
    const corretor = await prisma.corretor.create({
      data: { nomeCompleto: nome("transferir"), nomeExibicao: "Transf", equipeId: equipeA },
    });

    const destino = await prisma.equipe.findUnique({
      where: { id: equipeInativa },
      select: { id: true, ativa: true },
    });
    const decisao = decidirEquipeDoCorretor(equipeInativa, corretor.equipeId, destino);
    assert.equal(decisao.ok, false);
    assert.match(decisao.ok === false ? decisao.erro : "", /transferir/i);
  });
});

describe("listagem — filtros e ordenação", () => {
  it("filtra por equipe e por situação, e ordena por nome de exibição", async () => {
    await prisma.corretor.createMany({
      data: [
        { nomeCompleto: nome("lista_c"), nomeExibicao: "Carlos", equipeId: equipeA },
        { nomeCompleto: nome("lista_a"), nomeExibicao: "Ana", equipeId: equipeA },
        { nomeCompleto: nome("lista_b"), nomeExibicao: "Bruno", equipeId: equipeA, ativo: false },
        { nomeCompleto: nome("lista_d"), nomeExibicao: "Diego", equipeId: equipeB },
      ],
    });

    const daEquipeA = await prisma.corretor.findMany({
      where: { equipeId: equipeA, nomeCompleto: { startsWith: `${PREFIXO}lista_` } },
      orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
      select: { nomeExibicao: true },
    });
    assert.deepEqual(
      daEquipeA.map((c) => c.nomeExibicao),
      ["Ana", "Bruno", "Carlos"],
    );

    const somenteAtivos = await prisma.corretor.findMany({
      where: { ativo: true, nomeCompleto: { startsWith: `${PREFIXO}lista_` } },
      select: { nomeExibicao: true },
      orderBy: { nomeExibicao: "asc" },
    });
    assert.deepEqual(
      somenteAtivos.map((c) => c.nomeExibicao),
      ["Ana", "Carlos", "Diego"],
    );

    const somenteInativos = await prisma.corretor.findMany({
      where: { ativo: false, nomeCompleto: { startsWith: `${PREFIXO}lista_` } },
      select: { nomeExibicao: true },
    });
    assert.deepEqual(
      somenteInativos.map((c) => c.nomeExibicao),
      ["Bruno"],
    );
  });
});
