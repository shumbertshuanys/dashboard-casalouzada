import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  calcularMetricasEmpresa,
  calcularMetricasEquipes,
  type ChaveRanking,
  CHAVES_RANKING,
  type CorretorMetrica,
  type EquipeMetrica,
  type LancamentoMetrica,
  type MetricasEquipesPuras,
  type PrecisaoSaldoMetrica,
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

/**
 * Um lançamento com o mínimo que o cálculo precisa; ids não importam aqui.
 *
 * Venda nasce com **um** participante — é o caso de sempre, e o que os testes
 * da empresa exercitam. A venda compartilhada tem suíte própria em
 * `tests/venda-compartilhada.test.ts`.
 */
function lancamento(
  tipo: TipoEventoMetrica,
  diaCivil: string,
  valor: string | null = null,
): LancamentoMetrica {
  sequencia += 1;
  const dataReferencia = paraDataCivil(diaCivil);

  if (tipo === "VENDA") {
    return {
      tipo,
      dataReferencia,
      valor,
      participacoes: [
        { corretorId: `corretor-${sequencia}`, equipeId: `equipe-${sequencia}`, ordem: 1 },
      ],
    };
  }

  return {
    tipo,
    corretorId: `corretor-${sequencia}`,
    equipeId: `equipe-${sequencia}`,
    dataReferencia,
    valor,
  };
}

