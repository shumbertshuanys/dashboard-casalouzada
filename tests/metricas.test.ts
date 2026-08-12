import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  calcularMetricasEmpresa,
  type LancamentoMetrica,
  type SaldoHistoricoMetrica,
  type TipoEventoMetrica,
  type TipoSaldoMetrica,
} from "@/lib/metricas";

/**
 * Instante que cai em 15 de agosto de 2026 em São Paulo — mês, trimestre e ano
 * correntes são agosto, Q3 e 2026. Os testes de fuso usam instantes próprios.
 */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

let sequencia = 0;

/** Um lançamento com o mínimo que o cálculo precisa; ids não importam aqui. */
function lancamento(
  tipo: TipoEventoMetrica,
  diaCivil: string,
  valor: string | null = null,
): LancamentoMetrica {
  sequencia += 1;
  return {
    tipo,
    corretorId: `corretor-${sequencia}`,
    equipeId: `equipe-${sequencia}`,
    dataReferencia: paraDataCivil(diaCivil),
    valor,
  };
}

function saldo(
  tipo: TipoSaldoMetrica,
  quantidade: number,
  valorTotal: string,
  dataCorte: string,
): SaldoHistoricoMetrica {
  return { tipo, quantidade, valorTotal, dataCorte: paraDataCivil(dataCorte) };
}

describe("acumulados — ausência de saldo histórico", () => {
  it("sem saldo de VENDA, vendidos e VGV acumulado ficam indisponíveis", () => {
    // Há lançamentos de venda; ainda assim não se mostra o parcial.
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-08-10", "500000.00")],
      [],
      AGORA,
    );

    assert.deepEqual(metricas.acumulados.vendidos, {
      estado: "SEM_SALDO_HISTORICO",
      valor: null,
    });
    assert.deepEqual(metricas.acumulados.vgv, { estado: "SEM_SALDO_HISTORICO", valor: null });
  });

  it("sem saldo de AVALIACAO_GOOGLE, as avaliações acumuladas ficam indisponíveis", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("AVALIACAO_GOOGLE", "2026-08-10")],
      [saldo("VENDA", 10, "1000.00", "2026-07-31")],
      AGORA,
    );

    assert.deepEqual(metricas.acumulados.avaliacoes, {
      estado: "SEM_SALDO_HISTORICO",
      valor: null,
    });
    // Faltar um saldo não contamina o outro (DEC-042).
    assert.equal(metricas.acumulados.vendidos.estado, "OK");
  });

  it("sem nenhum saldo, os três acumulados ficam indisponíveis e os períodos seguem", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-08-10", "500000.00")],
      [],
      AGORA,
    );

    assert.equal(metricas.acumulados.avaliacoes.estado, "SEM_SALDO_HISTORICO");
    assert.equal(metricas.vgvPeriodos.mensal, "500000.00");
  });
});

describe("acumulados — o corte é inclusivo no saldo", () => {
  const CORTE = "2026-06-30";
  const saldos = [saldo("VENDA", 100, "250000.00", CORTE)];

  it("sem lançamentos posteriores, o acumulado é exatamente o saldo", () => {
    const metricas = calcularMetricasEmpresa([], saldos, AGORA);

    assert.deepEqual(metricas.acumulados.vendidos, { estado: "OK", valor: 100 });
    assert.deepEqual(metricas.acumulados.vgv, { estado: "OK", valor: "250000.00" });
  });

  it("evento anterior ao corte não soma de novo", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-05-15", "900000.00")],
      saldos,
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 100);
    assert.equal(metricas.acumulados.vgv.valor, "250000.00");
  });

  it("evento exatamente no corte não soma de novo", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", CORTE, "900000.00")],
      saldos,
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 100);
    assert.equal(metricas.acumulados.vgv.valor, "250000.00");
  });

  it("evento um dia depois do corte soma", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-07-01", "900000.00")],
      saldos,
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 101);
    assert.equal(metricas.acumulados.vgv.valor, "1150000.00");
  });

  it("quantidade e valor somam vários eventos posteriores", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-07-01", "300000.00"),
        lancamento("VENDA", "2026-07-20", "150000.50"),
        lancamento("VENDA", "2026-08-10", "99999.50"),
        // Anteriores ao corte: continuam existindo, não entram no acumulado.
        lancamento("VENDA", "2026-01-05", "700000.00"),
        lancamento("VENDA", CORTE, "800000.00"),
      ],
      saldos,
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 103);
    assert.equal(metricas.acumulados.vgv.valor, "800000.00");
  });

  it("outros tipos não entram no acumulado de VENDA", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("LOCACAO", "2026-07-10", "5000.00"),
        lancamento("PROPOSTA", "2026-07-11"),
        lancamento("CAPTACAO_VENDA", "2026-07-12"),
      ],
      saldos,
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 100);
    assert.equal(metricas.acumulados.vgv.valor, "250000.00");
  });
});

