import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deDataCivil, formatarDataBR, hojeEmSaoPaulo, paraDataCivil } from "@/lib/datas";

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