/** `EXATO` por padrão: é o que a maioria dos casos exercita (DEC-054). */
function saldo(
  tipo: TipoSaldoMetrica,
  quantidade: number,
  valorTotal: string,
  dataCorte: string,
  precisao: PrecisaoSaldoMetrica = "EXATO",
): SaldoHistoricoMetrica {
  return { tipo, quantidade, valorTotal, precisao, dataCorte: paraDataCivil(dataCorte) };
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

    assert.deepEqual(metricas.acumulados.vendidos, { estado: "OK", valor: 100, precisao: "EXATO" });
    assert.deepEqual(metricas.acumulados.vgv, { estado: "OK", valor: "250000.00", precisao: "EXATO" });
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

    assert.deepEqual(metricas.acumulados.avaliacoes, { estado: "OK", valor: 2643, precisao: "EXATO" });
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

// ---------------------------------------------------------------------------
// F3.2B — equipes e rankings
// ---------------------------------------------------------------------------

/**
 * Lançamento com corretor e equipe explícitos: aqui os ids são o teste.
 *
 * Em VENDA o par (corretor, equipe) vira a participação de ordem 1 — a forma
 * que a E3 dá ao crédito de venda de participante único (DEC-051).
 */
function evento(
  tipo: TipoEventoMetrica,
  diaCivil: string,
  corretorId: string,
  equipeId: string,
  valor: string | null = null,
): LancamentoMetrica {
  const dataReferencia = paraDataCivil(diaCivil);

  if (tipo === "VENDA") {
    return { tipo, dataReferencia, valor, participacoes: [{ corretorId, equipeId, ordem: 1 }] };
  }
  return { tipo, corretorId, equipeId, dataReferencia, valor };
}

function corretor(
  id: string,
  nomeExibicao: string,
  equipeId: string,
  ativo = true,
): CorretorMetrica {
  return { id, nomeExibicao, equipeId, ativo };
}

function time(id: string, ordemExibicao: number, ativa = true): EquipeMetrica {
  return { id, nome: `Equipe ${id}`, gerenteNome: `Gerente ${id}`, ordemExibicao, ativa };
}

/** As três ativas usadas na maioria dos casos. */
const TRES_EQUIPES = [time("A", 1), time("B", 2), time("C", 3)];

/** Acha a linha de um corretor num ranking, sem depender da posição. */
function linha(
  resultado: MetricasEquipesPuras,
  equipeId: string,
  chave: ChaveRanking,
  corretorId: string,
): { corretorId: string; nomeExibicao: string; valor: number | string } | undefined {
  const equipe = resultado.equipes.find((e) => e.id === equipeId);
  assert.ok(equipe, `equipe ${equipeId} deveria estar no resultado`);

  // Contagem e VGV têm `valor` de tipos diferentes; aqui só interessa achar a
  // linha, então os dois entram como leitura somente.
  const linhas: readonly { corretorId: string; nomeExibicao: string; valor: number | string }[] =
    equipe.rankings[chave];
  return linhas.find((l) => l.corretorId === corretorId);
}

describe("exatamente três equipes ativas (DEC-040)", () => {
  const corretores = [corretor("c1", "Um", "A")];

  it("nenhuma equipe ativa é configuração inválida", () => {
    const resultado = calcularMetricasEquipes([], corretores, [], AGORA);
    assert.equal(resultado.estadoEquipes, "CONFIGURACAO_INVALIDA");
    assert.deepEqual(resultado.equipes, []);
  });

  it("duas ativas é configuração inválida", () => {
    const resultado = calcularMetricasEquipes([], corretores, [time("A", 1), time("B", 2)], AGORA);
    assert.equal(resultado.estadoEquipes, "CONFIGURACAO_INVALIDA");
    assert.deepEqual(resultado.equipes, []);
  });

  it("três ativas é OK", () => {
    const resultado = calcularMetricasEquipes([], corretores, TRES_EQUIPES, AGORA);
    assert.equal(resultado.estadoEquipes, "OK");
    assert.equal(resultado.equipes.length, 3);
  });

  it("quatro ativas não devolve as três primeiras", () => {
    const resultado = calcularMetricasEquipes(
      [],
      corretores,
      [...TRES_EQUIPES, time("D", 4)],
      AGORA,
    );

    assert.equal(resultado.estadoEquipes, "CONFIGURACAO_INVALIDA");
    assert.equal(resultado.equipes.length, 0, "nada de subconjunto arbitrário");
  });

  it("equipes inativas não contam para os três", () => {
    const resultado = calcularMetricasEquipes(
      [],
      corretores,
      [...TRES_EQUIPES, time("D", 4, false), time("E", 5, false)],
      AGORA,
    );

    assert.equal(resultado.estadoEquipes, "OK");
    assert.deepEqual(
      resultado.equipes.map((e) => e.id),
      ["A", "B", "C"],
    );
  });

  it("configuração inválida não impede o estado do mês de ser calculado", () => {
    const resultado = calcularMetricasEquipes(
      [evento("PROPOSTA", "2026-08-10", "c1", "A")],
      corretores,
      [time("A", 1)],
      AGORA,
    );

    assert.equal(resultado.estadoEquipes, "CONFIGURACAO_INVALIDA");
    assert.equal(resultado.estadoPeriodoMensal, "OK");
  });
});

describe("ordem das equipes", () => {
  it("ordena por ordemExibicao, não pela ordem de chegada", () => {
    const resultado = calcularMetricasEquipes(
      [],
      [],
      [time("X", 30), time("Y", 10), time("Z", 20)],
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes.map((e) => e.id),
      ["Y", "Z", "X"],
    );
  });

  it("empate de ordemExibicao é resolvido por id", () => {
    const resultado = calcularMetricasEquipes(
      [],
      [],
      [time("zeta", 5), time("alfa", 5), time("meio", 5)],
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes.map((e) => e.id),
      ["alfa", "meio", "zeta"],
    );
  });
});

describe("elenco atual da equipe", () => {
  it("corretor ativo sem evento aparece em todos os rankings, com zero", () => {
    const corretores = [corretor("a1", "Sem Evento", "A"), corretor("a2", "Com Evento", "A")];
    const resultado = calcularMetricasEquipes(
      [evento("VENDA", "2026-08-10", "a2", "A", "1000.00")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    for (const chave of CHAVES_RANKING) {
      assert.equal(
        resultado.equipes[0].rankings[chave].length,
        2,
        `${chave} deveria listar o elenco inteiro`,
      );
    }

    assert.equal(linha(resultado, "A", "vendidos", "a1")?.valor, 0);
    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "0.00");
    assert.equal(linha(resultado, "A", "propostas", "a1")?.valor, 0);
    assert.equal(linha(resultado, "A", "vendidos", "a2")?.valor, 1);
  });

  it("corretor de outra equipe sem produção aqui não aparece", () => {
    const resultado = calcularMetricasEquipes(
      [],
      [corretor("a1", "Da A", "A"), corretor("b1", "Da B", "B")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes[0].rankings.vendidos.map((l) => l.corretorId),
      ["a1"],
    );
    assert.deepEqual(
      resultado.equipes[1].rankings.vendidos.map((l) => l.corretorId),
      ["b1"],
    );
  });
});

describe("transferência de corretor (DEC-038)", () => {
  // X está hoje na B, mas produziu no mês pelas duas.
  const corretores = [
    corretor("x", "Xavier", "B"),
    corretor("a1", "Alice", "A"),
    corretor("b1", "Bruno", "B"),
  ];

  const lancamentos = [
    evento("VENDA", "2026-08-05", "x", "A", "100.00"),
    evento("VENDA", "2026-08-20", "x", "B", "250.00"),
  ];

  it("aparece nas duas equipes", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);

    assert.ok(linha(resultado, "A", "vendidos", "x"), "X está no quadro da A");
    assert.ok(linha(resultado, "B", "vendidos", "x"), "X está no quadro da B");
  });

  it("cada quadro soma só a própria produção histórica", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);

    assert.equal(linha(resultado, "A", "vendidos", "x")?.valor, 1);
    assert.equal(linha(resultado, "A", "vgv", "x")?.valor, "100.00");

    assert.equal(linha(resultado, "B", "vendidos", "x")?.valor, 1);
    assert.equal(linha(resultado, "B", "vgv", "x")?.valor, "250.00");
  });

  it("nenhum quadro recebe a produção somada", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);

    for (const equipeId of ["A", "B"]) {
      assert.notEqual(linha(resultado, equipeId, "vendidos", "x")?.valor, 2);
      assert.notEqual(linha(resultado, equipeId, "vgv", "x")?.valor, "350.00");
    }
  });

  it("transferido sem produção nova aparece na equipe atual com zero", () => {
    const resultado = calcularMetricasEquipes(
      [evento("VENDA", "2026-08-05", "x", "A", "100.00")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    // Na A, pela produção histórica do mês.
    assert.equal(linha(resultado, "A", "vendidos", "x")?.valor, 1);
    assert.equal(linha(resultado, "A", "vgv", "x")?.valor, "100.00");

    // Na B, pela lotação atual — zerado.
    assert.equal(linha(resultado, "B", "vendidos", "x")?.valor, 0);
    assert.equal(linha(resultado, "B", "vgv", "x")?.valor, "0.00");
  });

  it("o crédito nunca vem da lotação atual do corretor", () => {
    // Se o código usasse `corretor.equipeId`, a venda creditada a A apareceria
    // na B, que é onde X está hoje.
    const resultado = calcularMetricasEquipes(
      [evento("VENDA", "2026-08-05", "x", "A", "100.00")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "B", "vgv", "x")?.valor, "0.00");
    assert.equal(linha(resultado, "B", "vgv", "b1")?.valor, "0.00");
  });
});

