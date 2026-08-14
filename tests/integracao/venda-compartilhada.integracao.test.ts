import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";
import { decidirLancamentoParaCorretor, validarLancamento } from "@/lib/validacao/lancamento";

/**
 * Administração de venda compartilhada (E3) contra o PostgreSQL **local**.
 *
 * Reproduz o miolo das actions — FormData → validação → decisão de crédito →
 * transação — e prova o contrato do cutover: venda com os campos antigos
 * `NULL`, crédito nas participações, ordem 1..N, snapshots preservados na
 * edição e elenco descartado ao virar outro tipo (DEC-051, DEC-052).
 *
 * Cada `it` cria as próprias fixtures com nomes únicos: os `it` de um describe
 * rodam concorrentes e os arquivos de integração rodam em paralelo.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__E3_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  // Participações caem por Cascade junto com os lançamentos.
  await cliente.lancamento.deleteMany({
    where: { participacoes: { some: { corretor: { nomeCompleto: { startsWith: PREFIXO } } } } },
  });
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

before(async () => {
  await limpar(prisma);
});

after(async () => {
  await limpar(prisma);
  await prisma.$disconnect();
});

/** Uma equipe exclusiva do teste. */
async function criarEquipe(sufixo: string, ativa = true) {
  return prisma.equipe.create({
    data: { nome: nome(`Equipe ${sufixo}`), gerenteNome: "E3", ordemExibicao: 91, ativa },
  });
}

async function criarCorretor(sufixo: string, equipeId: string, ativo = true) {
  return prisma.corretor.create({
    data: {
      nomeCompleto: nome(`Corretor ${sufixo}`),
      nomeExibicao: `E3 ${sufixo}`,
      equipeId,
      ativo,
    },
  });
}

/** O FormData de uma venda, com os participantes na ordem visual. */
function formularioVenda(
  participantes: readonly string[],
  extras: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("tipo", "VENDA");
  form.set("dataReferencia", "2026-08-10");
  form.set("valor", "900.000,00");
  for (const [chave, valor] of Object.entries(extras)) form.set(chave, valor);
  for (const id of participantes) form.append("participanteId", id);
  return form;
}

/** Decisão de crédito de cada participante, como a action faz. */
async function resolverParticipantes(ids: readonly string[]) {
  const corretores = await prisma.corretor.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      nomeExibicao: true,
      ativo: true,
      equipeId: true,
      equipe: { select: { ativa: true } },
    },
  });
  const porId = new Map(corretores.map((corretor) => [corretor.id, corretor]));

  const participantes: { corretorId: string; equipeId: string; ordem: number }[] = [];
  for (const [indice, id] of ids.entries()) {
    const decisao = decidirLancamentoParaCorretor(porId.get(id) ?? null);
    if (!decisao.ok) return { ok: false as const, erro: decisao.erro };
    participantes.push({ corretorId: id, equipeId: decisao.equipeId, ordem: indice + 1 });
  }
  return { ok: true as const, participantes };
}

/** O fluxo da action de criação de venda. */
async function criarVenda(participantes: readonly string[], extras: Record<string, string> = {}) {
  const validado = validarLancamento(formularioVenda(participantes, extras));
  if (!validado.ok) return { ok: false as const, erros: validado.erros };
  if (validado.dados.tipo !== "VENDA") throw new Error("deveria ser venda");

  const resolvidos = await resolverParticipantes(validado.dados.participanteIds);
  if (!resolvidos.ok) return { ok: false as const, erro: resolvidos.erro };

  const criada = await prisma.lancamento.create({
    data: {
      tipo: "VENDA",
      corretorId: null,
      equipeId: null,
      dataReferencia: validado.dados.dataReferencia,
      valor: validado.dados.valor,
      participacoes: { create: resolvidos.participantes },
    },
  });
  return { ok: true as const, id: criada.id };
}

/** O elenco gravado, em ordem. */
async function elencoDe(lancamentoId: string) {
  return prisma.participacaoVenda.findMany({
    where: { lancamentoId },
    orderBy: { ordem: "asc" },
    select: { id: true, corretorId: true, equipeId: true, ordem: true, criadoEm: true },
  });
}

