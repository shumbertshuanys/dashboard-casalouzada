import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deDataCivil } from "@/lib/datas";
import {
  ehCompetenciaDuplicada,
  ehIdVgvHistoricoValido,
  interpretarCompetencia,
  MENSAGEM_COMPETENCIA_DUPLICADA,
  validarVgvHistoricoMensal,
} from "@/lib/validacao/vgv-historico-mensal";

/**
 * Validação do VGV histórico mensal.
 *
 * O que se prova aqui é a fronteira entre o formulário e o domínio: competência
 * em `YYYY-MM` que só aceita mês **passado**, dinheiro canônico e exato, e
 * duplicidade que continua sendo do banco. Nada aqui calcula VGV — o consumo
 * pelo trimestral/anual não existe ainda.
 */

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

/** Instante que cai em 15 de agosto de 2026 em São Paulo. */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

const VALIDO = { competencia: "2026-07", valorTotal: "4.500.000,00" };

describe("interpretarCompetencia — forma YYYY-MM", () => {
  it("1. competência passada válida vira o primeiro dia do mês", () => {
    const data = interpretarCompetencia("2026-07");
    assert.notEqual(data, null);
    assert.equal(deDataCivil(data as Date), "2026-07-01");
  });

  it("2. primeiro mês do ano", () => {
    assert.equal(deDataCivil(interpretarCompetencia("2026-01") as Date), "2026-01-01");
  });

  it("3. dezembro de ano anterior", () => {
    assert.equal(deDataCivil(interpretarCompetencia("2025-12") as Date), "2025-12-01");
  });

  it("4. vazio é recusado", () => {
    assert.equal(interpretarCompetencia(""), null);
  });

  it("5. YYYY-M é recusado", () => {
    assert.equal(interpretarCompetencia("2026-1"), null);
  });

  it("6. YY-MM é recusado", () => {
    assert.equal(interpretarCompetencia("26-07"), null);
  });

  it("7. separador incorreto é recusado", () => {
    assert.equal(interpretarCompetencia("2026/07"), null);
    assert.equal(interpretarCompetencia("2026.07"), null);
    assert.equal(interpretarCompetencia("202607"), null);
  });

  it("8. mês 00 é recusado", () => {
    assert.equal(interpretarCompetencia("2026-00"), null);
  });

  it("9. mês 13 é recusado", () => {
    assert.equal(interpretarCompetencia("2026-13"), null);
  });

  it("texto e não-string são recusados", () => {
    assert.equal(interpretarCompetencia("julho"), null);
    assert.equal(interpretarCompetencia("2026-07-01"), null);
    assert.equal(interpretarCompetencia(null), null);
    assert.equal(interpretarCompetencia(7), null);
    assert.equal(interpretarCompetencia(undefined), null);
  });

  it("não depende do fuso da máquina: sempre meia-noite UTC", () => {
    const data = interpretarCompetencia("2026-07") as Date;
    assert.equal(data.toISOString(), "2026-07-01T00:00:00.000Z");
  });
});

describe("regra temporal — só mês anterior ao corrente", () => {
  it("mês passado é aceito", () => {
    const r = validarVgvHistoricoMensal(formulario(VALIDO), AGORA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(deDataCivil(r.dados.competencia), "2026-07-01");
  });

  it("10. mês corrente é rejeitado", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, competencia: "2026-08" }), AGORA);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.erros.competencia ?? "", /encerrad|passad|anterior/i);
  });

  it("11. mês futuro no mesmo ano é rejeitado", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, competencia: "2026-09" }), AGORA);
    assert.equal(r.ok, false);
  });

  it("12. mês futuro em ano posterior é rejeitado", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, competencia: "2027-01" }), AGORA);
    assert.equal(r.ok, false);
  });

  it("dezembro do ano anterior é aceito", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, competencia: "2025-12" }), AGORA);
    assert.equal(r.ok, true);
  });

  it("13. a fronteira de mês segue São Paulo, não UTC", () => {
    // 1º de setembro às 02:00 UTC ainda é 31 de agosto no escritório: agosto
    // continua sendo o mês corrente e, portanto, ainda não é cadastrável.
    const aindaAgosto = new Date("2026-09-01T02:00:00.000Z");
    const cedo = validarVgvHistoricoMensal(
      formulario({ ...VALIDO, competencia: "2026-08" }),
      aindaAgosto,
    );
    assert.equal(cedo.ok, false, "agosto ainda é o mês corrente em São Paulo");

    // Uma hora depois já é setembro no escritório, e agosto virou passado.
    const jaSetembro = new Date("2026-09-01T03:00:00.000Z");
    const tarde = validarVgvHistoricoMensal(
      formulario({ ...VALIDO, competencia: "2026-08" }),
      jaSetembro,
    );
    assert.equal(tarde.ok, true, "em setembro, agosto já é competência fechada");
  });
});