describe("totalCorretores é headcount atual", () => {
  it("não conta o transferido na equipe antiga e conta na atual", () => {
    const corretores = [
      corretor("x", "Xavier", "B"),
      corretor("a1", "Alice", "A"),
      corretor("a2", "Ana", "A"),
      corretor("b1", "Bruno", "B"),
      corretor("c1", "Carla", "C"),
      corretor("a3", "Antigo", "A", false),
    ];

    const resultado = calcularMetricasEquipes(
      [evento("VENDA", "2026-08-05", "x", "A", "100.00")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    const porId = new Map(resultado.equipes.map((e) => [e.id, e]));

    // A tem a1 e a2 ativos; x aparece no ranking mas não no headcount, e o
    // inativo a3 não conta.
    assert.equal(porId.get("A")?.totalCorretores, 2);
    assert.ok(linha(resultado, "A", "vendidos", "x"), "x está no elenco do mês da A");

    assert.equal(porId.get("B")?.totalCorretores, 2, "b1 e x");
    assert.equal(porId.get("C")?.totalCorretores, 1);
  });
});

describe("corretor inativo (DEC-006)", () => {
  const corretores = [
    corretor("y", "Yara", "A", false),
    corretor("a1", "Alice", "A"),
    corretor("b1", "Bruno", "B"),
    corretor("c1", "Carla", "C"),
  ];

  const lancamentos = [
    evento("VENDA", "2026-08-05", "y", "A", "700.00"),
    evento("PROPOSTA", "2026-08-06", "y", "A"),
    evento("VENDA", "2026-08-07", "a1", "A", "300.00"),
  ];

  it("não aparece em ranking nenhum", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);

    for (const chave of CHAVES_RANKING) {
      assert.equal(
        linha(resultado, "A", chave, "y"),
        undefined,
        `inativo não pode ter linha em ${chave}`,
      );
    }
    assert.ok(linha(resultado, "A", "vendidos", "a1"), "o ativo continua");
  });

  it("mas os eventos dele continuam nos totais da empresa", () => {
    const empresa = calcularMetricasEmpresa(lancamentos, [], AGORA);

    assert.equal(empresa.quadroMensal.VENDA, 2, "as duas vendas contam");
    assert.equal(empresa.quadroMensal.PROPOSTA, 1);
    assert.equal(empresa.vgvPeriodos.mensal, "1000.00", "700 + 300");
  });

  it("o headcount da equipe também ignora o inativo", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);
    assert.equal(resultado.equipes[0].totalCorretores, 1);
  });
});

