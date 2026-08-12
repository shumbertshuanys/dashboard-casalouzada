import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PREFIXO_FIXTURE, criarPrismaTeste, limparFixtures } from "../helpers/banco-teste";
import { decidirAcesso } from "@/lib/admin/guarda";
import { ehNomeDuplicado } from "@/lib/validacao/equipe";

/**
 * Integração contra o PostgreSQL **local**. Nunca roda no `npm test`.
 *
 * Toda equipe criada aqui começa com `PREFIXO_FIXTURE`, e a limpeza apaga
 * exatamente esse recorte — as três equipes do seed não são tocadas em nenhum
 * momento.
 */

const prisma = criarPrismaTeste();
const nome = (sufixo: string) => `${PREFIXO_FIXTURE}${sufixo}`;

const SEED = ["Equipe Suellen", "Equipe Lena", "Equipe Fernanda L."];

before(async () => {
  await limparFixtures(prisma);
});

after(async () => {
  const apagados = await limparFixtures(prisma);
  console.log(`  fixtures removidos: ${apagados}`);
  await prisma.$disconnect();
});

describe("banco de teste", () => {
  it("está conectado ao banco local esperado", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string; usuario: string }[]
    >`SELECT current_database() AS db, current_user AS usuario`;
    assert.equal(linha.db, "casalouzada_test");
    assert.equal(linha.usuario, "casalouzada_test");
  });

  it("tem as três equipes do seed intactas", async () => {
    const encontradas = await prisma.equipe.findMany({
      where: { nome: { in: SEED } },
      select: { nome: true },
    });
    assert.equal(encontradas.length, 3);
  });
});

describe("equipe — criação", () => {
  it("cria com nome único e aplica os defaults", async () => {
    const criada = await prisma.equipe.create({
      data: { nome: nome("criar"), gerenteNome: "Gerente A", ordemExibicao: 10 },
    });
    assert.equal(criada.nome, nome("criar"));
    assert.equal(criada.gerenteNome, "Gerente A");
    assert.equal(criada.ordemExibicao, 10);
    // `ativa` tem default true no schema.
    assert.equal(criada.ativa, true);
    assert.ok(criada.id.length > 0);
  });

  it("faz round-trip fiel dos campos", async () => {
    const dados = { nome: nome("roundtrip"), gerenteNome: "Gerente Ç Ã", ordemExibicao: 42 };
    const criada = await prisma.equipe.create({ data: dados });

    const relida = await prisma.equipe.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.nome, dados.nome);
    assert.equal(relida.gerenteNome, dados.gerenteNome);
    assert.equal(relida.ordemExibicao, dados.ordemExibicao);
    assert.equal(relida.ativa, true);
    assert.ok(relida.criadoEm instanceof Date);
    assert.ok(relida.atualizadoEm instanceof Date);
  });

  it("o banco recusa nome duplicado com P2002", async () => {
    await prisma.equipe.create({
      data: { nome: nome("dup"), gerenteNome: "Gerente B", ordemExibicao: 11 },
    });

    await assert.rejects(
      () =>
        prisma.equipe.create({
          data: { nome: nome("dup"), gerenteNome: "Outro", ordemExibicao: 12 },
        }),
      (erro: unknown) => {
        // O mesmo detector que as actions usam.
        assert.equal(ehNomeDuplicado(erro), true);
        return true;
      },
    );
  });
});

describe("equipe — edição", () => {
  it("altera nome, gerente e ordem", async () => {
    const criada = await prisma.equipe.create({
      data: { nome: nome("editar"), gerenteNome: "Antes", ordemExibicao: 20 },
    });

    const editada = await prisma.equipe.update({
      where: { id: criada.id },
      data: { nome: nome("editada"), gerenteNome: "Depois", ordemExibicao: 21 },
    });

    assert.equal(editada.nome, nome("editada"));
    assert.equal(editada.gerenteNome, "Depois");
    assert.equal(editada.ordemExibicao, 21);
    assert.equal(editada.ativa, true);
  });

  it("editar para um nome já ocupado também dá P2002", async () => {
    await prisma.equipe.create({
      data: { nome: nome("ocupado"), gerenteNome: "G", ordemExibicao: 22 },
    });
    const outra = await prisma.equipe.create({
      data: { nome: nome("livre"), gerenteNome: "G", ordemExibicao: 23 },
    });

    await assert.rejects(
      () => prisma.equipe.update({ where: { id: outra.id }, data: { nome: nome("ocupado") } }),
      (erro: unknown) => ehNomeDuplicado(erro),
    );
  });
});

