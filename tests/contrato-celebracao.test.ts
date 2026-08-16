import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CelebracaoApresentavel } from "@/lib/celebracao";
import { paraRespostaCelebracoes } from "@/lib/contrato-celebracao";

/**
 * O recorte que atravessa a rede, provado sem banco.
 *
 * Aqui não há Prisma, rota nem token: só a projeção da leitura do núcleo para o
 * payload da TV. O que se afirma é a **forma** — quem entra, quem fica de fora,
 * e em que representação a data viaja —, e nada disso precisa de I/O para ser
 * verificado.
 */

function celebracao(sobrescritas: Partial<CelebracaoApresentavel> = {}): CelebracaoApresentavel {
  return {
    id: "ce1",
    criadoEm: new Date("2026-08-16T14:05:09.123Z"),
    lancamentoId: "la1",
    valor: "900000.00",
    participantes: [{ ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" }],
    ...sobrescritas,
  };
}

describe("payload da celebração", () => {
  it("a data vira ISO-8601 em UTC, com milissegundos", () => {
    const { celebracoes } = paraRespostaCelebracoes([celebracao()]);

    assert.equal(celebracoes[0].criadoEm, "2026-08-16T14:05:09.123Z");
    assert.match(celebracoes[0].criadoEm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("`lancamentoId` não atravessa", () => {
    const { celebracoes } = paraRespostaCelebracoes([celebracao()]);

    assert.equal("lancamentoId" in celebracoes[0], false);
    assert.deepEqual(Object.keys(celebracoes[0]).sort(), [
      "criadoEm",
      "id",
      "participantes",
      "valor",
    ]);
  });

  it("dinheiro continua string canônica, e `null` continua `null`", () => {
    const comValor = paraRespostaCelebracoes([celebracao({ valor: "1250000.00" })]);
    assert.equal(comValor.celebracoes[0].valor, "1250000.00");

    const semValor = paraRespostaCelebracoes([celebracao({ valor: null })]);
    assert.equal(semValor.celebracoes[0].valor, null);
  });

  it("os participantes atravessam todos, na ordem em que chegaram", () => {
    const { celebracoes } = paraRespostaCelebracoes([
      celebracao({
        participantes: [
          { ordem: 1, corretorNome: "Carla", equipeNome: "Equipe Lena" },
          { ordem: 2, corretorNome: "Maria", equipeNome: "Equipe Suellen" },
          { ordem: 3, corretorNome: "Bruno", equipeNome: "Equipe Lena" },
        ],
      }),
    ]);

    assert.deepEqual(celebracoes[0].participantes, [
      { ordem: 1, corretorNome: "Carla", equipeNome: "Equipe Lena" },
      { ordem: 2, corretorNome: "Maria", equipeNome: "Equipe Suellen" },
      { ordem: 3, corretorNome: "Bruno", equipeNome: "Equipe Lena" },
    ]);
  });

  it("a lista é plural e preserva a ordem recebida — sem reordenar nem cortar", () => {
    const entrada = [
      celebracao({ id: "a", criadoEm: new Date("2026-08-16T14:00:00.000Z") }),
      celebracao({ id: "b", criadoEm: new Date("2026-08-16T14:00:10.000Z") }),
      celebracao({ id: "c", criadoEm: new Date("2026-08-16T14:00:20.000Z") }),
    ];

    const { celebracoes } = paraRespostaCelebracoes(entrada);

    assert.equal(celebracoes.length, 3);
    assert.deepEqual(
      celebracoes.map((c) => c.id),
      ["a", "b", "c"],
      "a ordem é decidida no núcleo; o contrato não opina",
    );
  });

  it("lista vazia vira lista vazia, não ausência de campo", () => {
    const resposta = paraRespostaCelebracoes([]);

    assert.deepEqual(resposta, { celebracoes: [] });
    // A TV distingue "nada para comemorar" de "resposta malformada" pela
    // presença do campo; omiti-lo trocaria um estado normal por um erro.
    assert.equal(Array.isArray(resposta.celebracoes), true);
  });

  it("o resultado sobrevive a JSON.stringify sem perder forma", () => {
    const resposta = paraRespostaCelebracoes([celebracao()]);

    assert.deepEqual(JSON.parse(JSON.stringify(resposta)), resposta);
  });
});
