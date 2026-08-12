import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anoCorrente,
  deDataCivil,
  formatarDataBR,
  hojeEmSaoPaulo,
  type JanelaCivil,
  mesCorrente,
  paraDataCivil,
  trimestreCorrente,
} from "@/lib/datas";

describe("paraDataCivil", () => {
  it("aceita datas civis válidas e ancora na meia-noite UTC", () => {
    for (const valor of ["2026-01-01", "2024-02-29", "2026-12-31"]) {
      const data = paraDataCivil(valor);
      assert.equal(data.toISOString(), `${valor}T00:00:00.000Z`);
    }
  });

  it("recusa formato fora de YYYY-MM-DD", () => {
    for (const valor of ["", "01/03/2026", "2026-3-1", "2026-03-01T00:00:00Z", "abc"]) {
      assert.throws(() => paraDataCivil(valor), /Data civil inválida/);
    }
  });

  it("recusa dia que não existe no calendário", () => {
    for (const valor of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-04-31"]) {
      assert.throws(() => paraDataCivil(valor), /inexistente no calendário/);
    }
  });

  it("recusa ano de dois dígitos disfarçado de quatro", () => {
    // `Date.UTC(26, ...)` viraria 1926 calado.
    assert.throws(() => paraDataCivil("0026-01-01"), /inexistente no calendário/);
  });
});

describe("deDataCivil", () => {
  it("fecha o round-trip", () => {
    for (const valor of ["2026-01-01", "2024-02-29", "2026-12-31", "2026-07-15"]) {
      assert.equal(deDataCivil(paraDataCivil(valor)), valor);
    }
  });

  it("lê por getters UTC, não pelo fuso da máquina", () => {
    // 23h em São Paulo no dia 1º já é dia 2 em UTC. A data civil é a UTC.
    assert.equal(deDataCivil(new Date("2026-03-02T02:00:00.000Z")), "2026-03-02");
  });
});

describe("formatarDataBR", () => {
  it("formata como dd/mm/aaaa", () => {
    assert.equal(formatarDataBR(paraDataCivil("2026-03-01")), "01/03/2026");
    assert.equal(formatarDataBR(paraDataCivil("2024-02-29")), "29/02/2024");
    assert.equal(formatarDataBR(paraDataCivil("2026-12-31")), "31/12/2026");
  });
});

