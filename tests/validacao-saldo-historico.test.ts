import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deDataCivil } from "@/lib/datas";
import {
  MAX_QUANTIDADE,
  TIPOS_SALDO_HISTORICO,
  ehIdSaldoHistoricoValido,
  ehTipoComValor,
  ehTipoDuplicado,
  interpretarTipoSaldo,
  validarSaldoHistorico,
} from "@/lib/validacao/saldo-historico";

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

const VENDA = { tipo: "VENDA", quantidade: "125", valorTotal: "1.250.000,00", dataCorte: "2026-08-12" };
const GOOGLE = { tipo: "AVALIACAO_GOOGLE", quantidade: "480", dataCorte: "2026-08-12" };

describe("tipos suportados", () => {
  it("são exatamente venda e avaliação", () => {
    assert.deepEqual([...TIPOS_SALDO_HISTORICO], ["VENDA", "AVALIACAO_GOOGLE"]);
  });

  it("aceita os dois", () => {
    assert.equal(interpretarTipoSaldo("VENDA"), "VENDA");
    assert.equal(interpretarTipoSaldo("AVALIACAO_GOOGLE"), "AVALIACAO_GOOGLE");
  });

  it("recusa os outros cinco tipos de lançamento", () => {
    // Saldo de abertura não existe para eles nesta versão.
    for (const tipo of [
      "LOCACAO",
      "CAPTACAO_VENDA",
      "CAPTACAO_EXCLUSIVA",
      "CAPTACAO_LOCACAO",
      "PROPOSTA",
    ]) {
      assert.equal(interpretarTipoSaldo(tipo), null, tipo);
    }
  });

  it("recusa texto arbitrário e não-string", () => {
    for (const valor of ["", "venda", "Venda", "abc", "1", null, undefined, {}, 7]) {
      assert.equal(interpretarTipoSaldo(valor), null, `${JSON.stringify(valor)}`);
    }
  });

  it("só venda carrega dinheiro", () => {
    assert.equal(ehTipoComValor("VENDA"), true);
    assert.equal(ehTipoComValor("AVALIACAO_GOOGLE"), false);
  });
});

describe("quantidade", () => {
  it("aceita 1 e valores normais", () => {
    for (const quantidade of ["1", "125", "99999"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade }));
      assert.equal(r.ok, true, quantidade);
      assert.equal(r.ok === true && r.dados.quantidade, Number(quantidade));
    }
  });

  it("aceita o teto do Int", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade: String(MAX_QUANTIDADE) }));
    assert.equal(r.ok === true && r.dados.quantidade, 2147483647);
  });

  it("recusa acima do teto do Int", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade: "2147483648" }));
    assert.equal(r.ok === false && r.erros.quantidade, "A quantidade informada é grande demais.");
  });

  it("recusa zero", () => {
    // Quantidade zero equivale a não ter saldo, e ausência já é a ausência da linha.
    const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade: "0" }));
    assert.equal(r.ok === false && r.erros.quantidade, "A quantidade precisa ser maior que zero.");
  });

  it("recusa negativo, decimal, texto e vazio", () => {
    for (const quantidade of ["-1", "-125", "1.5", "1,5", "abc", "", "  ", "1e3"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade }));
      assert.equal(r.ok, false, `quantidade ${JSON.stringify(quantidade)}`);
      assert.ok(r.ok === false && r.erros.quantidade);
    }
  });

  it("a mensagem do teto não cita o tipo do banco", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, quantidade: "2147483648" }));
    assert.doesNotMatch(
      r.ok === false ? (r.erros.quantidade ?? "") : "",
      /postgres|int4|integer|prisma/i,
    );
  });
});

describe("VENDA — valor", () => {
  it("aceita quantidade e valor positivos", () => {
    const r = validarSaldoHistorico(formulario(VENDA));
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.dados.quantidade, 125);
    assert.equal(r.ok === true && r.dados.valorTotal, "1250000.00");
    assert.equal(typeof (r.ok === true ? r.dados.valorTotal : null), "string");
  });

  it("recusa valor vazio", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, valorTotal: "" }));
    assert.equal(r.ok === false && r.erros.valorTotal, "Informe o valor total.");
  });

  it("recusa valor inválido", () => {
    for (const valorTotal of ["abc", "-100", "1.5000", "1,234"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, valorTotal }));
      assert.equal(r.ok === false && r.erros.valorTotal, "Valor inválido.", valorTotal);
    }
  });

  it("recusa zero em qualquer grafia", () => {
    for (const valorTotal of ["0", "0,00", "0.00", "000"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, valorTotal }));
      assert.equal(
        r.ok === false && r.erros.valorTotal,
        "O valor precisa ser maior que zero.",
        valorTotal,
      );
    }
  });

  it("guarda o topo de Decimal(14,2) como string", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, valorTotal: "999.999.999.999,99" }));
    assert.equal(r.ok === true && r.dados.valorTotal, "999999999999.99");
  });
});

