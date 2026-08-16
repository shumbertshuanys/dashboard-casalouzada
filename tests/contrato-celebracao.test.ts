import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CelebracaoApresentavel } from "@/lib/celebracao";
import { ehRespostaCelebracoes, paraRespostaCelebracoes } from "@/lib/contrato-celebracao";

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
    imovelRef: "AP-1203",
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
      "imovelRef",
      "participantes",
      "valor",
    ]);
  });

  it("o imóvel atravessa, e a ausência dele atravessa como `null`", () => {
    const com = paraRespostaCelebracoes([celebracao({ imovelRef: "Cobertura Ipiranga 900" })]);
    assert.equal(com.celebracoes[0].imovelRef, "Cobertura Ipiranga 900");

    const sem = paraRespostaCelebracoes([celebracao({ imovelRef: null })]);
    assert.equal(sem.celebracoes[0].imovelRef, null);
    // A chave continua existindo: quem desenha testa o conteúdo, não a presença.
    assert.equal("imovelRef" in sem.celebracoes[0], true);
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

/* ------------------------------------------------------------------ */
/* Validação do que chega pela rede                                    */
/* ------------------------------------------------------------------ */

/**
 * A porta de entrada do cliente.
 *
 * `resposta.json()` devolve `any`: sem esta validação, um payload malformado
 * atravessaria a tipagem intacto e só apareceria como `R$ NaN` numa animação de
 * dez segundos na parede do escritório. O que se prova aqui é que ela recusa —
 * campo a campo — tudo que a TV não conseguiria desenhar.
 */

/** Um payload válido, sobre o qual cada teste estraga exatamente uma coisa. */
function payload(sobrescritas: Record<string, unknown> = {}): unknown {
  return {
    celebracoes: [
      {
        id: "ce-1",
        criadoEm: "2026-08-16T14:05:09.123Z",
        valor: "900000.00",
        imovelRef: "AP-1203",
        participantes: [{ ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" }],
        ...sobrescritas,
      },
    ],
  };
}

describe("validação do payload de celebrações", () => {
  it("aceita o payload correto", () => {
    assert.equal(ehRespostaCelebracoes(payload()), true);
  });

  it("aceita lista vazia — é o estado normal na maior parte do dia", () => {
    assert.equal(ehRespostaCelebracoes({ celebracoes: [] }), true);
  });

  it("aceita venda sem valor e venda compartilhada", () => {
    assert.equal(ehRespostaCelebracoes(payload({ valor: null })), true);
    assert.equal(
      ehRespostaCelebracoes(
        payload({
          participantes: [
            { ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" },
            { ordem: 2, corretorNome: "João", equipeNome: "Equipe Lena" },
          ],
        }),
      ),
      true,
    );
  });

  it("aceita o resultado do próprio serializador — as duas pontas fecham", () => {
    const daRede: unknown = JSON.parse(
      JSON.stringify(
        paraRespostaCelebracoes([
          celebracao(),
          celebracao({ id: "ce2", valor: null, criadoEm: new Date("2026-08-16T14:06:00.000Z") }),
        ]),
      ),
    );

    assert.equal(ehRespostaCelebracoes(daRede), true);
  });

  describe("raiz inválida", () => {
    const casos: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["número", 7],
      ["string", "celebracoes"],
      ["array na raiz", []],
      ["objeto sem o campo", {}],
    ];

    for (const [rotulo, valor] of casos) {
      it(`recusa ${rotulo}`, () => {
        assert.equal(ehRespostaCelebracoes(valor), false);
      });
    }
  });

  describe("celebracoes não-array", () => {
    const casos: [string, unknown][] = [
      ["objeto", {}],
      ["string", "[]"],
      ["null", null],
      ["número", 0],
    ];

    for (const [rotulo, valor] of casos) {
      it(`recusa celebracoes como ${rotulo}`, () => {
        assert.equal(ehRespostaCelebracoes({ celebracoes: valor }), false);
      });
    }
  });

  describe("id", () => {
    it("recusa id vazio, ausente ou não-string", () => {
      assert.equal(ehRespostaCelebracoes(payload({ id: "" })), false);
      assert.equal(ehRespostaCelebracoes(payload({ id: 1 })), false);
      assert.equal(ehRespostaCelebracoes(payload({ id: null })), false);
    });

    it("recusa ids repetidos no mesmo payload", () => {
      // O banco não produz isto — é chave primária —, mas o cliente usa o id
      // para saber o que já comemorou e como chave de lista: duas linhas com o
      // mesmo id fariam uma celebração sumir da fila em silêncio.
      const repetido = {
        celebracoes: [
          {
            id: "mesmo",
            criadoEm: "2026-08-16T14:05:09.123Z",
            valor: "900000.00",
            participantes: [{ ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" }],
          },
          {
            id: "mesmo",
            criadoEm: "2026-08-16T14:05:10.123Z",
            valor: "800000.00",
            participantes: [{ ordem: 1, corretorNome: "João", equipeNome: "Equipe Lena" }],
          },
        ],
      };

      assert.equal(ehRespostaCelebracoes(repetido), false);
    });
  });

  describe("criadoEm", () => {
    it("recusa data fora da forma ISO com milissegundos em UTC", () => {
      for (const invalida of [
        "2026-08-16",
        "2026-08-16T14:05:09Z",
        "2026-08-16T14:05:09.123",
        "2026-08-16T14:05:09.123-03:00",
        "ontem",
        "",
      ]) {
        assert.equal(ehRespostaCelebracoes(payload({ criadoEm: invalida })), false, invalida);
      }
    });

    it("recusa data com a forma certa e o calendário errado", () => {
      // A forma sozinha aceitaria o mês 13: quem recusa é o `Date.parse`.
      assert.equal(ehRespostaCelebracoes(payload({ criadoEm: "2026-13-45T99:99:99.999Z" })), false);
    });

    it("recusa criadoEm não-string", () => {
      assert.equal(ehRespostaCelebracoes(payload({ criadoEm: 1755352000000 })), false);
      assert.equal(ehRespostaCelebracoes(payload({ criadoEm: null })), false);
    });
  });

  describe("valor", () => {
    it("recusa o que não é decimal canônico", () => {
      for (const invalido of [
        "900000",
        "900000.0",
        "900000.000",
        "900.000,00",
        "R$ 900000.00",
        "-900000.00",
        "0900000.00",
        "",
        "NaN",
      ]) {
        assert.equal(ehRespostaCelebracoes(payload({ valor: invalido })), false, invalido);
      }
    });

    it("recusa valor numérico — dinheiro nunca é `number` neste projeto", () => {
      assert.equal(ehRespostaCelebracoes(payload({ valor: 900000 })), false);
    });

    it("recusa valor acima do que Decimal(14, 2) comporta", () => {
      assert.equal(ehRespostaCelebracoes(payload({ valor: "999999999999.00" })), true);
      assert.equal(ehRespostaCelebracoes(payload({ valor: "9999999999999.00" })), false);
    });

    it("aceita zero explícito — que é diferente de ausência", () => {
      assert.equal(ehRespostaCelebracoes(payload({ valor: "0.00" })), true);
    });
  });

  describe("imovelRef", () => {
    it("aceita texto e aceita null", () => {
      assert.equal(ehRespostaCelebracoes(payload({ imovelRef: "AP-1203" })), true);
      assert.equal(ehRespostaCelebracoes(payload({ imovelRef: "Casa 7, Jardim Europa" })), true);
      assert.equal(ehRespostaCelebracoes(payload({ imovelRef: null })), true);
    });

    it("recusa tipo indevido", () => {
      for (const invalido of [7, true, {}, [], ["AP-1"]]) {
        assert.equal(ehRespostaCelebracoes(payload({ imovelRef: invalido })), false, String(invalido));
      }
    });

    it("recusa branco — o servidor converte ausência em null antes de enviar", () => {
      // Um branco chegando aqui significa que o payload não veio deste servidor,
      // e ele desenharia um bloco de imóvel vazio no meio da celebração.
      assert.equal(ehRespostaCelebracoes(payload({ imovelRef: "" })), false);
      assert.equal(ehRespostaCelebracoes(payload({ imovelRef: "   " })), false);
    });

    it("recusa a chave ausente", () => {
      // O contrato é `string | null` com a chave sempre presente: `undefined`
      // seria uma terceira possibilidade que o cliente não espera distinguir.
      const semChave = {
        celebracoes: [
          {
            id: "ce-1",
            criadoEm: "2026-08-16T14:05:09.123Z",
            valor: "900000.00",
            participantes: [{ ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" }],
          },
        ],
      };

      assert.equal(ehRespostaCelebracoes(semChave), false);
    });
  });

  describe("participantes", () => {
    it("recusa participantes que não são array", () => {
      assert.equal(ehRespostaCelebracoes(payload({ participantes: {} })), false);
      assert.equal(ehRespostaCelebracoes(payload({ participantes: null })), false);
      assert.equal(ehRespostaCelebracoes(payload({ participantes: "Maria" })), false);
    });

    it("recusa elenco vazio", () => {
      // "É VENDA!" com ninguém embaixo é pior do que não comemorar — e o
      // servidor só publica celebração cujo lançamento tem participação.
      assert.equal(ehRespostaCelebracoes(payload({ participantes: [] })), false);
    });

    it("recusa ordem que não é inteiro positivo", () => {
      for (const ordem of [0, -1, 1.5, "1", null, undefined, NaN]) {
        assert.equal(
          ehRespostaCelebracoes(
            payload({ participantes: [{ ordem, corretorNome: "Maria", equipeNome: "Equipe" }] }),
          ),
          false,
          String(ordem),
        );
      }
    });

    it("recusa nomes vazios ou ausentes", () => {
      const casos = [
        { ordem: 1, corretorNome: "", equipeNome: "Equipe Suellen" },
        { ordem: 1, corretorNome: "Maria", equipeNome: "" },
        { ordem: 1, equipeNome: "Equipe Suellen" },
        { ordem: 1, corretorNome: "Maria" },
        { ordem: 1, corretorNome: 7, equipeNome: "Equipe Suellen" },
        { ordem: 1, corretorNome: "Maria", equipeNome: null },
      ];

      for (const participante of casos) {
        assert.equal(ehRespostaCelebracoes(payload({ participantes: [participante] })), false);
      }
    });

    it("um participante ruim derruba o payload inteiro", () => {
      // Aproveitar "as partes boas" deixaria a TV comemorar uma venda com
      // metade do elenco.
      assert.equal(
        ehRespostaCelebracoes(
          payload({
            participantes: [
              { ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" },
              { ordem: 2, corretorNome: "", equipeNome: "Equipe Lena" },
            ],
          }),
        ),
        false,
      );
    });

    it("recusa participante que não é objeto", () => {
      assert.equal(ehRespostaCelebracoes(payload({ participantes: ["Maria"] })), false);
      assert.equal(ehRespostaCelebracoes(payload({ participantes: [null] })), false);
    });
  });

  it("uma celebração ruim derruba o payload inteiro, não só ela", () => {
    const misto = {
      celebracoes: [
        {
          id: "boa",
          criadoEm: "2026-08-16T14:05:09.123Z",
          valor: "900000.00",
          participantes: [{ ordem: 1, corretorNome: "Maria", equipeNome: "Equipe Suellen" }],
        },
        { id: "ruim", criadoEm: "ontem", valor: "x", participantes: [] },
      ],
    };

    assert.equal(ehRespostaCelebracoes(misto), false);
  });
});