describe("as oito métricas", () => {
  const corretores = [corretor("a1", "Alice", "A"), corretor("a2", "Ana", "A")];

  const lancamentos = [
    evento("VENDA", "2026-08-01", "a1", "A", "1000.00"),
    evento("VENDA", "2026-08-02", "a1", "A", "500.00"),
    evento("LOCACAO", "2026-08-03", "a1", "A", "3000.00"),
    evento("CAPTACAO_VENDA", "2026-08-04", "a1", "A"),
    evento("CAPTACAO_EXCLUSIVA", "2026-08-05", "a1", "A"),
    evento("CAPTACAO_EXCLUSIVA", "2026-08-06", "a1", "A"),
    evento("CAPTACAO_LOCACAO", "2026-08-07", "a1", "A"),
    evento("PROPOSTA", "2026-08-08", "a1", "A"),
    evento("PROPOSTA", "2026-08-09", "a1", "A"),
    evento("PROPOSTA", "2026-08-10", "a1", "A"),
    evento("AVALIACAO_GOOGLE", "2026-08-11", "a1", "A"),
  ];

  it("cada tipo alimenta somente a própria métrica", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);

    assert.equal(linha(resultado, "A", "vendidos", "a1")?.valor, 2);
    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "1500.00");
    assert.equal(linha(resultado, "A", "locados", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "capVenda", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "exclusivas", "a1")?.valor, 2);
    assert.equal(linha(resultado, "A", "capLocacao", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "propostas", "a1")?.valor, 3);
    assert.equal(linha(resultado, "A", "avaliacoes", "a1")?.valor, 1);
  });

  it("o VGV não conta locação", () => {
    const resultado = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);
    // Os 3000.00 da locação apareceriam se o filtro de tipo falhasse.
    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "1500.00");
  });

  it("captação de venda e exclusividade não se somam (DEC-003)", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("CAPTACAO_VENDA", "2026-08-04", "a1", "A"),
        evento("CAPTACAO_EXCLUSIVA", "2026-08-05", "a1", "A"),
        evento("CAPTACAO_EXCLUSIVA", "2026-08-06", "a1", "A"),
      ],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "capVenda", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "exclusivas", "a1")?.valor, 2);
    assert.notEqual(linha(resultado, "A", "capVenda", "a1")?.valor, 3);
    assert.notEqual(linha(resultado, "A", "exclusivas", "a1")?.valor, 3);
  });

  it("ranking só usa o mês corrente", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-08-15", "a1", "A", "10.00"),
        evento("VENDA", "2026-07-31", "a1", "A", "999.00"),
        evento("VENDA", "2026-09-01", "a1", "A", "888.00"),
      ],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vendidos", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "10.00");
  });
});