describe("AVALIACAO_GOOGLE — nunca vira dinheiro", () => {
  it("aceita só com quantidade e data", () => {
    const r = validarSaldoHistorico(formulario(GOOGLE));
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.dados.quantidade, 480);
    assert.equal(r.ok === true && r.dados.valorTotal, "0.00");
  });

  it("descarta valor vindo em payload manipulado", () => {
    for (const valorTotal of ["999999,99", "1.250.000,00", "0,01", "abc"]) {
      const r = validarSaldoHistorico(formulario({ ...GOOGLE, valorTotal }));
      assert.equal(r.ok, true, `valor ${valorTotal} não deveria virar erro`);
      assert.equal(r.ok === true && r.dados.valorTotal, "0.00", `valor ${valorTotal}`);
    }
  });
});

describe("data de corte", () => {
  it("aceita data civil e ancora na meia-noite UTC", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, dataCorte: "2026-08-12" }));
    assert.equal(r.ok === true && r.dados.dataCorte.toISOString(), "2026-08-12T00:00:00.000Z");
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, dataCorte: "2024-02-29" }));
    assert.equal(r.ok === true && deDataCivil(r.dados.dataCorte), "2024-02-29");
  });

  it("recusa data inexistente", () => {
    for (const dataCorte of ["2026-02-29", "2026-02-30", "2026-13-01"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, dataCorte }));
      assert.equal(r.ok === false && r.erros.dataCorte, "Data inválida.", dataCorte);
    }
  });

  it("recusa formato inválido", () => {
    for (const dataCorte of ["12/08/2026", "2026-8-1", "ontem"]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, dataCorte }));
      assert.equal(r.ok === false && r.erros.dataCorte, "Data inválida.", dataCorte);
    }
  });

  it("é obrigatória", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, dataCorte: "" }));
    assert.equal(r.ok === false && r.erros.dataCorte, "Informe a data de corte.");
  });

  it("não recusa passado nem futuro — Q8 não aprovou esse limite", () => {
    for (const dataCorte of ["1999-01-01", "2090-12-31"]) {
      assert.equal(validarSaldoHistorico(formulario({ ...VENDA, dataCorte })).ok, true, dataCorte);
    }
  });
});

describe("descrição", () => {
  it("vazia vira null", () => {
    for (const descricao of ["", "   "]) {
      const r = validarSaldoHistorico(formulario({ ...VENDA, descricao }));
      assert.equal(r.ok === true && r.dados.descricao, null);
    }
  });

  it("é aparada quando preenchida", () => {
    const r = validarSaldoHistorico(formulario({ ...VENDA, descricao: "  saldo até 2025  " }));
    assert.equal(r.ok === true && r.dados.descricao, "saldo até 2025");
  });
});

describe("tipo fixo na edição", () => {
  it("usa o tipo passado e ignora o do formulário", () => {
    // Na edição o tipo vem do banco: trocar o tipo de um saldo transformaria
    // acumulado de vendas em avaliações.
    const r = validarSaldoHistorico(
      formulario({ tipo: "AVALIACAO_GOOGLE", quantidade: "10", valorTotal: "500,00", dataCorte: "2026-08-12" }),
      "VENDA",
    );
    assert.equal(r.ok === true && r.dados.tipo, "VENDA");
    assert.equal(r.ok === true && r.dados.valorTotal, "500.00");
  });

  it("com tipo fixo AVALIACAO_GOOGLE o valor continua zero", () => {
    const r = validarSaldoHistorico(
      formulario({ tipo: "VENDA", quantidade: "10", valorTotal: "999999,99", dataCorte: "2026-08-12" }),
      "AVALIACAO_GOOGLE",
    );
    assert.equal(r.ok === true && r.dados.tipo, "AVALIACAO_GOOGLE");
    assert.equal(r.ok === true && r.dados.valorTotal, "0.00");
  });
});

describe("ehIdSaldoHistoricoValido", () => {
  it("aceita UUID canônico", () => {
    for (const id of [
      "896d6dcd-a564-4315-86b8-3c9f1544531e",
      "D8A21455-1B8B-479E-8C10-B169189D9ED3",
    ]) {
      assert.equal(ehIdSaldoHistoricoValido(id), true, id);
    }
  });

  it("recusa o que não é UUID", () => {
    for (const id of ["", "abc", "896d6dcd-a564-4315-86b8", "'; DROP TABLE saldo_historico; --", null, 42]) {
      assert.equal(ehIdSaldoHistoricoValido(id), false, `${JSON.stringify(id)}`);
    }
  });
});

describe("ehTipoDuplicado", () => {
  it("reconhece P2002 no campo tipo", () => {
    assert.equal(ehTipoDuplicado({ code: "P2002", meta: { target: ["tipo"] } }), true);
    assert.equal(ehTipoDuplicado({ code: "P2002", meta: { target: "saldo_historico_tipo_key" } }), true);
    assert.equal(ehTipoDuplicado({ code: "P2002" }), true);
  });

  it("ignora outros erros", () => {
    assert.equal(ehTipoDuplicado({ code: "P2025" }), false);
    assert.equal(ehTipoDuplicado({ code: "P2002", meta: { target: ["email"] } }), false);
    assert.equal(ehTipoDuplicado(new Error("conexão recusada")), false);
    assert.equal(ehTipoDuplicado(null), false);
  });
});