describe("acumulados — cada tipo usa o próprio corte", () => {
  it("cortes diferentes recortam conjuntos diferentes", () => {
    const saldos = [
      saldo("VENDA", 10, "100000.00", "2026-03-31"),
      saldo("AVALIACAO_GOOGLE", 500, "0.00", "2026-07-15"),
    ];

    const metricas = calcularMetricasEmpresa(
      [
        // Depois do corte de VENDA, antes do corte de avaliações.
        lancamento("VENDA", "2026-05-10", "50000.00"),
        lancamento("AVALIACAO_GOOGLE", "2026-05-10"),
        // Depois dos dois cortes.
        lancamento("VENDA", "2026-08-01", "25000.00"),
        lancamento("AVALIACAO_GOOGLE", "2026-08-01"),
      ],
      saldos,
      AGORA,
    );

    // VENDA: os dois eventos são posteriores a 31/03.
    assert.equal(metricas.acumulados.vendidos.valor, 12);
    assert.equal(metricas.acumulados.vgv.valor, "175000.00");

    // Avaliações: só o de agosto é posterior a 15/07.
    assert.equal(metricas.acumulados.avaliacoes.valor, 501);
  });

  it("a contagem de avaliações soma o saldo com os eventos posteriores", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("AVALIACAO_GOOGLE", "2026-08-02"),
        lancamento("AVALIACAO_GOOGLE", "2026-08-03"),
        lancamento("AVALIACAO_GOOGLE", "2026-08-04"),
        lancamento("AVALIACAO_GOOGLE", "2026-07-31"),
      ],
      [saldo("AVALIACAO_GOOGLE", 2640, "0.00", "2026-07-31")],
      AGORA,
    );

    assert.deepEqual(metricas.acumulados.avaliacoes, { estado: "OK", valor: 2643 });
  });
});

