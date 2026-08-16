import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  JANELA_CELEBRACAO_MS,
  listarCelebracoesRecentes,
  MAXIMO_CELEBRACOES_RECENTES,
} from "@/lib/celebracao";

/**
 * A leitura da celebração diante de uma venda que some no meio do caminho.
 *
 * O caso é real e foi observado no T1, contra o banco: o Prisma resolve `select`
 * aninhado em **mais de uma consulta**, e entre elas o Admin pode excluir o
 * lançamento. O `ON DELETE CASCADE` leva a celebração junto, e a linha já lida
 * chega à projeção com `lancamento: null` — que estourava com
 * `TypeError: Cannot read properties of null (reading 'valor')`.
 *
 * Reproduzir isso por timing seria um teste que passa por sorte. Aqui o cliente
 * do Prisma é substituído por um mínimo, tipado localmente, que devolve
 * exatamente as linhas que a corrida produz. O que se exercita é a **função
 * pública real** — `listarCelebracoesRecentes` —, não uma helper interna.
 */

type Participacao = {
  ordem: number;
  corretor: { nomeExibicao: string };
  equipe: { nome: string };
};

/** O `Decimal` do Prisma, no único contrato que a leitura usa. */
const decimal = (canonico: string) => ({ toFixed: () => canonico });

type Linha = {
  id: string;
  criadoEm: Date;
  lancamentoId: string;
  lancamento: {
    valor: { toFixed: () => string } | null;
    imovelRef: string | null;
    participacoes: Participacao[];
  } | null;
};

const CRIADO_EM = new Date("2026-08-16T14:00:00.000Z");

/** Uma linha íntegra, como o banco a devolve num estado consistente. */
function valida(id: string, extras: Partial<Linha> = {}): Linha {
  return {
    id,
    criadoEm: CRIADO_EM,
    lancamentoId: `la-${id}`,
    lancamento: {
      valor: decimal("900000.00"),
      imovelRef: `AP-${id}`,
      participacoes: [
        { ordem: 1, corretor: { nomeExibicao: `Corretor ${id}` }, equipe: { nome: "Equipe Suellen" } },
      ],
    },
    ...extras,
  };
}

/** A linha da corrida: a celebração foi lida, o lançamento já não existe. */
function comLancamentoSumido(id: string): Linha {
  return { ...valida(id), lancamento: null };
}

/** O que o cliente mínimo registrou da consulta, para provar o caminho real. */
type Chamada = { where?: unknown; orderBy?: unknown; take?: number };

/**
 * Um `PrismaClient` mínimo: só `celebracao.findMany`, devolvendo o que o teste
 * mandar. O cast é local e explícito — a leitura não toca em mais nada do
 * cliente, e um dublê completo só acrescentaria superfície a manter.
 */
function clienteQueDevolve(linhas: Linha[], chamadas: Chamada[] = []): PrismaClient {
  return {
    celebracao: {
      findMany: async (argumentos: Chamada) => {
        chamadas.push(argumentos);
        // Cópia: a leitura inverte a lista no lugar, e o teste ainda inspeciona
        // a entrada depois.
        return [...linhas];
      },
    },
  } as unknown as PrismaClient;
}

describe("leitura resiliente à venda excluída durante a consulta", () => {
  it("relação desaparecida: não lança e o evento é descartado", async () => {
    const prisma = clienteQueDevolve([comLancamentoSumido("A")]);

    const recentes = await listarCelebracoesRecentes(prisma, new Date());

    assert.deepEqual(recentes, [], "a celebração órfã simplesmente não aparece");
  });

  it("A válida + B desaparecida + C válida → A, C na ordem relativa", async () => {
    // O banco devolve por (criadoEm, id) DESC; a leitura inverte para exibição.
    // Entrando C, B, A, a saída esperada é A, C — com B fora.
    const prisma = clienteQueDevolve([
      valida("C"),
      comLancamentoSumido("B"),
      valida("A"),
    ]);

    const recentes = await listarCelebracoesRecentes(prisma, new Date());

    assert.deepEqual(
      recentes.map((celebracao) => celebracao.id),
      ["A", "C"],
      "some o evento, não a sequência",
    );
  });

  it("todas desaparecidas devolve lista vazia, não erro", async () => {
    const prisma = clienteQueDevolve([
      comLancamentoSumido("A"),
      comLancamentoSumido("B"),
      comLancamentoSumido("C"),
    ]);

    assert.deepEqual(await listarCelebracoesRecentes(prisma, new Date()), []);
  });

  it("elenco esvaziado no meio da leitura também é descartado", async () => {
    // O `where` exigiu `participacoes: { some: {} }` na seleção; a conversão de
    // VENDA para outro tipo apaga o elenco. Uma celebração sem participante
    // desenharia "É VENDA!" com ninguém embaixo.
    const semElenco = valida("A");
    semElenco.lancamento!.participacoes = [];

    const prisma = clienteQueDevolve([semElenco, valida("B")]);

    assert.deepEqual(
      (await listarCelebracoesRecentes(prisma, new Date())).map((c) => c.id),
      ["B"],
    );
  });

  it("a linha íntegra continua atravessando inteira", async () => {
    // O descarte não pode ter custado nada ao caminho feliz.
    const prisma = clienteQueDevolve([valida("A")]);

    const [celebracao] = await listarCelebracoesRecentes(prisma, new Date());

    assert.equal(celebracao.id, "A");
    assert.equal(celebracao.lancamentoId, "la-A");
    assert.equal(celebracao.criadoEm, CRIADO_EM);
    assert.equal(celebracao.valor, "900000.00", "dinheiro continua string canônica");
    assert.equal(celebracao.imovelRef, "AP-A");
    assert.deepEqual(celebracao.participantes, [
      { ordem: 1, corretorNome: "Corretor A", equipeNome: "Equipe Suellen" },
    ]);
  });

  it("o descarte acontece depois do banco, sem afrouxar a consulta", async () => {
    // A tolerância é de projeção. A seleção continua exigindo VENDA com
    // participação, dentro da janela, e com o teto de dez.
    const chamadas: Chamada[] = [];
    const agora = new Date("2026-08-16T14:00:00.000Z");

    await listarCelebracoesRecentes(clienteQueDevolve([], chamadas), agora);

    assert.equal(chamadas.length, 1, "uma consulta só");
    assert.deepEqual(chamadas[0].where, {
      criadoEm: { gte: new Date(agora.getTime() - JANELA_CELEBRACAO_MS) },
      lancamento: { tipo: "VENDA", participacoes: { some: {} } },
    });
    assert.deepEqual(chamadas[0].orderBy, [{ criadoEm: "desc" }, { id: "desc" }]);
    assert.equal(chamadas[0].take, MAXIMO_CELEBRACOES_RECENTES);
  });
});