/**
 * A reconciliação da action de edição: preservados, novos ao final, 1..N.
 *
 * Participação preservada volta com o **mesmo `id`** e o mesmo `criadoEm` — é a
 * mesma linha, não uma cópia. Participante novo não recebe nenhum dos dois: os
 * defaults do schema geram identidade e carimbo próprios.
 */
async function editarElenco(lancamentoId: string, submetidos: readonly string[]) {
  const existentes = await elencoDe(lancamentoId);
  const jaExistia = new Set(existentes.map((participacao) => participacao.corretorId));
  const continuam = new Set(submetidos);

  const preservados = existentes
    .filter((participacao) => continuam.has(participacao.corretorId))
    .map((participacao) => ({
      id: participacao.id,
      corretorId: participacao.corretorId,
      equipeId: participacao.equipeId,
      criadoEm: participacao.criadoEm,
    }));

  const novos = submetidos.filter((corretorId) => !jaExistia.has(corretorId));
  const resolvidos = await resolverParticipantes(novos);
  if (!resolvidos.ok) return { ok: false as const, erro: resolvidos.erro };

  const elenco = [...preservados, ...resolvidos.participantes].map((participacao, indice) => ({
    ...participacao,
    ordem: indice + 1,
  }));
  if (elenco.length === 0) return { ok: false as const, erro: "elenco vazio" };

  await prisma.$transaction(async (tx) => {
    await tx.participacaoVenda.deleteMany({ where: { lancamentoId } });
    await tx.lancamento.update({
      where: { id: lancamentoId },
      data: { corretorId: null, equipeId: null, participacoes: { create: elenco } },
    });
  });
  return { ok: true as const };
}

describe("criação de venda compartilhada", () => {
  it("um participante: campos antigos NULL e crédito na participação", async () => {
    const equipe = await criarEquipe("cria1");
    const corretor = await criarCorretor("cria1", equipe.id);

    const criada = await criarVenda([corretor.id]);
    assert.equal(criada.ok, true);
    if (!criada.ok) return;

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.corretorId, null);
    assert.equal(relida.equipeId, null);
    assert.equal(relida.valor?.toFixed(2), "900000.00");

    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => [p.corretorId, p.equipeId, p.ordem]),
      [[corretor.id, equipe.id, 1]],
    );
  });

  it("N participantes: a ordem é a do formulário", async () => {
    const equipeX = await criarEquipe("ordemX");
    const equipeY = await criarEquipe("ordemY");
    const a = await criarCorretor("ordemA", equipeX.id);
    const b = await criarCorretor("ordemB", equipeX.id);
    const c = await criarCorretor("ordemC", equipeY.id);

    // Submetidos fora de ordem alfabética de propósito: quem manda é a posição.
    const criada = await criarVenda([c.id, a.id, b.id]);
    assert.equal(criada.ok, true);
    if (!criada.ok) return;

    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => [p.corretorId, p.ordem]),
      [
        [c.id, 1],
        [a.id, 2],
        [b.id, 3],
      ],
    );
  });

  it("o snapshot é a equipe atual de cada participante, lida pelo servidor", async () => {
    const equipeX = await criarEquipe("snapX");
    const equipeY = await criarEquipe("snapY");
    const a = await criarCorretor("snapA", equipeX.id);
    const c = await criarCorretor("snapC", equipeY.id);

    // Equipe forjada no payload: a action não a lê.
    const criada = await criarVenda([a.id, c.id], { equipeId: equipeY.id });
    assert.equal(criada.ok, true);
    if (!criada.ok) return;

    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => p.equipeId),
      [equipeX.id, equipeY.id],
    );
  });

  it("recusa elenco vazio", async () => {
    const resultado = await criarVenda([]);
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(
      "erros" in resultado ? resultado.erros?.participanteIds : undefined,
      "Escolha pelo menos um participante da venda.",
    );
  });

  it("recusa participante repetido", async () => {
    const equipe = await criarEquipe("dup");
    const corretor = await criarCorretor("dup", equipe.id);

    const resultado = await criarVenda([corretor.id, corretor.id]);
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.match(
      String("erros" in resultado ? resultado.erros?.participanteIds : ""),
      /duas vezes/,
    );
  });

  it("recusa participante inexistente", async () => {
    const equipe = await criarEquipe("inexistente");
    const corretor = await criarCorretor("inexistente", equipe.id);

    const resultado = await criarVenda([corretor.id, "00000000-0000-4000-8000-000000000000"]);
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal("erro" in resultado && resultado.erro, "Corretor não encontrado.");
  });

  it("recusa participante inativo", async () => {
    const equipe = await criarEquipe("inativo");
    const ativo = await criarCorretor("inativoA", equipe.id);
    const inativo = await criarCorretor("inativoB", equipe.id, false);

    const resultado = await criarVenda([ativo.id, inativo.id]);
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal("erro" in resultado && resultado.erro, "Este corretor está inativo.");
  });

  it("recusa participante de equipe desativada", async () => {
    const equipeMorta = await criarEquipe("morta", false);
    const corretor = await criarCorretor("morta", equipeMorta.id);

    const resultado = await criarVenda([corretor.id]);
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.match(String("erro" in resultado ? resultado.erro : ""), /desativada/);
  });

  it("elenco inválido não deixa venda órfã: a escrita inteira volta atrás", async () => {
    const equipe = await criarEquipe("rollback");
    const corretor = await criarCorretor("rollback", equipe.id);

    const antes = await prisma.lancamento.count({ where: { tipo: "VENDA", valor: "123456.00" } });

    // A unique de corretor recusa a segunda participação; a escrita aninhada
    // do Prisma é transacional, então o lançamento não fica para trás.
    await assert.rejects(() =>
      prisma.lancamento.create({
        data: {
          tipo: "VENDA",
          corretorId: null,
          equipeId: null,
          dataReferencia: paraDataCivil("2026-08-10"),
          valor: "123456.00",
          participacoes: {
            create: [
              { corretorId: corretor.id, equipeId: equipe.id, ordem: 1 },
              { corretorId: corretor.id, equipeId: equipe.id, ordem: 2 },
            ],
          },
        },
      }),
    );

    const depois = await prisma.lancamento.count({ where: { tipo: "VENDA", valor: "123456.00" } });
    assert.equal(depois, antes, "nenhuma venda ficou sem elenco");
  });
});