describe("VGV por período", () => {
  const JANELA_AGOSTO = { primeiro: "2026-08-01", ultimo: "2026-08-31" };

  it("inclui o primeiro dia da janela", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", JANELA_AGOSTO.primeiro, "100000.00")],
      [],
      AGORA,
    );
    assert.equal(metricas.vgvPeriodos.mensal, "100000.00");
  });

  it("inclui o último dia civil da janela", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", JANELA_AGOSTO.ultimo, "100000.00")],
      [],
      AGORA,
    );
    assert.equal(metricas.vgvPeriodos.mensal, "100000.00");
  });

  it("exclui o primeiro dia da janela seguinte", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-09-01", "100000.00")],
      [],
      AGORA,
    );
    assert.equal(metricas.vgvPeriodos.mensal, "0.00");
    // Setembro ainda é Q3 e 2026.
    assert.equal(metricas.vgvPeriodos.trimestral, "100000.00");
    assert.equal(metricas.vgvPeriodos.anual, "100000.00");
  });

  it("separa mês, trimestre e ano corretamente", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-08-05", "1000.00"), // mês, trimestre, ano
        lancamento("VENDA", "2026-07-05", "200.00"), // trimestre e ano
        lancamento("VENDA", "2026-02-05", "30.00"), // só ano
        lancamento("VENDA", "2025-12-31", "4.00"), // nenhum
      ],
      [],
      AGORA,
    );

    assert.equal(metricas.vgvPeriodos.mensal, "1000.00");
    assert.equal(metricas.vgvPeriodos.trimestral, "1200.00");
    assert.equal(metricas.vgvPeriodos.anual, "1230.00");
  });

  it("só VENDA entra no VGV", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("LOCACAO", "2026-08-05", "7000.00"),
        lancamento("PROPOSTA", "2026-08-06"),
        lancamento("CAPTACAO_VENDA", "2026-08-07"),
      ],
      [],
      AGORA,
    );

    assert.equal(metricas.vgvPeriodos.mensal, "0.00");
    assert.equal(metricas.vgvPeriodos.anual, "0.00");
  });

  it("saldo histórico não participa de período nenhum", () => {
    const metricas = calcularMetricasEmpresa(
      [],
      [saldo("VENDA", 500, "4200000000.00", "2026-07-31")],
      AGORA,
    );

    assert.equal(metricas.vgvPeriodos.mensal, "0.00");
    assert.equal(metricas.vgvPeriodos.trimestral, "0.00");
    assert.equal(metricas.vgvPeriodos.anual, "0.00");
    // Mas o acumulado usa o saldo normalmente.
    assert.equal(metricas.acumulados.vgv.valor, "4200000000.00");
  });

  it("evento anterior ao corte continua contando no período em que caiu", () => {
    // A nuance da DEC-036: não somar de novo no acumulado não é apagar o evento.
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-08-10", "123456.78")],
      [saldo("VENDA", 300, "1000.00", "2026-12-31")],
      AGORA,
    );

    assert.equal(metricas.acumulados.vendidos.valor, 300, "não soma no acumulado");
    assert.equal(metricas.acumulados.vgv.valor, "1000.00");
    assert.equal(metricas.vgvPeriodos.mensal, "123456.78", "mas conta no mês");
    assert.equal(metricas.quadroMensal.VENDA, 1, "e no quadro mensal");
  });
});

describe("dinheiro é somado sem ponto flutuante", () => {
  it("0.10 + 0.20 dá exatamente 0.30", () => {
    // Em double, 0.1 + 0.2 é 0.30000000000000004.
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-08-01", "0.10"), lancamento("VENDA", "2026-08-02", "0.20")],
      [],
      AGORA,
    );
    assert.equal(metricas.vgvPeriodos.mensal, "0.30");
  });

  it("o total agregado passa do topo de Decimal(14,2) sem perder centavo", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-08-01", "999999999999.99"),
        lancamento("VENDA", "2026-08-02", "0.01"),
      ],
      [],
      AGORA,
    );
    assert.equal(metricas.vgvPeriodos.mensal, "1000000000000.00");
  });

  it("acumulado também soma exato sobre o saldo", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2026-08-01", "0.01")],
      [saldo("VENDA", 1, "999999999999.99", "2026-07-31")],
      AGORA,
    );
    assert.equal(metricas.acumulados.vgv.valor, "1000000000000.00");
  });

  it("centavos sobrevivem a muitas parcelas pequenas", () => {
    const centavos = Array.from({ length: 101 }, () => lancamento("VENDA", "2026-08-01", "0.01"));
    const metricas = calcularMetricasEmpresa(centavos, [], AGORA);
    assert.equal(metricas.vgvPeriodos.mensal, "1.01");
  });

  it("nenhuma venda no período é zero real, não ausência", () => {
    const metricas = calcularMetricasEmpresa([lancamento("PROPOSTA", "2026-08-01")], [], AGORA);
    assert.equal(metricas.vgvPeriodos.mensal, "0.00");
    assert.equal(metricas.estadoPeriodoMensal, "OK");
  });
});