describe("hojeEmSaoPaulo", () => {
  it("usa o dia do escritório, não o do UTC", () => {
    // 02:30Z ainda é 23:30 do dia anterior em São Paulo (UTC-3).
    assert.equal(hojeEmSaoPaulo(new Date("2026-03-01T02:30:00.000Z")), "2026-02-28");
    assert.equal(hojeEmSaoPaulo(new Date("2026-03-01T03:30:00.000Z")), "2026-03-01");
  });

  it("vira o ano no instante certo", () => {
    assert.equal(hojeEmSaoPaulo(new Date("2027-01-01T02:59:59.000Z")), "2026-12-31");
    assert.equal(hojeEmSaoPaulo(new Date("2027-01-01T03:00:00.000Z")), "2027-01-01");
  });

  it("devolve algo no formato canônico sem argumento", () => {
    assert.match(hojeEmSaoPaulo(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * Um instante que cai no dia civil pedido em São Paulo. 15:00Z fica dentro do
 * mesmo dia civil tanto em UTC-3 quanto em UTC-2 — é 12:00 num offset e 13:00
 * no outro —, então estes testes não dependem do offset aplicável naquele dia.
 */
function instanteSeguroNoDiaEmSaoPaulo(diaCivil: string): Date {
  return new Date(`${diaCivil}T15:00:00.000Z`);
}

/** Compara a janela pelos dois limites de uma vez, em ISO. */
function assertJanela(janela: JanelaCivil, inicio: string, fimExclusivo: string): void {
  assert.equal(janela.inicio.toISOString(), `${inicio}T00:00:00.000Z`);
  assert.equal(janela.fimExclusivo.toISOString(), `${fimExclusivo}T00:00:00.000Z`);
}

describe("mesCorrente", () => {
  it("pega o mês civil de uma data no meio do mês", () => {
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-08-15")), "2026-08-01", "2026-09-01");
  });

  it("inclui o próprio primeiro dia do mês", () => {
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-08-01")), "2026-08-01", "2026-09-01");
  });

  it("ainda está no mês no último dia", () => {
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-08-31")), "2026-08-01", "2026-09-01");
  });

  it("vira o ano em dezembro", () => {
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-12-17")), "2026-12-01", "2027-01-01");
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-12-31")), "2026-12-01", "2027-01-01");
  });

  it("fecha fevereiro no dia certo, bissexto ou não", () => {
    // O fim exclusivo é 1º de março nos dois casos: não se calcula "dia 28" nem
    // "dia 29", justamente para não errar de quatro em quatro anos.
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2024-02-29")), "2024-02-01", "2024-03-01");
    assertJanela(mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-02-28")), "2026-02-01", "2026-03-01");
  });
});

describe("trimestreCorrente", () => {
  it("agrupa jan, fev e mar no Q1", () => {
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-01-01")), "2026-01-01", "2026-04-01");
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-02-15")), "2026-01-01", "2026-04-01");
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-03-31")), "2026-01-01", "2026-04-01");
  });

  it("agrupa abr, mai e jun no Q2", () => {
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-04-01")), "2026-04-01", "2026-07-01");
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-06-30")), "2026-04-01", "2026-07-01");
  });

  it("agrupa jul, ago e set no Q3", () => {
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-07-01")), "2026-07-01", "2026-10-01");
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-09-30")), "2026-07-01", "2026-10-01");
  });

  it("agrupa out, nov e dez no Q4, virando para janeiro seguinte", () => {
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-10-01")), "2026-10-01", "2027-01-01");
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-12-31")), "2026-10-01", "2027-01-01");
  });

  it("é trimestre civil, não móvel", () => {
    // Trimestre móvel devolveria [2026-05-01, 2026-08-01) para 31 de julho.
    assertJanela(trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-07-31")), "2026-07-01", "2026-10-01");
  });
});

describe("anoCorrente", () => {
  it("cobre o ano civil inteiro, do primeiro ao último dia", () => {
    for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
      assertJanela(anoCorrente(instanteSeguroNoDiaEmSaoPaulo(dia)), "2026-01-01", "2027-01-01");
    }
  });
});

describe("janelas civis no fuso de São Paulo", () => {
  it("02:30Z de 1º de março ainda é fevereiro para o escritório", () => {
    // Mesmo instante do teste de `hojeEmSaoPaulo`: 23:30 do dia 28 em SP.
    const virada = new Date("2026-03-01T02:30:00.000Z");
    assertJanela(mesCorrente(virada), "2026-02-01", "2026-03-01");
    assertJanela(trimestreCorrente(virada), "2026-01-01", "2026-04-01");
    assertJanela(anoCorrente(virada), "2026-01-01", "2027-01-01");
  });

  it("03:00Z do mesmo dia já é março", () => {
    const depois = new Date("2026-03-01T03:30:00.000Z");
    assertJanela(mesCorrente(depois), "2026-03-01", "2026-04-01");
    assertJanela(trimestreCorrente(depois), "2026-01-01", "2026-04-01");
  });

  it("02:59:59Z de 1º de janeiro ainda é o ano anterior", () => {
    const reveillon = new Date("2027-01-01T02:59:59.000Z");
    assertJanela(anoCorrente(reveillon), "2026-01-01", "2027-01-01");
    assertJanela(mesCorrente(reveillon), "2026-12-01", "2027-01-01");
    assertJanela(trimestreCorrente(reveillon), "2026-10-01", "2027-01-01");
  });

  it("03:00:00Z de 1º de janeiro já é o ano novo", () => {
    const anoNovo = new Date("2027-01-01T03:00:00.000Z");
    assertJanela(anoCorrente(anoNovo), "2027-01-01", "2028-01-01");
    assertJanela(mesCorrente(anoNovo), "2027-01-01", "2027-02-01");
    assertJanela(trimestreCorrente(anoNovo), "2027-01-01", "2027-04-01");
  });
});

describe("contrato do intervalo semiaberto", () => {
  const agora = instanteSeguroNoDiaEmSaoPaulo("2026-08-15");

  it("começa na meia-noite UTC e termina na meia-noite UTC", () => {
    for (const janela of [mesCorrente(agora), trimestreCorrente(agora), anoCorrente(agora)]) {
      assert.match(janela.inicio.toISOString(), /T00:00:00\.000Z$/);
      assert.match(janela.fimExclusivo.toISOString(), /T00:00:00\.000Z$/);
      assert.ok(janela.inicio < janela.fimExclusivo, "início precede o fim");
    }
  });

  it("inclui o primeiro dia e exclui o dia do fim", () => {
    const mes = mesCorrente(agora);

    // Limite de baixo: inclusivo.
    assert.ok(paraDataCivil("2026-08-01") >= mes.inicio);
    assert.ok(paraDataCivil("2026-08-01") < mes.fimExclusivo);

    // Último dia do mês: dentro.
    assert.ok(paraDataCivil("2026-08-31") < mes.fimExclusivo);

    // Primeiro dia do mês seguinte: fora, e é exatamente o fim.
    assert.equal(paraDataCivil("2026-09-01").getTime(), mes.fimExclusivo.getTime());
    assert.equal(paraDataCivil("2026-09-01") < mes.fimExclusivo, false);

    // Véspera: fora por baixo.
    assert.equal(paraDataCivil("2026-07-31") >= mes.inicio, false);
  });

  it("as janelas se encaixam sem buraco e sem sobreposição na virada", () => {
    // O fim de agosto é o começo de setembro, não "um instante antes".
    assert.equal(
      mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-08-15")).fimExclusivo.getTime(),
      mesCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-09-15")).inicio.getTime(),
    );
    assert.equal(
      trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-09-15")).fimExclusivo.getTime(),
      trimestreCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-10-15")).inicio.getTime(),
    );
    assert.equal(
      anoCorrente(instanteSeguroNoDiaEmSaoPaulo("2026-06-15")).fimExclusivo.getTime(),
      anoCorrente(instanteSeguroNoDiaEmSaoPaulo("2027-06-15")).inicio.getTime(),
    );
  });

  it("o mês cabe dentro do trimestre, que cabe dentro do ano", () => {
    const mes = mesCorrente(agora);
    const trimestre = trimestreCorrente(agora);
    const ano = anoCorrente(agora);

    assert.ok(trimestre.inicio <= mes.inicio && mes.fimExclusivo <= trimestre.fimExclusivo);
    assert.ok(ano.inicio <= trimestre.inicio && trimestre.fimExclusivo <= ano.fimExclusivo);
  });

  it("sem argumento, usa o relógio e devolve uma janela coerente", () => {
    const mes = mesCorrente();
    assert.match(deDataCivil(mes.inicio), /^\d{4}-\d{2}-01$/);
    assert.ok(mes.inicio < mes.fimExclusivo);
  });
});
