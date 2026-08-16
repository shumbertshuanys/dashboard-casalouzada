import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";
import {
  buscarUltimaVendaCadastrada,
  JANELA_CELEBRACAO_MS,
  listarCelebracoesRecentes,
  MAXIMO_CELEBRACOES_RECENTES,
  registrarCelebracao,
} from "@/lib/celebracao";

/**
 * Celebração de venda (C1) contra o PostgreSQL **local**.
 *
 * Prefixo `__C1_TESTE_`. Todo lançamento criado aqui leva o prefixo em
 * `imovelRef` — inclusive os deliberadamente malformados —, e é por ele que a
 * limpeza alcança até a VENDA sem participação, que nenhum outro caminho
 * encontraria.
 *
 * **Este arquivo roda em série de propósito** (`concurrency: 1`). Duas leituras
 * daqui são globais por natureza: `listarCelebracoesRecentes` enxerga toda a
 * tabela `celebracoes`, e o teste do teto precisa de tabela limpa para afirmar
 * que voltaram as dez **mais recentes**. Com `it` concorrente, um teste
 * limparia a tabela debaixo do outro. Entre arquivos não há disputa: nenhuma
 * outra suíte cria celebração.
 *
 * Onde o instante importa, ele é congelado no teste e as linhas são gravadas
 * com `criadoEm` explícito. O relógio da máquina nunca decide uma fronteira.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__C1_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  // As celebrações caem por Cascade junto com os lançamentos; o `deleteMany`
  // logo abaixo existe para as que este arquivo cria por fora do fixture, e
  // porque o teste do teto precisa da tabela vazia. Apagar tudo é seguro: só
  // esta suíte grava em `celebracoes` no banco de teste.
  await cliente.celebracao.deleteMany({});
  await cliente.lancamento.deleteMany({ where: { imovelRef: { startsWith: PREFIXO } } });
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

async function criarEquipe(sufixo: string) {
  return prisma.equipe.create({
    data: { nome: nome(`Equipe ${sufixo}`), gerenteNome: "C1", ordemExibicao: 92 },
  });
}

async function criarCorretor(sufixo: string, equipeId: string) {
  return prisma.corretor.create({
    data: {
      nomeCompleto: nome(`Corretor ${sufixo}`),
      nomeExibicao: `C1 ${sufixo}`,
      equipeId,
    },
  });
}

type Participante = { corretorId: string; equipeId: string };

/** Uma VENDA no formato do cutover: campos antigos `NULL`, crédito no elenco. */
async function criarVenda(
  sufixo: string,
  participantes: readonly Participante[],
  extras: { valor?: string; dataReferencia?: string; criadoEm?: Date } = {},
) {
  return prisma.lancamento.create({
    data: {
      tipo: "VENDA",
      corretorId: null,
      equipeId: null,
      dataReferencia: paraDataCivil(extras.dataReferencia ?? "2026-08-10"),
      valor: extras.valor ?? "900000.00",
      imovelRef: nome(sufixo),
      ...(extras.criadoEm === undefined ? {} : { criadoEm: extras.criadoEm }),
      participacoes: {
        create: participantes.map((participante, indice) => ({
          corretorId: participante.corretorId,
          equipeId: participante.equipeId,
          ordem: indice + 1,
        })),
      },
    },
    select: { id: true, criadoEm: true },
  });
}

/**
 * Uma celebração com carimbo escolhido pelo teste.
 *
 * Deliberadamente fora de `registrarCelebracao`: o núcleo não aceita `criadoEm`
 * e não deve aceitar — quem decide o instante de um evento é o banco. Antedatar
 * é privilégio do fixture, e é o que torna a fronteira da janela verificável
 * sem esperar cinco minutos.
 */
async function celebrarEm(lancamentoId: string, criadoEm: Date) {
  return prisma.celebracao.create({
    data: { lancamentoId, criadoEm },
    select: { id: true, criadoEm: true },
  });
}

/** O elenco gravado, em ordem. */
async function elencoDe(lancamentoId: string) {
  return prisma.participacaoVenda.findMany({
    where: { lancamentoId },
    orderBy: { ordem: "asc" },
    select: { id: true, corretorId: true, equipeId: true, ordem: true, criadoEm: true },
  });
}

