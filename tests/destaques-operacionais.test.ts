import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  MAXIMO_DESTAQUES,
  type PropostaOperacional,
  type ReservaOperacional,
  selecionarPropostasEmAndamento,
  selecionarReservasAtivas,
} from "@/lib/metricas";
import { DURACAO_TELA, proximaTela, TELAS } from "@/components/painel/rotacao-faixa";

/**
 * A seleção das listas operacionais da Tela B (DEC-055, DEC-056).
 *
 * Estas listas **não são métrica** (DEC-014): não têm recorte de mês, não entram
 * em total nenhum, e uma lista vazia é dado legítimo. O que se prova aqui é a
 * regra de produto inteira — quais status entram, em que ordem e quantos cabem —,
 * que mora no núcleo e em lugar nenhum mais (DEC-013).
 */

/** Carimbo padrão: o desempate por `criadoEm` só entra quando o teste o move. */
const CRIADO = new Date("2026-08-10T12:00:00.000Z");

function proposta(
  id: string,
  status: PropostaOperacional["status"],
  dia: string,
  extras: Partial<PropostaOperacional> = {},
): PropostaOperacional {
  return {
    id,
    status,
    imovelRef: `AP-${id}`,
    corretorNome: `Corretor ${id}`,
    dataReferencia: paraDataCivil(dia),
    criadoEm: CRIADO,
    ...extras,
  };
}

function reserva(
  id: string,
  status: ReservaOperacional["status"],
  dia: string,
  extras: Partial<ReservaOperacional> = {},
): ReservaOperacional {
  return {
    id,
    status,
    imovelRef: `CA-${id}`,
    corretorNome: `Corretor ${id}`,
    dataReferencia: paraDataCivil(dia),
    criadoEm: CRIADO,
    ...extras,
  };
}

const ids = (destaques: readonly { id: string }[]) => destaques.map((item) => item.id);

describe("propostas em andamento — só AGUARDANDO (DEC-053)", () => {
  it("aceita AGUARDANDO", () => {
    const lista = selecionarPropostasEmAndamento([proposta("a", "AGUARDANDO", "2026-08-10")]);
    assert.deepEqual(ids(lista), ["a"]);
  });

  it("recusa ACEITA e REJEITADA", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("a", "ACEITA", "2026-08-12"),
      proposta("b", "REJEITADA", "2026-08-11"),
      proposta("c", "AGUARDANDO", "2026-08-10"),
    ]);
    // As duas primeiras são mais recentes; ainda assim ficam de fora.
    assert.deepEqual(ids(lista), ["c"]);
  });

  it("corta em três, mantendo as mais recentes", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("a", "AGUARDANDO", "2026-08-01"),
      proposta("b", "AGUARDANDO", "2026-08-02"),
      proposta("c", "AGUARDANDO", "2026-08-03"),
      proposta("d", "AGUARDANDO", "2026-08-04"),
      proposta("e", "AGUARDANDO", "2026-08-05"),
    ]);

    assert.equal(lista.length, MAXIMO_DESTAQUES);
    assert.deepEqual(ids(lista), ["e", "d", "c"]);
  });

  it("ordena por data decrescente", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("velha", "AGUARDANDO", "2026-07-01"),
      proposta("nova", "AGUARDANDO", "2026-08-20"),
      proposta("media", "AGUARDANDO", "2026-08-01"),
    ]);
    assert.deepEqual(ids(lista), ["nova", "media", "velha"]);
  });

  it("no mesmo dia, `criadoEm` mais recente vem antes", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("cedo", "AGUARDANDO", "2026-08-10", {
        criadoEm: new Date("2026-08-10T08:00:00.000Z"),
      }),
      proposta("tarde", "AGUARDANDO", "2026-08-10", {
        criadoEm: new Date("2026-08-10T18:00:00.000Z"),
      }),
    ]);
    assert.deepEqual(ids(lista), ["tarde", "cedo"]);
  });

  it("empatadas em data e criação, o `id` desempata de forma determinística", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("zz", "AGUARDANDO", "2026-08-10"),
      proposta("aa", "AGUARDANDO", "2026-08-10"),
      proposta("mm", "AGUARDANDO", "2026-08-10"),
    ]);
    // Sem este desempate, a TV poderia trocar a ordem a cada atualização.
    assert.deepEqual(ids(lista), ["aa", "mm", "zz"]);
  });

  it("a proposta legada sem imóvel continua selecionada (DEC-053)", () => {
    const lista = selecionarPropostasEmAndamento([
      proposta("legada", "AGUARDANDO", "2026-08-10", { imovelRef: null }),
    ]);

    assert.deepEqual(ids(lista), ["legada"]);
    assert.equal(lista[0].imovelRef, null, "o núcleo não inventa texto; quem decide é a tela");
  });

  it("sem candidatas, devolve lista vazia — não é erro nem ausência", () => {
    assert.deepEqual(selecionarPropostasEmAndamento([]), []);
  });

  it("não muda a lista recebida", () => {
    const candidatas = [
      proposta("a", "AGUARDANDO", "2026-08-01"),
      proposta("b", "AGUARDANDO", "2026-08-05"),
    ];
    const copia = candidatas.map((item) => ({ ...item }));

    selecionarPropostasEmAndamento(candidatas);
    assert.deepEqual(candidatas, copia);
  });

  it("devolve só imóvel, corretor e id — nada de status, valor ou data", () => {
    const [item] = selecionarPropostasEmAndamento([proposta("a", "AGUARDANDO", "2026-08-10")]);
    assert.deepEqual(Object.keys(item).sort(), ["corretorNome", "id", "imovelRef"]);
  });
});