describe("equipe — ordenação", () => {
  it("ordena por ordemExibicao, com nome desempatando", async () => {
    await prisma.equipe.createMany({
      data: [
        { nome: nome("ord_c"), gerenteNome: "G", ordemExibicao: 32 },
        { nome: nome("ord_a"), gerenteNome: "G", ordemExibicao: 31 },
        { nome: nome("ord_b"), gerenteNome: "G", ordemExibicao: 31 },
      ],
    });

    const lista = await prisma.equipe.findMany({
      where: { nome: { startsWith: `${PREFIXO_FIXTURE}ord_` } },
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
      select: { nome: true, ordemExibicao: true },
    });

    assert.deepEqual(
      lista.map((e) => e.nome),
      [nome("ord_a"), nome("ord_b"), nome("ord_c")],
    );
  });
});

describe("equipe — desativar e reativar", () => {
  it("desativa mexendo só em ativa", async () => {
    const criada = await prisma.equipe.create({
      data: { nome: nome("estado"), gerenteNome: "Gerente C", ordemExibicao: 40 },
    });

    const desativada = await prisma.equipe.update({
      where: { id: criada.id },
      data: { ativa: false },
    });

    assert.equal(desativada.ativa, false);
    // Nada mais mudou.
    assert.equal(desativada.nome, criada.nome);
    assert.equal(desativada.gerenteNome, criada.gerenteNome);
    assert.equal(desativada.ordemExibicao, criada.ordemExibicao);
  });

  it("reativa", async () => {
    const criada = await prisma.equipe.create({
      data: { nome: nome("reativar"), gerenteNome: "G", ordemExibicao: 41, ativa: false },
    });
    assert.equal(criada.ativa, false);

    const reativada = await prisma.equipe.update({
      where: { id: criada.id },
      data: { ativa: true },
    });
    assert.equal(reativada.ativa, true);
  });

  it("desativar não mexe em corretor nem lançamento", async () => {
    const antesCorretores = await prisma.corretor.count();
    const antesLancamentos = await prisma.lancamento.count();

    const criada = await prisma.equipe.create({
      data: { nome: nome("sem_efeito"), gerenteNome: "G", ordemExibicao: 42 },
    });
    await prisma.equipe.update({ where: { id: criada.id }, data: { ativa: false } });

    assert.equal(await prisma.corretor.count(), antesCorretores);
    assert.equal(await prisma.lancamento.count(), antesLancamentos);
  });

  it("a listagem traz ativas e inativas, com as contagens", async () => {
    await prisma.equipe.create({
      data: { nome: nome("listagem_off"), gerenteNome: "G", ordemExibicao: 50, ativa: false },
    });

    const lista = await prisma.equipe.findMany({
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
      include: { _count: { select: { corretores: true, lancamentos: true } } },
    });

    const inativa = lista.find((e) => e.nome === nome("listagem_off"));
    assert.ok(inativa, "equipe inativa precisa aparecer na listagem");
    assert.equal(inativa.ativa, false);
    assert.equal(inativa._count.corretores, 0);
    assert.equal(inativa._count.lancamentos, 0);
  });
});

describe("guarda — decisão sobre conta real do banco", () => {
  const SESSAO = { usuarioId: "", nome: "do JWT", email: "admin@casalouzada.test" };

  it("autoriza administrador ativo que existe no banco", async () => {
    const conta = await prisma.usuario.findFirst({
      where: { ativo: true },
      select: { id: true, nome: true, email: true, ativo: true },
    });
    assert.ok(conta, "o seed local precisa ter criado o administrador de teste");

    const r = decidirAcesso({ ...SESSAO, usuarioId: conta.id }, conta);
    assert.equal(r.autorizado, true);
    assert.equal(r.autorizado === true && r.administrador.id, conta.id);
  });

  it("recusa conta inexistente — findUnique devolve null", async () => {
    const inexistente = "00000000-0000-4000-8000-000000000000";
    const conta = await prisma.usuario.findUnique({
      where: { id: inexistente },
      select: { id: true, nome: true, email: true, ativo: true },
    });
    assert.equal(conta, null);

    const r = decidirAcesso({ ...SESSAO, usuarioId: inexistente }, conta);
    assert.equal(r.autorizado === false && r.motivo, "conta-inexistente");
  });

  it("recusa conta desativada, lendo ativo=false do banco", async () => {
    const conta = await prisma.usuario.findFirstOrThrow({
      select: { id: true, nome: true, email: true, ativo: true },
    });

    // Desativa, lê de volta e devolve ao estado original.
    await prisma.usuario.update({ where: { id: conta.id }, data: { ativo: false } });
    try {
      const relida = await prisma.usuario.findUniqueOrThrow({
        where: { id: conta.id },
        select: { id: true, nome: true, email: true, ativo: true },
      });
      assert.equal(relida.ativo, false);

      const r = decidirAcesso({ ...SESSAO, usuarioId: conta.id }, relida);
      assert.equal(r.autorizado === false && r.motivo, "conta-inativa");
    } finally {
      await prisma.usuario.update({ where: { id: conta.id }, data: { ativo: conta.ativo } });
    }
  });
});