describe("VGV do ranking é exato", () => {
  const corretores = [corretor("a1", "Alice", "A")];

  it("0.10 + 0.20 dá 0.30", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-08-01", "a1", "A", "0.10"),
        evento("VENDA", "2026-08-02", "a1", "A", "0.20"),
      ],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "0.30");
  });

  it("passa do topo de Decimal(14,2) sem perder centavo", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-08-01", "a1", "A", "999999999999.99"),
        evento("VENDA", "2026-08-02", "a1", "A", "0.01"),
      ],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "1000000000000.00");
  });

  it("ordena por centavos, não por texto", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-08-01", "a1", "A", "999999999999.99"),
        evento("VENDA", "2026-08-01", "a2", "A", "1000000000000.00"),
        evento("VENDA", "2026-08-01", "a3", "A", "9.00"),
      ],
      [corretor("a1", "Alice", "A"), corretor("a2", "Ana", "A"), corretor("a3", "Aurora", "A")],
      TRES_EQUIPES,
      AGORA,
    );

    // Ordenado como texto, "9.00" viria antes de "1000000000000.00".
    assert.deepEqual(
      resultado.equipes[0].rankings.vgv.map((l) => l.corretorId),
      ["a2", "a1", "a3"],
    );
  });

  it("venda sem valor no ranking falha explicitamente", () => {
    assert.throws(
      () =>
        calcularMetricasEquipes(
          [evento("VENDA", "2026-08-10", "a1", "A", null)],
          corretores,
          TRES_EQUIPES,
          AGORA,
        ),
      /VENDA sem valor/,
    );
  });

  it("venda sem valor fora do mês não derruba o ranking", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-07-10", "a1", "A", null),
        evento("VENDA", "2026-08-10", "a1", "A", "5.00"),
      ],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );

    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "5.00");
  });
});

describe("ordenação dos rankings", () => {
  it("resultado decrescente", () => {
    const resultado = calcularMetricasEquipes(
      [
        evento("PROPOSTA", "2026-08-01", "a1", "A"),
        evento("PROPOSTA", "2026-08-02", "a2", "A"),
        evento("PROPOSTA", "2026-08-03", "a2", "A"),
        evento("PROPOSTA", "2026-08-04", "a3", "A"),
        evento("PROPOSTA", "2026-08-05", "a3", "A"),
        evento("PROPOSTA", "2026-08-06", "a3", "A"),
      ],
      [corretor("a1", "Alice", "A"), corretor("a2", "Ana", "A"), corretor("a3", "Aurora", "A")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes[0].rankings.propostas.map((l) => [l.corretorId, l.valor]),
      [
        ["a3", 3],
        ["a2", 2],
        ["a1", 1],
      ],
    );
  });

  it("empate desempata por nomeExibicao em pt-BR, com acento no lugar certo", () => {
    // Em ordem de código, "Bastos" (B) viria antes de "Ávila" (Á = U+00C1).
    const resultado = calcularMetricasEquipes(
      [],
      [
        corretor("c3", "Bastos", "A"),
        corretor("c1", "Ávila", "A"),
        corretor("c2", "Alves", "A"),
        corretor("c4", "Çelik", "A"),
        corretor("c5", "Cunha", "A"),
      ],
      TRES_EQUIPES,
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes[0].rankings.vendidos.map((l) => l.nomeExibicao),
      ["Alves", "Ávila", "Bastos", "Çelik", "Cunha"],
    );
  });

  it("mesmo nome e mesmo resultado desempata por id", () => {
    const resultado = calcularMetricasEquipes(
      [],
      [
        corretor("zzz", "João Silva", "A"),
        corretor("aaa", "João Silva", "A"),
        corretor("mmm", "João Silva", "A"),
      ],
      TRES_EQUIPES,
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes[0].rankings.vendidos.map((l) => l.corretorId),
      ["aaa", "mmm", "zzz"],
    );
  });

  it("resultado tem prioridade sobre o nome", () => {
    const resultado = calcularMetricasEquipes(
      [evento("PROPOSTA", "2026-08-01", "z", "A")],
      [corretor("a", "Alice", "A"), corretor("z", "Zeca", "A")],
      TRES_EQUIPES,
      AGORA,
    );

    assert.deepEqual(
      resultado.equipes[0].rankings.propostas.map((l) => l.corretorId),
      ["z", "a"],
    );
  });
});

describe("determinismo", () => {
  const corretores = [
    corretor("a1", "Alice", "A"),
    corretor("a2", "Ana", "A"),
    corretor("b1", "Bruno", "B"),
    corretor("c1", "Carla", "C"),
  ];

  const lancamentos = [
    evento("VENDA", "2026-08-01", "a1", "A", "10.00"),
    evento("VENDA", "2026-08-02", "a2", "A", "10.00"),
    evento("PROPOSTA", "2026-08-03", "a2", "A"),
    evento("VENDA", "2026-08-04", "b1", "B", "20.00"),
    evento("AVALIACAO_GOOGLE", "2026-08-05", "c1", "C"),
  ];

  it("a saída não depende da ordem das entradas", () => {
    const direto = calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA);
    const invertido = calcularMetricasEquipes(
      [...lancamentos].reverse(),
      [...corretores].reverse(),
      [...TRES_EQUIPES].reverse(),
      AGORA,
    );

    assert.deepEqual(invertido, direto);
  });

  it("não muta os arrays recebidos", () => {
    const equipesEntrada = [...TRES_EQUIPES];
    const corretoresEntrada = [...corretores];
    const lancamentosEntrada = [...lancamentos];

    calcularMetricasEquipes(lancamentosEntrada, corretoresEntrada, equipesEntrada, AGORA);

    assert.deepEqual(equipesEntrada, TRES_EQUIPES);
    assert.deepEqual(corretoresEntrada, corretores);
    assert.deepEqual(lancamentosEntrada, lancamentos);
  });
});