describe("venda sem valor falha explicitamente", () => {
  it("no VGV do período", () => {
    assert.throws(
      () => calcularMetricasEmpresa([lancamento("VENDA", "2026-08-10", null)], [], AGORA),
      /VENDA sem valor/,
    );
  });

  it("no acumulado", () => {
    assert.throws(
      () =>
        calcularMetricasEmpresa(
          [lancamento("VENDA", "2026-08-10", null)],
          [saldo("VENDA", 1, "1.00", "2026-07-31")],
          AGORA,
        ),
      /VENDA sem valor/,
    );
  });

  it("recusa valor fora da forma canônica em vez de arredondar", () => {
    assert.throws(
      () => calcularMetricasEmpresa([lancamento("VENDA", "2026-08-10", "1000")], [], AGORA),
      /forma canônica/,
    );
    assert.throws(
      () => calcularMetricasEmpresa([lancamento("VENDA", "2026-08-10", "1.5")], [], AGORA),
      /forma canônica/,
    );
  });

  it("venda sem valor fora de qualquer soma não derruba o cálculo", () => {
    // Antes do corte e fora do ano corrente: não entra em soma nenhuma.
    const metricas = calcularMetricasEmpresa(
      [lancamento("VENDA", "2025-03-10", null)],
      [saldo("VENDA", 7, "70.00", "2025-12-31")],
      AGORA,
    );
    assert.equal(metricas.acumulados.vgv.valor, "70.00");
    assert.equal(metricas.vgvPeriodos.anual, "0.00");
  });
});

describe("quadro mensal", () => {
  it("conta os sete tipos separadamente", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-08-01", "1.00"),
        lancamento("VENDA", "2026-08-02", "2.00"),
        lancamento("LOCACAO", "2026-08-03", "3.00"),
        lancamento("CAPTACAO_VENDA", "2026-08-04"),
        lancamento("CAPTACAO_EXCLUSIVA", "2026-08-05"),
        lancamento("CAPTACAO_EXCLUSIVA", "2026-08-06"),
        lancamento("CAPTACAO_LOCACAO", "2026-08-07"),
        lancamento("PROPOSTA", "2026-08-08"),
        lancamento("PROPOSTA", "2026-08-09"),
        lancamento("PROPOSTA", "2026-08-10"),
        lancamento("AVALIACAO_GOOGLE", "2026-08-11"),
      ],
      [],
      AGORA,
    );

    assert.deepEqual(metricas.quadroMensal, {
      VENDA: 2,
      LOCACAO: 1,
      CAPTACAO_VENDA: 1,
      CAPTACAO_EXCLUSIVA: 2,
      CAPTACAO_LOCACAO: 1,
      PROPOSTA: 3,
      AVALIACAO_GOOGLE: 1,
    });
  });

  it("captação de venda e exclusividade não se somam (DEC-003)", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("CAPTACAO_VENDA", "2026-08-04"),
        lancamento("CAPTACAO_EXCLUSIVA", "2026-08-05"),
        lancamento("CAPTACAO_EXCLUSIVA", "2026-08-06"),
      ],
      [],
      AGORA,
    );

    assert.equal(metricas.quadroMensal.CAPTACAO_VENDA, 1);
    assert.equal(metricas.quadroMensal.CAPTACAO_EXCLUSIVA, 2);
    assert.notEqual(metricas.quadroMensal.CAPTACAO_VENDA, 3);
    assert.notEqual(metricas.quadroMensal.CAPTACAO_EXCLUSIVA, 3);
  });

  it("ignora lançamentos de outros meses", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("PROPOSTA", "2026-08-15"),
        lancamento("PROPOSTA", "2026-07-31"),
        lancamento("PROPOSTA", "2026-09-01"),
      ],
      [],
      AGORA,
    );

    assert.equal(metricas.quadroMensal.PROPOSTA, 1);
  });

  it("não usa saldo histórico", () => {
    const metricas = calcularMetricasEmpresa(
      [lancamento("PROPOSTA", "2026-08-15")],
      [
        saldo("VENDA", 528, "4200000000.00", "2026-07-31"),
        saldo("AVALIACAO_GOOGLE", 2643, "0.00", "2026-07-31"),
      ],
      AGORA,
    );

    assert.equal(metricas.quadroMensal.VENDA, 0);
    assert.equal(metricas.quadroMensal.AVALIACAO_GOOGLE, 0);
  });
});

