import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatarBRL, normalizarValorBR } from "@/lib/dinheiro";

describe("normalizarValorBR", () => {
  it("aceita as formas que aparecem na prática", () => {
    const casos: [string, string][] = [
      ["1.250.000,00", "1250000.00"],
      ["1250000,00", "1250000.00"],
      ["1250000.00", "1250000.00"],
      ["1.500", "1500.00"],
      ["1.500.000", "1500000.00"],
      ["1250000", "1250000.00"],
      ["1250000,5", "1250000.50"],
      ["1,5", "1.50"],
      ["  1.250.000,00  ", "1250000.00"],
    ];
    for (const [bruto, esperado] of casos) {
      assert.equal(normalizarValorBR(bruto), esperado, `entrada ${JSON.stringify(bruto)}`);
    }
  });

  it("recusa o que não é valor monetário representável", () => {
    for (const bruto of ["1.5000", "1,234", "abc", "-100", "", "   ", "R$ 10", "1..500", "1.50.000", "1,2,3"]) {
      assert.equal(normalizarValorBR(bruto), null, `entrada ${JSON.stringify(bruto)}`);
    }
  });

  it("respeita a capacidade de Decimal(14,2)", () => {
    // 12 dígitos inteiros cabem; 13 não.
    assert.equal(normalizarValorBR("999999999999"), "999999999999.00");
    assert.equal(normalizarValorBR("999999999999,99"), "999999999999.99");
    assert.equal(normalizarValorBR("1000000000000"), null);
    assert.equal(normalizarValorBR("1234567890123,00"), null);
  });

  it("aceita zero — a regra de valor positivo é do lançamento, não daqui", () => {
    assert.equal(normalizarValorBR("0"), "0.00");
    assert.equal(normalizarValorBR("0,00"), "0.00");
    assert.equal(normalizarValorBR("000123"), "123.00");
  });

  it("nunca devolve notação científica nem perda de centavo", () => {
    for (const bruto of ["999999999999,99", "0,01", "1.000.000,01"]) {
      const canonico = normalizarValorBR(bruto);
      assert.ok(canonico !== null);
      assert.match(canonico, /^\d+\.\d{2}$/);
    }
    // O topo do campo não sobrevive a um double; a string sobrevive.
    assert.equal(normalizarValorBR("999999999999,99"), "999999999999.99");
  });
});

describe("formatarBRL", () => {
  it("formata a canônica em real", () => {
    const casos: [string, string][] = [
      ["1250000.00", "R$ 1.250.000,00"],
      ["0.00", "R$ 0,00"],
      ["1.50", "R$ 1,50"],
      ["100.00", "R$ 100,00"],
      ["1000.00", "R$ 1.000,00"],
      ["999999999999.99", "R$ 999.999.999.999,99"],
    ];
    for (const [canonico, esperado] of casos) {
      assert.equal(formatarBRL(canonico), esperado, `entrada ${JSON.stringify(canonico)}`);
    }
  });

  it("fecha o ciclo com normalizarValorBR", () => {
    const canonico = normalizarValorBR("1.250.000,00");
    assert.ok(canonico !== null);
    assert.equal(formatarBRL(canonico), "R$ 1.250.000,00");
  });
});