describe("estado do mês nas equipes", () => {
  const corretores = [corretor("a1", "Alice", "A")];

  it("nenhum lançamento no mês é SEM_DADOS", () => {
    const resultado = calcularMetricasEquipes([], corretores, TRES_EQUIPES, AGORA);

    assert.equal(resultado.estadoPeriodoMensal, "SEM_DADOS");
    // O domínio ainda traz as linhas zeradas; quem decide não exibir é a F3.4.
    assert.equal(resultado.equipes.length, 3);
    assert.equal(linha(resultado, "A", "vendidos", "a1")?.valor, 0);
  });

  it("lançamento fora do mês também é SEM_DADOS", () => {
    const resultado = calcularMetricasEquipes(
      [evento("VENDA", "2026-07-31", "a1", "A", "10.00")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );
    assert.equal(resultado.estadoPeriodoMensal, "SEM_DADOS");
  });

  it("um lançamento de qualquer tipo, em qualquer equipe, já é OK", () => {
    const resultado = calcularMetricasEquipes(
      [evento("AVALIACAO_GOOGLE", "2026-08-10", "c1", "C")],
      corretores,
      TRES_EQUIPES,
      AGORA,
    );
    assert.equal(resultado.estadoPeriodoMensal, "OK");
  });

  it("a regra é a mesma da empresa", () => {
    const lancamentos = [evento("PROPOSTA", "2026-08-10", "a1", "A")];
    assert.equal(
      calcularMetricasEquipes(lancamentos, corretores, TRES_EQUIPES, AGORA).estadoPeriodoMensal,
      calcularMetricasEmpresa(lancamentos, [], AGORA).estadoPeriodoMensal,
    );
  });
});

describe("rankings seguem São Paulo, não UTC", () => {
  it("02:30Z de 1º de março ainda ranqueia fevereiro", () => {
    const virada = new Date("2026-03-01T02:30:00.000Z");
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-02-28", "a1", "A", "500.00"),
        evento("VENDA", "2026-03-01", "a1", "A", "900.00"),
      ],
      [corretor("a1", "Alice", "A")],
      TRES_EQUIPES,
      virada,
    );

    assert.equal(resultado.estadoPeriodoMensal, "OK");
    assert.equal(linha(resultado, "A", "vendidos", "a1")?.valor, 1);
    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "500.00");
  });

  it("03:30Z do mesmo dia já ranqueia março", () => {
    const depois = new Date("2026-03-01T03:30:00.000Z");
    const resultado = calcularMetricasEquipes(
      [
        evento("VENDA", "2026-02-28", "a1", "A", "500.00"),
        evento("VENDA", "2026-03-01", "a1", "A", "900.00"),
      ],
      [corretor("a1", "Alice", "A")],
      TRES_EQUIPES,
      depois,
    );

    assert.equal(linha(resultado, "A", "vgv", "a1")?.valor, "900.00");
  });
});
