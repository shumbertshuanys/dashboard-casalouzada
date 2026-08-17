import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  type PropostaOperacional,
  type ReservaOperacional,
  selecionarPropostasEmAndamento,
  selecionarReservasAtivas,
} from "@/lib/metricas";
import {
  avancarRotacao,
  DURACAO_TELA,
  ITENS_POR_PAGINA,
  janelaOperacional,
  paginaCircular,
  proximaTela,
  ROTACAO_INICIAL,
  TELAS,
} from "@/components/painel/rotacao-faixa";

/**
 * A seleção das listas operacionais da Tela B (DEC-055, DEC-056).
 *
 * Estas listas **não são métrica** (DEC-014): não têm recorte de mês, não entram
 * em total nenhum, e uma lista vazia é dado legítimo. O que se prova aqui é a
 * regra de produto — quais status entram e em que ordem —, que mora no núcleo e
 * em lugar nenhum mais (DEC-013).
 *
 * Quantos itens *aparecem de cada vez* já não é decidido aqui: o núcleo entrega
 * todos os elegíveis, e a paginação da faixa escolhe a janela visível.
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

  it("devolve todas as elegíveis, e não só as três primeiras", () => {
    const dias = ["01", "02", "03", "04", "05", "06", "07"];
    const lista = selecionarPropostasEmAndamento(
      dias.map((dia) => proposta(dia, "AGUARDANDO", `2026-08-${dia}`)),
    );

    // Cortar em três aqui apagaria candidatas que a faixa ainda vai mostrar na
    // próxima aparição da Tela B: quantas cabem por vez é da apresentação.
    assert.equal(lista.length, 7);
    assert.deepEqual(ids(lista), ["07", "06", "05", "04", "03", "02", "01"]);
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

  it("devolve todas as elegíveis, e não só as três primeiras", () => {
    const dias = ["01", "02", "03", "04", "05"];
    const lista = selecionarReservasAtivas(
      dias.map((dia) => reserva(dia, "ATIVA", `2026-08-${dia}`)),
    );

    assert.equal(lista.length, 5);
    assert.deepEqual(ids(lista), ["05", "04", "03", "02", "01"]);
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

/**
 * A janela de até três itens que a Tela B mostra de cada vez.
 *
 * O núcleo entrega **todos** os elegíveis; sem paginação, a parede repetiria os
 * mesmos três para sempre e os demais nunca apareceriam. Quantos cabem por vez é
 * regra de apresentação, e mora só aqui.
 */
describe("página circular da Tela B", () => {
  const ate = (quantos: number) =>
    Array.from({ length: quantos }, (_, indice) => `item ${indice + 1}`);

  it("cabem três por página", () => {
    assert.equal(ITENS_POR_PAGINA, 3);
  });

  it("sem itens, qualquer página é vazia", () => {
    assert.deepEqual(paginaCircular([], 0), []);
    assert.deepEqual(paginaCircular([], 7), []);
  });

  it("um item só ocupa a página inteira, em toda volta", () => {
    assert.deepEqual(paginaCircular(ate(1), 0), ["item 1"]);
    assert.deepEqual(paginaCircular(ate(1), 1), ["item 1"]);
  });

  it("com três itens não há segunda página — a tela fica estática", () => {
    const itens = ate(3);
    for (let pagina = 0; pagina < 5; pagina += 1) {
      assert.deepEqual(paginaCircular(itens, pagina), itens);
    }
  });

  it("com quatro itens, a segunda página traz só o quarto e a terceira volta ao começo", () => {
    const itens = ate(4);
    assert.deepEqual(paginaCircular(itens, 0), ["item 1", "item 2", "item 3"]);
    assert.deepEqual(paginaCircular(itens, 1), ["item 4"]);
    assert.deepEqual(paginaCircular(itens, 2), ["item 1", "item 2", "item 3"]);
  });

  it("com seis itens são duas páginas cheias", () => {
    const itens = ate(6);
    assert.deepEqual(paginaCircular(itens, 0), ["item 1", "item 2", "item 3"]);
    assert.deepEqual(paginaCircular(itens, 1), ["item 4", "item 5", "item 6"]);
    assert.deepEqual(paginaCircular(itens, 2), ["item 1", "item 2", "item 3"]);
  });

  it("com sete itens o ciclo é 3/3/1", () => {
    const itens = ate(7);
    assert.deepEqual(paginaCircular(itens, 0), ["item 1", "item 2", "item 3"]);
    assert.deepEqual(paginaCircular(itens, 1), ["item 4", "item 5", "item 6"]);
    assert.deepEqual(paginaCircular(itens, 2), ["item 7"]);
    assert.deepEqual(paginaCircular(itens, 3), ["item 1", "item 2", "item 3"]);
  });

  it("a última página não se completa repetindo o começo", () => {
    // Repetir "item 1" ali faria a TV mostrar a mesma proposta duas vezes na
    // mesma tela, como se fossem duas.
    assert.deepEqual(paginaCircular(ate(7), 2), ["item 7"]);
    assert.deepEqual(paginaCircular(ate(5), 1), ["item 4", "item 5"]);
  });

  it("um índice maior que o número de páginas é normalizado", () => {
    // A lista encolheu entre uma aparição e outra: o índice guardado continua
    // grande e não pode produzir uma página vazia para sempre.
    assert.deepEqual(paginaCircular(ate(4), 9), ["item 4"]);
    assert.deepEqual(paginaCircular(ate(4), 10), ["item 1", "item 2", "item 3"]);
    assert.deepEqual(paginaCircular(ate(1), 99), ["item 1"]);
  });

  it("não muda a lista recebida", () => {
    const itens = ate(7);
    const copia = [...itens];

    paginaCircular(itens, 1);
    paginaCircular(itens, 2);

    assert.deepEqual(itens, copia);
  });
});