describe("edição de venda compartilhada", () => {
  it("preserva o snapshot de quem continua, mesmo depois de mudar de equipe", async () => {
    const equipeX = await criarEquipe("presX");
    const equipeY = await criarEquipe("presY");
    const a = await criarCorretor("presA", equipeX.id);
    const b = await criarCorretor("presB", equipeX.id);

    const criada = await criarVenda([a.id, b.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    // O corretor A muda de equipe depois do fato.
    await prisma.corretor.update({ where: { id: a.id }, data: { equipeId: equipeY.id } });

    const editada = await editarElenco(criada.id, [a.id, b.id]);
    assert.equal(editada.ok, true);

    const elenco = await elencoDe(criada.id);
    assert.deepEqual(
      elenco.map((p) => [p.corretorId, p.equipeId, p.ordem]),
      [
        [a.id, equipeX.id, 1],
        [b.id, equipeX.id, 2],
      ],
      "o snapshot histórico não é rederivado pela lotação de hoje",
    );
  });

  it("participante hoje inativo pode permanecer", async () => {
    const equipe = await criarEquipe("permInativo");
    const a = await criarCorretor("permA", equipe.id);
    const b = await criarCorretor("permB", equipe.id);

    const criada = await criarVenda([a.id, b.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    await prisma.corretor.update({ where: { id: b.id }, data: { ativo: false } });

    const editada = await editarElenco(criada.id, [a.id, b.id]);
    assert.equal(editada.ok, true, "só participante novo passa pela decisão de crédito");
    assert.equal((await elencoDe(criada.id)).length, 2);
  });

  it("equipe histórica hoje inativa não impede a edição", async () => {
    const equipe = await criarEquipe("permEquipe");
    const a = await criarCorretor("permEqA", equipe.id);

    const criada = await criarVenda([a.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    await prisma.equipe.update({ where: { id: equipe.id }, data: { ativa: false } });

    const editada = await editarElenco(criada.id, [a.id]);
    assert.equal(editada.ok, true);
    assert.equal((await elencoDe(criada.id))[0].equipeId, equipe.id);
  });

  it("novo participante entra ao final, com a equipe atual dele", async () => {
    const equipeX = await criarEquipe("addX");
    const equipeY = await criarEquipe("addY");
    const a = await criarCorretor("addA", equipeX.id);
    const b = await criarCorretor("addB", equipeX.id);
    const d = await criarCorretor("addD", equipeY.id);

    const criada = await criarVenda([a.id, b.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    // Submetido no começo da lista: mesmo assim entra no fim, porque é novo.
    const editada = await editarElenco(criada.id, [d.id, a.id, b.id]);
    assert.equal(editada.ok, true);

    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => [p.corretorId, p.equipeId, p.ordem]),
      [
        [a.id, equipeX.id, 1],
        [b.id, equipeX.id, 2],
        [d.id, equipeY.id, 3],
      ],
    );
  });

  it("remover do meio recompacta preservando a ordem relativa", async () => {
    const equipe = await criarEquipe("remove");
    const a = await criarCorretor("removeA", equipe.id);
    const b = await criarCorretor("removeB", equipe.id);
    const c = await criarCorretor("removeC", equipe.id);
    const d = await criarCorretor("removeD", equipe.id);

    const criada = await criarVenda([a.id, b.id, c.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    // A(1), B(2), C(3) — remove B → A(1), C(2)
    assert.equal((await editarElenco(criada.id, [a.id, c.id])).ok, true);
    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => [p.corretorId, p.ordem]),
      [
        [a.id, 1],
        [c.id, 2],
      ],
    );

    // depois acrescenta D → A(1), C(2), D(3)
    assert.equal((await editarElenco(criada.id, [a.id, c.id, d.id])).ok, true);
    assert.deepEqual(
      (await elencoDe(criada.id)).map((p) => [p.corretorId, p.ordem]),
      [
        [a.id, 1],
        [c.id, 2],
        [d.id, 3],
      ],
    );
  });

  it("novo participante inativo é recusado, e nada é gravado", async () => {
    const equipe = await criarEquipe("novoInativo");
    const a = await criarCorretor("novoInativoA", equipe.id);
    const morto = await criarCorretor("novoInativoB", equipe.id, false);

    const criada = await criarVenda([a.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const editada = await editarElenco(criada.id, [a.id, morto.id]);
    assert.equal(editada.ok, false);
    assert.equal((await elencoDe(criada.id)).length, 1, "o elenco antigo continua intacto");
  });

  it("remover todos é recusado: a venda continua com o elenco anterior", async () => {
    const equipe = await criarEquipe("vazio");
    const a = await criarCorretor("vazioA", equipe.id);

    const criada = await criarVenda([a.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const editada = await editarElenco(criada.id, []);
    assert.equal(editada.ok, false);
    assert.equal((await elencoDe(criada.id)).length, 1);
  });

  it("a venda continua com os campos antigos NULL depois de editar", async () => {
    const equipe = await criarEquipe("nullDepois");
    const a = await criarCorretor("nullA", equipe.id);
    const b = await criarCorretor("nullB", equipe.id);

    const criada = await criarVenda([a.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    await editarElenco(criada.id, [a.id, b.id]);

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.corretorId, null);
    assert.equal(relida.equipeId, null);
  });
});

/**
 * Uma participação que permanece numa edição é a **mesma linha**: mesmo `id`,
 * mesmo snapshot, mesmo carimbo. Só a `ordem` pode mudar, e só pela
 * recompactação. Sem isso, cada edição trocaria a identidade de quem nem foi
 * mexido — e nenhum histórico apontado para aquela participação sobreviveria.
 */
describe("identidade da participação preservada", () => {
  it("editar só o valor não troca id, snapshot, carimbo nem ordem", async () => {
    const equipe = await criarEquipe("ident");
    const a = await criarCorretor("identA", equipe.id);
    const b = await criarCorretor("identB", equipe.id);
    const c = await criarCorretor("identC", equipe.id);

    const criada = await criarVenda([a.id, b.id, c.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const antes = await elencoDe(criada.id);
    assert.equal(antes.length, 3);

    // Edição que mexe só no lançamento: o elenco submetido é o mesmo.
    await prisma.lancamento.update({
      where: { id: criada.id },
      data: { valor: "750000.00" },
    });
    await editarElenco(criada.id, [a.id, b.id, c.id]);

    const depois = await elencoDe(criada.id);
    assert.deepEqual(
      depois.map((p) => [p.id, p.corretorId, p.equipeId, p.ordem, p.criadoEm.toISOString()]),
      antes.map((p) => [p.id, p.corretorId, p.equipeId, p.ordem, p.criadoEm.toISOString()]),
    );
  });

  it("remover do meio preserva os ids dos que ficam", async () => {
    const equipe = await criarEquipe("identRem");
    const a = await criarCorretor("identRemA", equipe.id);
    const b = await criarCorretor("identRemB", equipe.id);
    const c = await criarCorretor("identRemC", equipe.id);

    const criada = await criarVenda([a.id, b.id, c.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const antes = new Map((await elencoDe(criada.id)).map((p) => [p.corretorId, p]));

    assert.equal((await editarElenco(criada.id, [a.id, c.id])).ok, true);

    const depois = await elencoDe(criada.id);
    assert.deepEqual(
      depois.map((p) => [p.corretorId, p.ordem]),
      [
        [a.id, 1],
        [c.id, 2],
      ],
    );
    assert.equal(depois[0].id, antes.get(a.id)?.id, "A continua sendo a mesma participação");
    assert.equal(depois[1].id, antes.get(c.id)?.id, "C continua sendo a mesma participação");
    assert.equal(
      depois[0].criadoEm.toISOString(),
      antes.get(a.id)?.criadoEm.toISOString(),
    );
    assert.equal(
      await prisma.participacaoVenda.count({ where: { id: antes.get(b.id)?.id } }),
      0,
      "a participação do removido deixa de existir",
    );
  });

  it("o participante acrescentado depois recebe identidade e carimbo próprios", async () => {
    const equipe = await criarEquipe("identAdd");
    const a = await criarCorretor("identAddA", equipe.id);
    const c = await criarCorretor("identAddC", equipe.id);
    const d = await criarCorretor("identAddD", equipe.id);

    const criada = await criarVenda([a.id, c.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const antes = new Map((await elencoDe(criada.id)).map((p) => [p.corretorId, p]));

    assert.equal((await editarElenco(criada.id, [a.id, c.id, d.id])).ok, true);

    const depois = await elencoDe(criada.id);
    assert.equal(depois.length, 3);
    assert.equal(depois[0].id, antes.get(a.id)?.id);
    assert.equal(depois[1].id, antes.get(c.id)?.id);

    const novo = depois[2];
    assert.equal(novo.corretorId, d.id);
    assert.equal(novo.ordem, 3, "novo entra no final");
    assert.notEqual(novo.id, antes.get(a.id)?.id);
    assert.notEqual(novo.id, antes.get(c.id)?.id);
    assert.ok(
      novo.criadoEm.getTime() >= (antes.get(a.id)?.criadoEm.getTime() ?? 0),
      "o carimbo do novo é dele, não herdado de quem já estava",
    );
  });

  it("a identidade não vem do cliente: participação de outra venda não é alcançável", async () => {
    const equipe = await criarEquipe("identOutra");
    const a = await criarCorretor("identOutraA", equipe.id);
    const b = await criarCorretor("identOutraB", equipe.id);

    const primeira = await criarVenda([a.id]);
    const segunda = await criarVenda([b.id]);
    assert.ok(primeira.ok && segunda.ok);
    if (!primeira.ok || !segunda.ok) return;

    const daPrimeira = (await elencoDe(primeira.id))[0];

    // A reconciliação da segunda venda só enxerga o elenco dela: o corretor B
    // é preservado com o id da própria participação, e a linha da primeira
    // venda continua onde estava.
    await editarElenco(segunda.id, [b.id]);

    const daSegunda = (await elencoDe(segunda.id))[0];
    assert.notEqual(daSegunda.id, daPrimeira.id);
    assert.equal(
      await prisma.participacaoVenda.count({ where: { id: daPrimeira.id } }),
      1,
      "a participação da outra venda continua intacta",
    );
  });
});

describe("conversões de tipo", () => {
  it("não-VENDA → VENDA preserva o crédito antigo quando o corretor continua", async () => {
    const equipeX = await criarEquipe("convX");
    const equipeY = await criarEquipe("convY");
    const a = await criarCorretor("convA", equipeX.id);
    const b = await criarCorretor("convB", equipeY.id);

    const locacao = await prisma.lancamento.create({
      data: {
        tipo: "LOCACAO",
        corretorId: a.id,
        equipeId: equipeX.id,
        dataReferencia: paraDataCivil("2026-08-10"),
        valor: "3500.00",
      },
    });

    // O corretor A muda de equipe antes da conversão: o snapshot preservado
    // tem de ser o do fato (X), não a lotação de agora (Y).
    await prisma.corretor.update({ where: { id: a.id }, data: { equipeId: equipeY.id } });

    const existentes = [{ corretorId: a.id, equipeId: equipeX.id, ordem: 1 }];
    const novos = await resolverParticipantes([b.id]);
    assert.ok(novos.ok);
    if (!novos.ok) return;

    const elenco = [...existentes, ...novos.participantes].map((p, i) => ({ ...p, ordem: i + 1 }));
    await prisma.$transaction(async (tx) => {
      await tx.lancamento.update({
        where: { id: locacao.id },
        data: {
          tipo: "VENDA",
          corretorId: null,
          equipeId: null,
          valor: "900000.00",
          participacoes: { create: elenco },
        },
      });
    });

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: locacao.id } });
    assert.equal(relida.tipo, "VENDA");
    assert.equal(relida.corretorId, null);
    assert.deepEqual(
      (await elencoDe(locacao.id)).map((p) => [p.corretorId, p.equipeId, p.ordem]),
      [
        [a.id, equipeX.id, 1],
        [b.id, equipeY.id, 2],
      ],
    );
  });

  it("VENDA → não-VENDA grava um corretor e apaga o elenco", async () => {
    const equipe = await criarEquipe("saida");
    const a = await criarCorretor("saidaA", equipe.id);
    const b = await criarCorretor("saidaB", equipe.id);

    const criada = await criarVenda([a.id, b.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;

    const decisao = await resolverParticipantes([a.id]);
    assert.ok(decisao.ok);
    if (!decisao.ok) return;

    await prisma.$transaction(async (tx) => {
      await tx.participacaoVenda.deleteMany({ where: { lancamentoId: criada.id } });
      await tx.lancamento.update({
        where: { id: criada.id },
        data: {
          tipo: "LOCACAO",
          corretorId: a.id,
          equipeId: decisao.participantes[0].equipeId,
          valor: "3500.00",
        },
      });
    });

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.tipo, "LOCACAO");
    assert.equal(relida.corretorId, a.id);
    assert.equal(relida.equipeId, equipe.id);
    assert.equal((await elencoDe(criada.id)).length, 0, "o elenco compartilhado foi descartado");
  });

  it("o banco recusa VENDA com crédito no lançamento", async () => {
    const equipe = await criarEquipe("checkVenda");
    const corretor = await criarCorretor("checkVenda", equipe.id);

    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: {
            tipo: "VENDA",
            corretorId: corretor.id,
            equipeId: equipe.id,
            dataReferencia: paraDataCivil("2026-08-10"),
            valor: "100000.00",
          },
        }),
      (erro: unknown) => /venda_credito|23514/i.test(String((erro as Error).message)),
    );
  });

  it("o banco recusa não-VENDA sem crédito no lançamento", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: {
            tipo: "LOCACAO",
            corretorId: null,
            equipeId: null,
            dataReferencia: paraDataCivil("2026-08-10"),
            valor: "3500.00",
          },
        }),
      (erro: unknown) => /venda_credito|23514/i.test(String((erro as Error).message)),
    );
  });
});

describe("exclusão", () => {
  it("apagar a venda leva o elenco junto (Cascade)", async () => {
    const equipe = await criarEquipe("del");
    const a = await criarCorretor("delA", equipe.id);
    const b = await criarCorretor("delB", equipe.id);

    const criada = await criarVenda([a.id, b.id]);
    assert.ok(criada.ok);
    if (!criada.ok) return;
    assert.equal((await elencoDe(criada.id)).length, 2);

    await prisma.lancamento.delete({ where: { id: criada.id } });

    assert.equal(
      await prisma.participacaoVenda.count({ where: { lancamentoId: criada.id } }),
      0,
    );
  });
});