describe("celebração de venda", { concurrency: 1 }, () => {
  /* T1 ---------------------------------------------------------------- */
  describe("registro", () => {
    it("uma celebração é criada apontando para uma VENDA existente", async () => {
      const equipe = await criarEquipe("t1");
      const corretor = await criarCorretor("t1", equipe.id);
      const venda = await criarVenda("t1", [{ corretorId: corretor.id, equipeId: equipe.id }]);

      const registrada = await registrarCelebracao(prisma, venda.id);

      assert.ok(registrada.id, "a celebração devolve a própria identidade");
      assert.ok(registrada.criadoEm instanceof Date);

      assert.equal(
        await prisma.lancamento.count({ where: { id: venda.id, tipo: "VENDA" } }),
        1,
        "uma venda",
      );
      assert.equal(
        await prisma.celebracao.count({ where: { lancamentoId: venda.id } }),
        1,
        "uma celebração",
      );

      const relida = await prisma.celebracao.findUniqueOrThrow({ where: { id: registrada.id } });
      assert.equal(relida.lancamentoId, venda.id);
    });

    /* T2 -------------------------------------------------------------- */
    it("celebrar não cria nem altera dado comercial", async () => {
      const equipe = await criarEquipe("t2");
      const a = await criarCorretor("t2a", equipe.id);
      const b = await criarCorretor("t2b", equipe.id);
      const venda = await criarVenda("t2", [
        { corretorId: a.id, equipeId: equipe.id },
        { corretorId: b.id, equipeId: equipe.id },
      ]);

      // Escopo pelo prefixo: contagem global disputaria com as outras suítes.
      const contarLancamentos = () =>
        prisma.lancamento.count({ where: { imovelRef: { startsWith: PREFIXO } } });
      const contarParticipacoes = () =>
        prisma.participacaoVenda.count({
          where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
        });

      const lancamentosAntes = await contarLancamentos();
      const participacoesAntes = await contarParticipacoes();
      // `atualizadoEm` é `@updatedAt`: qualquer UPDATE em `Lancamento`, mesmo
      // que não mudasse campo nenhum de conteúdo, apareceria aqui.
      const vendaAntes = await prisma.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
      const elencoAntes = await elencoDe(venda.id);

      await registrarCelebracao(prisma, venda.id);
      await registrarCelebracao(prisma, venda.id);

      assert.equal(await contarLancamentos(), lancamentosAntes, "nenhum lançamento novo");
      assert.equal(await contarParticipacoes(), participacoesAntes, "nenhuma participação nova");

      const vendaDepois = await prisma.lancamento.findUniqueOrThrow({ where: { id: venda.id } });
      assert.equal(vendaDepois.valor?.toFixed(2), vendaAntes.valor?.toFixed(2), "valor intacto");
      assert.equal(vendaDepois.tipo, vendaAntes.tipo);
      assert.equal(
        vendaDepois.atualizadoEm.toISOString(),
        vendaAntes.atualizadoEm.toISOString(),
        "o lançamento não foi tocado",
      );

      assert.deepEqual(
        (await elencoDe(venda.id)).map((p) => [p.id, p.corretorId, p.equipeId, p.ordem]),
        elencoAntes.map((p) => [p.id, p.corretorId, p.equipeId, p.ordem]),
        "participantes intactos",
      );
    });
  });

  /* T3, T5, T6, T7 ---------------------------------------------------- */
  describe("leitura das celebrações recentes", () => {
    /**
     * **O teste bloqueante do ciclo.**
     *
     * Duas vendas cadastradas entre duas consultas da TV: se a leitura
     * devolvesse só a última, a primeira nunca chegaria à tela. Qualquer
     * regressão para `ORDER BY ... LIMIT 1` morre aqui.
     */
    it("duas celebrações recentes são recuperadas, não apenas a última", async () => {
      await prisma.celebracao.deleteMany({});

      const equipe = await criarEquipe("t3");
      const corretorA = await criarCorretor("t3a", equipe.id);
      const corretorB = await criarCorretor("t3b", equipe.id);

      const agora = new Date();
      const vendaA = await criarVenda("t3a", [{ corretorId: corretorA.id, equipeId: equipe.id }]);
      const vendaB = await criarVenda("t3b", [{ corretorId: corretorB.id, equipeId: equipe.id }]);

      // Carimbos explícitos: a ordem afirmada é a do dado, não a da máquina.
      const celebracaoA = await celebrarEm(vendaA.id, new Date(agora.getTime() - 60_000));
      const celebracaoB = await celebrarEm(vendaB.id, new Date(agora.getTime() - 30_000));

      const recentes = await listarCelebracoesRecentes(prisma, agora);

      assert.equal(recentes.length, 2, "as duas celebrações vieram — não só a mais nova");
      assert.deepEqual(
        recentes.map((celebracao) => celebracao.id),
        [celebracaoA.id, celebracaoB.id],
        "ordem de exibição: mais antiga → mais nova",
      );
      assert.deepEqual(
        recentes.map((celebracao) => celebracao.lancamentoId),
        [vendaA.id, vendaB.id],
      );
      assert.deepEqual(
        recentes.map((celebracao) => celebracao.participantes.map((p) => p.corretorNome)),
        [["C1 t3a"], ["C1 t3b"]],
        "cada celebração carrega o elenco da própria venda",
      );
    });

    /* T5 -------------------------------------------------------------- */
    it("a janela de frescor inclui o que está dentro e exclui o que está fora", async () => {
      await prisma.celebracao.deleteMany({});

      const equipe = await criarEquipe("t5");
      const corretor = await criarCorretor("t5", equipe.id);
      const venda = await criarVenda("t5", [{ corretorId: corretor.id, equipeId: equipe.id }]);

      // Um instante só, congelado antes de tudo: a fronteira é calculada a
      // partir dele, e não do relógio no momento da consulta.
      const agora = new Date();
      const dentro = await celebrarEm(
        venda.id,
        new Date(agora.getTime() - JANELA_CELEBRACAO_MS + 1_000),
      );
      const fora = await celebrarEm(
        venda.id,
        new Date(agora.getTime() - JANELA_CELEBRACAO_MS - 1_000),
      );

      const recentes = await listarCelebracoesRecentes(prisma, agora);

      assert.deepEqual(
        recentes.map((celebracao) => celebracao.id),
        [dentro.id],
        "só a celebração dentro dos 5 minutos aparece",
      );
      assert.equal(
        recentes.some((celebracao) => celebracao.id === fora.id),
        false,
        "a anterior à janela não aparece",
      );
    });

    /* T6 -------------------------------------------------------------- */
    it("o teto corta pelas mais antigas: voltam as N mais recentes, em ordem", async () => {
      await prisma.celebracao.deleteMany({});

      const equipe = await criarEquipe("t6");
      const corretor = await criarCorretor("t6", equipe.id);
      const venda = await criarVenda("t6", [{ corretorId: corretor.id, equipeId: equipe.id }]);

      const agora = new Date();
      const total = MAXIMO_CELEBRACOES_RECENTES + 2;

      // Todas dentro da janela, com carimbos crescentes e distintos: o que as
      // separa é só o teto, nunca o frescor.
      const criadas: { id: string; criadoEm: Date }[] = [];
      for (let indice = 0; indice < total; indice += 1) {
        criadas.push(
          await celebrarEm(venda.id, new Date(agora.getTime() - (total - indice) * 1_000)),
        );
      }

      const recentes = await listarCelebracoesRecentes(prisma, agora);

      assert.equal(recentes.length, MAXIMO_CELEBRACOES_RECENTES, "no máximo o limite");
      assert.deepEqual(
        recentes.map((celebracao) => celebracao.id),
        criadas.slice(total - MAXIMO_CELEBRACOES_RECENTES).map((celebracao) => celebracao.id),
        "são as mais recentes, da mais antiga para a mais nova",
      );
      assert.equal(
        recentes.some((celebracao) => celebracao.id === criadas[0].id),
        false,
        "a mais antiga do excedente ficou de fora",
      );
    });

    /* T7 -------------------------------------------------------------- */
    it("celebração apontando para lançamento que não é VENDA não é apresentada", async () => {
      await prisma.celebracao.deleteMany({});

      const equipe = await criarEquipe("t7");
      const corretor = await criarCorretor("t7", equipe.id);

      // Nada da produção comercial é alterado para provocar isto: a linha
      // inválida é gravada direto pelo fixture, que é a única forma de ela
      // existir — o núcleo nunca a criaria.
      const locacao = await prisma.lancamento.create({
        data: {
          tipo: "LOCACAO",
          corretorId: corretor.id,
          equipeId: equipe.id,
          dataReferencia: paraDataCivil("2026-08-10"),
          valor: "3500.00",
          imovelRef: nome("t7locacao"),
        },
        select: { id: true },
      });

      const agora = new Date();
      const invalida = await celebrarEm(locacao.id, new Date(agora.getTime() - 10_000));

      const venda = await criarVenda("t7venda", [
        { corretorId: corretor.id, equipeId: equipe.id },
      ]);
      const valida = await celebrarEm(venda.id, new Date(agora.getTime() - 5_000));

      const recentes = await listarCelebracoesRecentes(prisma, agora);

      assert.deepEqual(
        recentes.map((celebracao) => celebracao.id),
        [valida.id],
        "a LOCACAO não vira celebração apresentada; a VENDA continua vindo",
      );
      assert.equal(
        await prisma.celebracao.count({ where: { id: invalida.id } }),
        1,
        "a linha continua existindo — o que muda é ela não ser apresentável",
      );
    });

    it("celebração de VENDA sem participação não é apresentada", async () => {
      await prisma.celebracao.deleteMany({});

      // O `CHECK` do cutover só fala dos campos antigos: uma VENDA sem elenco
      // é gravável no banco, ainda que a aplicação nunca produza uma. Sem esta
      // exigência, ela chegaria à TV com lista de participantes vazia.
      const orfa = await prisma.lancamento.create({
        data: {
          tipo: "VENDA",
          corretorId: null,
          equipeId: null,
          dataReferencia: paraDataCivil("2026-08-10"),
          valor: "900000.00",
          imovelRef: nome("t7orfa"),
        },
        select: { id: true },
      });

      const agora = new Date();
      await celebrarEm(orfa.id, new Date(agora.getTime() - 10_000));

      assert.deepEqual(await listarCelebracoesRecentes(prisma, agora), []);
    });
  });

  /* T4 ---------------------------------------------------------------- */
  describe("payload da celebração", () => {
    it("um participante", async () => {
      await prisma.celebracao.deleteMany({});

      const equipe = await criarEquipe("t4solo");
      const corretor = await criarCorretor("t4solo", equipe.id);
      const venda = await criarVenda(
        "t4solo",
        [{ corretorId: corretor.id, equipeId: equipe.id }],
        { valor: "1250000.00" },
      );

      const agora = new Date();
      await celebrarEm(venda.id, new Date(agora.getTime() - 10_000));

      const [celebracao] = await listarCelebracoesRecentes(prisma, agora);
      assert.equal(celebracao.valor, "1250000.00", "dinheiro como string canônica");
      assert.deepEqual(celebracao.participantes, [
        { ordem: 1, corretorNome: "C1 t4solo", equipeNome: nome("Equipe t4solo") },
      ]);
    });

    it("múltiplos participantes de equipes diferentes, na ordem de ParticipacaoVenda", async () => {
      await prisma.celebracao.deleteMany({});

      const equipeX = await criarEquipe("t4X");
      const equipeY = await criarEquipe("t4Y");
      const a = await criarCorretor("t4a", equipeX.id);
      const b = await criarCorretor("t4b", equipeY.id);
      const c = await criarCorretor("t4c", equipeX.id);

      // O elenco é gravado fora de ordem alfabética de propósito: quem manda é
      // `ordem`, não o nome nem o id.
      const venda = await criarVenda("t4multi", [
        { corretorId: c.id, equipeId: equipeX.id },
        { corretorId: a.id, equipeId: equipeY.id },
        { corretorId: b.id, equipeId: equipeY.id },
      ]);

      const agora = new Date();
      await celebrarEm(venda.id, new Date(agora.getTime() - 10_000));

      const [celebracao] = await listarCelebracoesRecentes(prisma, agora);
      assert.deepEqual(celebracao.participantes, [
        { ordem: 1, corretorNome: "C1 t4c", equipeNome: nome("Equipe t4X") },
        // O snapshot de A é a equipe Y, gravada na participação — não a equipe
        // X em que ele está lotado. A leitura não rederiva nada.
        { ordem: 2, corretorNome: "C1 t4a", equipeNome: nome("Equipe t4Y") },
        { ordem: 3, corretorNome: "C1 t4b", equipeNome: nome("Equipe t4Y") },
      ]);
      assert.equal(celebracao.lancamentoId, venda.id);
    });
  });

  /* T8 ---------------------------------------------------------------- */
  describe("exclusão", () => {
    it("apagar a venda leva a celebração junto (Cascade)", async () => {
      const equipe = await criarEquipe("t8");
      const corretor = await criarCorretor("t8", equipe.id);
      const venda = await criarVenda("t8", [{ corretorId: corretor.id, equipeId: equipe.id }]);

      const celebracao = await registrarCelebracao(prisma, venda.id);
      assert.equal(await prisma.celebracao.count({ where: { id: celebracao.id } }), 1);

      // Hard delete, como a action de exclusão faz. Nada é apagado à mão: se a
      // FK fosse `Restrict`, esta linha estouraria.
      await prisma.lancamento.delete({ where: { id: venda.id } });

      assert.equal(
        await prisma.celebracao.count({ where: { id: celebracao.id } }),
        0,
        "a celebração dependente desapareceu pela FK",
      );
    });
  });

  /* T9 ---------------------------------------------------------------- */
  describe("última venda cadastrada", () => {
    it("é a de maior criadoEm, não a de maior dataReferencia", async () => {
      const equipe = await criarEquipe("t9");
      const corretor = await criarCorretor("t9", equipe.id);

      // `buscarUltimaVendaCadastrada` é global por contrato, e as suítes de
      // integração rodam em paralelo — outras criam VENDA com `criadoEm` de
      // agora. Os carimbos abaixo estão adiantados o bastante para que a
      // resposta certa seja a desta suíte, e a limpeza os leva embora.
      const antiga = await criarVenda("t9antiga", [
        { corretorId: corretor.id, equipeId: equipe.id },
      ], {
        criadoEm: new Date("2099-01-01T00:00:00.000Z"),
        // A mais antiga a cadastrar é a de data de referência mais recente:
        // é essa inversão que separa os dois critérios.
        dataReferencia: "2026-12-31",
      });

      const recente = await criarVenda("t9recente", [
        { corretorId: corretor.id, equipeId: equipe.id },
      ], {
        criadoEm: new Date("2099-01-02T00:00:00.000Z"),
        dataReferencia: "2026-01-05",
      });

      const ultima = await buscarUltimaVendaCadastrada(prisma);

      assert.equal(ultima?.id, recente.id, "criadoEm DESC decide");
      assert.notEqual(ultima?.id, antiga.id, "dataReferencia não decide");
    });

    /**
     * O contrato do `null` é "não existe nenhuma venda", e o banco de teste
     * nunca está nesse estado: as suítes de integração rodam em paralelo e
     * criam VENDA o tempo todo. Apagar todas para provar o `null` — ainda que
     * dentro de uma transação revertida — travaria as linhas das outras suítes
     * enquanto elas escrevem, trocando um teste por um deadlock.
     *
     * O que dá para afirmar sem essa troca é o contrapositivo, e é o que fica:
     * havendo venda, a resposta nunca é `null`, e o que volta é sempre VENDA.
     * A ausência do ramo vazio é limitação conhecida deste teste.
     */
    it("havendo venda, nunca devolve null — e o que volta é sempre uma VENDA", async () => {
      const vendas = await prisma.lancamento.count({ where: { tipo: "VENDA" } });
      assert.ok(vendas > 0, "as fixtures desta suíte já garantem pelo menos uma");

      const ultima = await buscarUltimaVendaCadastrada(prisma);
      assert.notEqual(ultima, null);
      assert.equal(
        await prisma.lancamento.count({ where: { id: ultima!.id, tipo: "VENDA" } }),
        1,
      );
    });
  });
});