/**
 * A janela aplicada a uma lista da Tela B inteira.
 *
 * Paginar não pode inventar estado: `INDISPONIVEL` continua indisponível, e
 * lista vazia continua vazia — os dois têm texto próprio na tela, e nenhum deles
 * é `0` (DEC-014).
 */
describe("janela de uma lista operacional", () => {
  const lista = (quantos: number) => ({
    estado: "OK" as const,
    itens: Array.from({ length: quantos }, (_, indice) => ({
      imovel: `AP-${indice + 1}`,
      corretor: `Corretor ${indice + 1}`,
    })),
  });

  it("recorta a página pedida", () => {
    const janela = janelaOperacional(lista(4), 1);

    assert.equal(janela.estado, "OK");
    assert.deepEqual(janela.estado === "OK" ? janela.itens : [], [
      { imovel: "AP-4", corretor: "Corretor 4" },
    ]);
  });

  it("lista vazia continua vazia — e não vira indisponível", () => {
    const janela = janelaOperacional(lista(0), 3);

    assert.deepEqual(janela, { estado: "OK", itens: [] });
  });

  it("indisponível atravessa intacto, em qualquer página", () => {
    assert.deepEqual(janelaOperacional({ estado: "INDISPONIVEL" }, 0), {
      estado: "INDISPONIVEL",
    });
    assert.deepEqual(janelaOperacional({ estado: "INDISPONIVEL" }, 5), {
      estado: "INDISPONIVEL",
    });
  });
});

/**
 * O avanço das páginas ao longo da rotação.
 *
 * As páginas só andam quando a Tela B **entra**. Andar na saída faria o grupo
 * mudar enquanto a tela ainda está desaparecendo; andar a cada leitura de dados
 * faria a lista pular no meio dos 20 s, que é justamente o que a regra de
 * legibilidade na TV proíbe.
 */
describe("avanço das páginas na rotação (DEC-056)", () => {
  it("começa na Tela A, antes de qualquer página", () => {
    assert.equal(ROTACAO_INICIAL.tela, "A");
  });

  it("a primeira entrada em B mostra a primeira página das duas listas", () => {
    const primeira = avancarRotacao(ROTACAO_INICIAL);

    assert.equal(primeira.tela, "B");
    assert.equal(primeira.paginaPropostas, 0);
    assert.equal(primeira.paginaReservas, 0);
  });

  it("a volta para A não mexe nas páginas", () => {
    const emB = avancarRotacao(ROTACAO_INICIAL);
    const voltaParaA = avancarRotacao(emB);

    assert.equal(voltaParaA.tela, "A");
    assert.equal(voltaParaA.paginaPropostas, emB.paginaPropostas);
    assert.equal(voltaParaA.paginaReservas, emB.paginaReservas);
  });

  it("a segunda entrada em B avança para a página seguinte", () => {
    const segunda = [0, 1, 2].reduce(avancarRotacao, ROTACAO_INICIAL);

    assert.equal(segunda.tela, "B");
    assert.equal(segunda.paginaPropostas, 1);
    assert.equal(segunda.paginaReservas, 1);
  });

  it("cada aparição de B avança exatamente uma página", () => {
    let estado = ROTACAO_INICIAL;
    const paginas: number[] = [];

    for (let passo = 0; passo < 8; passo += 1) {
      estado = avancarRotacao(estado);
      if (estado.tela === "B") paginas.push(estado.paginaPropostas);
    }

    assert.deepEqual(paginas, [0, 1, 2, 3]);
  });

  it("não muda o estado recebido", () => {
    const estado = avancarRotacao(ROTACAO_INICIAL);
    const copia = { ...estado };

    avancarRotacao(estado);

    assert.deepEqual(estado, copia);
  });

  it("as duas listas giram em ciclos próprios", () => {
    // Sete propostas dão três páginas; cinco reservas, duas. Os índices andam
    // juntos, mas cada lista fecha a própria volta.
    const propostas = Array.from({ length: 7 }, (_, indice) => `p${indice + 1}`);
    const reservas = Array.from({ length: 5 }, (_, indice) => `r${indice + 1}`);

    let estado = ROTACAO_INICIAL;
    const vistas: { propostas: string[]; reservas: string[] }[] = [];

    for (let passo = 0; passo < 8; passo += 1) {
      estado = avancarRotacao(estado);
      if (estado.tela !== "B") continue;
      vistas.push({
        propostas: paginaCircular(propostas, estado.paginaPropostas),
        reservas: paginaCircular(reservas, estado.paginaReservas),
      });
    }

    assert.deepEqual(vistas, [
      { propostas: ["p1", "p2", "p3"], reservas: ["r1", "r2", "r3"] },
      { propostas: ["p4", "p5", "p6"], reservas: ["r4", "r5"] },
      { propostas: ["p7"], reservas: ["r1", "r2", "r3"] },
      { propostas: ["p1", "p2", "p3"], reservas: ["r4", "r5"] },
    ]);
  });
});