describe("valor", () => {
  it("14/15. valor BR válido vira string decimal canônica", () => {
    const r = validarVgvHistoricoMensal(formulario(VALIDO), AGORA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.valorTotal, "4500000.00");
  });

  it("aceita as demais formas que o normalizador vigente reconhece", () => {
    const casos: [string, string][] = [
      ["4500000,00", "4500000.00"],
      ["4500000.00", "4500000.00"],
      ["1.500", "1500.00"],
      ["900000", "900000.00"],
    ];
    for (const [bruto, canonico] of casos) {
      const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, valorTotal: bruto }), AGORA);
      assert.equal(r.ok, true, bruto);
      if (!r.ok) continue;
      assert.equal(r.dados.valorTotal, canonico, bruto);
    }
  });

  it("16. valor vazio é rejeitado", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, valorTotal: "" }), AGORA);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.erros.valorTotal ?? "", /informe/i);
  });

  it("17. valor zero é rejeitado — ausência não se representa com zero", () => {
    for (const zero of ["0", "0,00", "0.00", "000,00"]) {
      const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, valorTotal: zero }), AGORA);
      assert.equal(r.ok, false, zero);
      if (r.ok) continue;
      assert.match(r.erros.valorTotal ?? "", /maior que zero/i, zero);
    }
  });

  it("18. valor inválido é rejeitado, inclusive negativo", () => {
    for (const ruim of ["abc", "1,234", "1.5000", "-100", "R$ 100,00", "10,,00"]) {
      const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, valorTotal: ruim }), AGORA);
      assert.equal(r.ok, false, ruim);
    }
  });

  it("dinheiro nunca passa por Number", () => {
    const r = validarVgvHistoricoMensal(
      formulario({ ...VALIDO, valorTotal: "999999999999,99" }),
      AGORA,
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    // Um double perderia centavos neste topo de faixa; a string não.
    assert.equal(r.dados.valorTotal, "999999999999.99");
  });
});

describe("observação", () => {
  it("19. vazia vira null", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, observacao: "" }), AGORA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.observacao, null);
  });

  it("ausente vira null", () => {
    const r = validarVgvHistoricoMensal(formulario(VALIDO), AGORA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.observacao, null);
  });

  it("20. espaços em volta são aparados", () => {
    const r = validarVgvHistoricoMensal(
      formulario({ ...VALIDO, observacao: "  relatório de fechamento  " }),
      AGORA,
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.observacao, "relatório de fechamento");
  });

  it("só espaços vira null, não string vazia", () => {
    const r = validarVgvHistoricoMensal(formulario({ ...VALIDO, observacao: "   " }), AGORA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.observacao, null);
  });
});

describe("erros acumulam por campo", () => {
  it("competência e valor errados aparecem juntos", () => {
    const r = validarVgvHistoricoMensal(
      formulario({ competencia: "2026-13", valorTotal: "" }),
      AGORA,
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(r.erros.competencia, "competência");
    assert.ok(r.erros.valorTotal, "valor");
  });

  it("competência ausente é recusada com mensagem própria", () => {
    const r = validarVgvHistoricoMensal(formulario({ valorTotal: "1.000,00" }), AGORA);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.erros.competencia ?? "", /informe/i);
  });
});

describe("competência fixa — edição", () => {
  it("26. a competência do registro vence o que vier no formulário", () => {
    const fixa = interpretarCompetencia("2026-05") as Date;
    const r = validarVgvHistoricoMensal(
      formulario({ competencia: "2026-07", valorTotal: "1.000,00" }),
      AGORA,
      fixa,
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(deDataCivil(r.dados.competencia), "2026-05-01");
  });

  it("com competência fixa, um formulário sem o campo continua válido", () => {
    const fixa = interpretarCompetencia("2026-05") as Date;
    const r = validarVgvHistoricoMensal(formulario({ valorTotal: "1.000,00" }), AGORA, fixa);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(deDataCivil(r.dados.competencia), "2026-05-01");
  });

  it("com competência fixa, o valor continua sendo validado", () => {
    const fixa = interpretarCompetencia("2026-05") as Date;
    const r = validarVgvHistoricoMensal(formulario({ valorTotal: "0" }), AGORA, fixa);
    assert.equal(r.ok, false);
  });
});

describe("ehIdVgvHistoricoValido", () => {
  it("21. aceita UUID canônico", () => {
    assert.equal(ehIdVgvHistoricoValido("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
    assert.equal(ehIdVgvHistoricoValido("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), true);
  });

  it("22. recusa o que não é UUID", () => {
    for (const ruim of [
      "",
      "3f2504e0-4f89-41d3-9a0c",
      "3f2504e0-4f89-41d3-9a0c-0305e82c330z",
      "não-é-uuid",
      null,
      undefined,
      42,
      {},
    ]) {
      assert.equal(ehIdVgvHistoricoValido(ruim), false, JSON.stringify(ruim));
    }
  });
});

describe("ehCompetenciaDuplicada", () => {
  it("23. reconhece o P2002 da competência", () => {
    assert.equal(ehCompetenciaDuplicada({ code: "P2002", meta: { target: ["competencia"] } }), true);
    assert.equal(
      ehCompetenciaDuplicada({
        code: "P2002",
        meta: { target: "vgv_historico_mensal_competencia_key" },
      }),
      true,
    );
    // Alvo ausente: a tabela tem um único índice único, o de competência.
    assert.equal(ehCompetenciaDuplicada({ code: "P2002" }), true);
  });

  it("24. ignora erro que não é P2002", () => {
    assert.equal(ehCompetenciaDuplicada({ code: "P2025" }), false);
    assert.equal(ehCompetenciaDuplicada(new Error("conexão recusada")), false);
    assert.equal(ehCompetenciaDuplicada(null), false);
    assert.equal(ehCompetenciaDuplicada(undefined), false);
    assert.equal(ehCompetenciaDuplicada("P2002"), false);
  });

  it("25. P2002 de alvo incompatível não é duplicidade de competência", () => {
    assert.equal(ehCompetenciaDuplicada({ code: "P2002", meta: { target: ["email"] } }), false);
    assert.equal(ehCompetenciaDuplicada({ code: "P2002", meta: { target: ["tipo"] } }), false);
    assert.equal(
      ehCompetenciaDuplicada({ code: "P2002", meta: { target: "usuarios_email_key" } }),
      false,
    );
  });

  it("a mensagem é operacional e nomeia a competência", () => {
    assert.match(MENSAGEM_COMPETENCIA_DUPLICADA, /compet/i);
  });
});