describe("estado do mês", () => {
  it("nenhum lançamento no mês é SEM_DADOS", () => {
    const metricas = calcularMetricasEmpresa([], [], AGORA);
    assert.equal(metricas.estadoPeriodoMensal, "SEM_DADOS");
  });

  it("lançamentos só fora do mês também é SEM_DADOS", () => {
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-07-31", "100.00"),
        lancamento("PROPOSTA", "2026-09-01"),
        lancamento("AVALIACAO_GOOGLE", "2025-08-15"),
      ],
      [],
      AGORA,
    );
    assert.equal(metricas.estadoPeriodoMensal, "SEM_DADOS");
  });

  it("um único lançamento de qualquer tipo já é OK, e os zeros são reais", () => {
    const metricas = calcularMetricasEmpresa([lancamento("PROPOSTA", "2026-08-20")], [], AGORA);

    assert.equal(metricas.estadoPeriodoMensal, "OK");
    assert.equal(metricas.quadroMensal.PROPOSTA, 1);
    assert.equal(metricas.quadroMensal.AVALIACAO_GOOGLE, 0);
    assert.equal(metricas.quadroMensal.VENDA, 0);
  });

  it("o estado do mês não depende do saldo histórico", () => {
    const metricas = calcularMetricasEmpresa(
      [],
      [saldo("VENDA", 528, "4200000000.00", "2026-07-31")],
      AGORA,
    );

    assert.equal(metricas.estadoPeriodoMensal, "SEM_DADOS");
    // E o acumulado continua OK: são dimensões separadas (DEC-042).
    assert.equal(metricas.acumulados.vendidos.estado, "OK");
  });
});

describe("período corrente segue São Paulo, não UTC", () => {
  it("02:30Z de 1º de março ainda calcula fevereiro", () => {
    const virada = new Date("2026-03-01T02:30:00.000Z");
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-02-28", "500.00"),
        lancamento("PROPOSTA", "2026-02-10"),
        lancamento("VENDA", "2026-03-01", "900.00"),
      ],
      [],
      virada,
    );

    assert.equal(metricas.vgvPeriodos.mensal, "500.00", "março não entra");
    assert.equal(metricas.quadroMensal.VENDA, 1);
    assert.equal(metricas.quadroMensal.PROPOSTA, 1);
    assert.equal(metricas.estadoPeriodoMensal, "OK");
    // Fevereiro é Q1; o ano cobre os dois.
    assert.equal(metricas.vgvPeriodos.trimestral, "1400.00");
    assert.equal(metricas.vgvPeriodos.anual, "1400.00");
  });

  it("03:30Z do mesmo dia já calcula março", () => {
    const depois = new Date("2026-03-01T03:30:00.000Z");
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-02-28", "500.00"),
        lancamento("VENDA", "2026-03-01", "900.00"),
      ],
      [],
      depois,
    );

    assert.equal(metricas.vgvPeriodos.mensal, "900.00");
    assert.equal(metricas.quadroMensal.VENDA, 1);
  });

  it("02:59:59Z de 1º de janeiro ainda calcula o ano anterior", () => {
    const reveillon = new Date("2027-01-01T02:59:59.000Z");
    const metricas = calcularMetricasEmpresa(
      [
        lancamento("VENDA", "2026-12-31", "10.00"),
        lancamento("VENDA", "2027-01-01", "20.00"),
      ],
      [],
      reveillon,
    );

    assert.equal(metricas.vgvPeriodos.anual, "10.00");
    assert.equal(metricas.vgvPeriodos.mensal, "10.00");
  });
});