describe("reservas de locação — só ATIVA (DEC-055)", () => {
  it("aceita ATIVA", () => {
    const lista = selecionarReservasAtivas([reserva("a", "ATIVA", "2026-08-10")]);
    assert.deepEqual(ids(lista), ["a"]);
  });

  it("recusa FINALIZADA e CANCELADA", () => {
    const lista = selecionarReservasAtivas([
      reserva("a", "FINALIZADA", "2026-08-12"),
      reserva("b", "CANCELADA", "2026-08-11"),
      reserva("c", "ATIVA", "2026-08-10"),
    ]);
    assert.deepEqual(ids(lista), ["c"]);
  });

  it("corta em três, mantendo as mais recentes", () => {
    const lista = selecionarReservasAtivas([
      reserva("a", "ATIVA", "2026-08-01"),
      reserva("b", "ATIVA", "2026-08-02"),
      reserva("c", "ATIVA", "2026-08-03"),
      reserva("d", "ATIVA", "2026-08-04"),
    ]);

    assert.equal(lista.length, MAXIMO_DESTAQUES);
    assert.deepEqual(ids(lista), ["d", "c", "b"]);
  });

  it("usa a mesma ordenação das propostas", () => {
    const lista = selecionarReservasAtivas([
      reserva("zz", "ATIVA", "2026-08-10"),
      reserva("aa", "ATIVA", "2026-08-10"),
      reserva("tarde", "ATIVA", "2026-08-10", {
        criadoEm: new Date("2026-08-10T20:00:00.000Z"),
      }),
    ]);
    assert.deepEqual(ids(lista), ["tarde", "aa", "zz"]);
  });

  it("sem candidatas, devolve lista vazia", () => {
    assert.deepEqual(selecionarReservasAtivas([]), []);
  });

  it("não muda a lista recebida", () => {
    const candidatas = [reserva("a", "ATIVA", "2026-08-01"), reserva("b", "ATIVA", "2026-08-05")];
    const copia = candidatas.map((item) => ({ ...item }));

    selecionarReservasAtivas(candidatas);
    assert.deepEqual(candidatas, copia);
  });
});

/**
 * A rotação A/B, provada pela função pura que a governa.
 *
 * O timer em si não é testável sem navegador, e não se finge que é: o que se
 * prova aqui é que existem **exatamente duas** telas e que a sucessão é total e
 * cíclica. Nenhuma biblioteca de render foi acrescentada para isto (DEC-056).
 */
describe("rotação da faixa superior (DEC-056)", () => {
  it("são exatamente duas telas", () => {
    assert.deepEqual([...TELAS], ["A", "B"]);
    assert.equal(new Set(TELAS).size, 2);
  });

  it("cada tela dura 20 segundos", () => {
    assert.equal(DURACAO_TELA, 20_000);
  });

  it("de A vem B, e de B vem A", () => {
    assert.equal(proximaTela("A"), "B");
    assert.equal(proximaTela("B"), "A");
  });

  it("o ciclo fecha em duas trocas e nunca produz uma terceira tela", () => {
    let atual: (typeof TELAS)[number] = "A";
    const visitadas = new Set<string>();

    for (let passo = 0; passo < 10; passo += 1) {
      visitadas.add(atual);
      atual = proximaTela(atual);
    }

    assert.deepEqual([...visitadas].sort(), ["A", "B"]);
    assert.equal(proximaTela(proximaTela("A")), "A", "duas trocas voltam ao começo");
  });
});
