import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paraDataCivil } from "@/lib/datas";
import {
  calcularMetricasEmpresa,
  calcularMetricasEquipes,
  type CorretorMetrica,
  type EquipeMetrica,
  type LancamentoMetrica,
  type MetricasEmpresaPuras,
  type PrecisaoSaldoMetrica,
  type SaldoHistoricoMetrica,
  type TipoEventoMetrica,
  type TipoSaldoMetrica,
  type VgvHistoricoMensalMetrica,
} from "@/lib/metricas";
import { obterMetricasPainel, type MetricasEmpresaPeriodicas } from "@/lib/metricas-prisma";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * A fronteira Prisma → núcleo puro, exercitada sem banco.
 *
 * O que se prova aqui é só o que é responsabilidade da fronteira: quais leituras
 * ela faz, como converte cada linha, e o que acontece com cada bloco quando uma
 * das leituras falha. Quanto dá cada número é da `tests/metricas.test.ts` — por
 * isso a asserção de caminho feliz compara com o resultado das **próprias**
 * funções puras, e não com literais recalculados à mão.
 *
 * O `PrismaClient` é substituído por um objeto com os quatro `findMany`, e o
 * cast largo fica confinado a este arquivo: em produção o cliente entra por
 * parâmetro (DEC-041), sem DAL nem interface abstrata no meio.
 */

/** Instante que cai em 15 de agosto de 2026 em São Paulo. */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

/**
 * O único contrato do `Decimal` do Prisma que a fronteira usa.
 *
 * O dublê devolve a string canônica montada por texto — nunca passa por
 * `number` — e cobra que a fronteira peça sempre duas casas.
 */
type DecimalFalso = { toFixed(casas: number): string };

function decimal(inteiro: string, centavos = "00"): DecimalFalso {
  return {
    toFixed(casas: number) {
      assert.equal(casas, 2, "dinheiro sai do Decimal sempre com duas casas");
      return `${inteiro}.${centavos}`;
    },
  };
}

type LinhaParticipacao = { corretorId: string; equipeId: string; ordem: number };

type LinhaLancamento = {
  id: string;
  tipo: TipoEventoMetrica;
  corretorId: string | null;
  equipeId: string | null;
  dataReferencia: Date;
  valor: DecimalFalso | null;
  statusProposta: "AGUARDANDO" | "ACEITA" | "REJEITADA" | null;
  imovelRef: string | null;
  criadoEm: Date;
  corretor: { nomeExibicao: string } | null;
  participacoes: LinhaParticipacao[];
};

/** A linha de reserva como o `select` da fronteira a pede (E4). */
type LinhaReserva = {
  id: string;
  status: "ATIVA" | "FINALIZADA" | "CANCELADA";
  imovelRef: string;
  dataReferencia: Date;
  criadoEm: Date;
  corretor: { nomeExibicao: string };
};

/** Carimbo estável: o teste não pode depender do relógio da máquina. */
const CRIADO_EM = new Date("2026-08-01T12:00:00.000Z");

let sequenciaLinha = 0;
function proximoId(): string {
  sequenciaLinha += 1;
  return `linha-${sequenciaLinha}`;
}

type LinhaSaldo = {
  tipo: TipoEventoMetrica;
  quantidade: number;
  valorTotal: DecimalFalso;
  precisao: PrecisaoSaldoMetrica;
  dataCorte: Date;
};

/** A linha de VGV histórico mensal como o `select` da fronteira a pede (E4). */
type LinhaVgvHistorico = {
  competencia: Date;
  valorTotal: DecimalFalso;
};

/** Linha do banco e o objeto de domínio que ela deve virar, criados juntos. */
type Par<Linha, Dominio> = { linha: Linha; dominio: Dominio };

/**
 * Depois do cutover, VENDA e evento individual têm formas diferentes no banco:
 * a venda traz os campos antigos `NULL` e o crédito nas participações; os
 * demais tipos trazem corretor e equipe e nenhuma participação (DEC-051).
 */
function lancamento(
  tipo: TipoEventoMetrica,
  corretorId: string,
  equipeId: string,
  dia: string,
  inteiro: string | null = null,
  centavos = "00",
): Par<LinhaLancamento, LancamentoMetrica> {
  const dataReferencia = paraDataCivil(dia);
  const valor = inteiro === null ? null : `${inteiro}.${centavos}`;
  const valorDecimal = inteiro === null ? null : decimal(inteiro, centavos);

  const comuns = {
    id: proximoId(),
    statusProposta: (tipo === "PROPOSTA" ? "AGUARDANDO" : null) as LinhaLancamento["statusProposta"],
    imovelRef: tipo === "PROPOSTA" ? "AP-1" : null,
    criadoEm: CRIADO_EM,
  };

  if (tipo === "VENDA") {
    return {
      linha: {
        ...comuns,
        tipo,
        corretorId: null,
        equipeId: null,
        dataReferencia,
        valor: valorDecimal,
        corretor: null,
        participacoes: [{ corretorId, equipeId, ordem: 1 }],
      },
      dominio: {
        tipo,
        dataReferencia,
        valor,
        participacoes: [{ corretorId, equipeId, ordem: 1 }],
      },
    };
  }

  return {
    linha: {
      ...comuns,
      tipo,
      corretorId,
      equipeId,
      dataReferencia,
      valor: valorDecimal,
      corretor: { nomeExibicao: `Nome ${corretorId}` },
      participacoes: [],
    },
    dominio: { tipo, corretorId, equipeId, dataReferencia, valor },
  };
}

/** Venda compartilhada: uma linha, N participações na ordem informada. */
function vendaCompartilhada(
  dia: string,
  inteiro: string,
  participantes: readonly { corretorId: string; equipeId: string }[],
  centavos = "00",
): Par<LinhaLancamento, LancamentoMetrica> {
  const dataReferencia = paraDataCivil(dia);
  const participacoes = participantes.map((participante, indice) => ({
    ...participante,
    ordem: indice + 1,
  }));
  return {
    linha: {
      id: proximoId(),
      tipo: "VENDA",
      corretorId: null,
      equipeId: null,
      dataReferencia,
      valor: decimal(inteiro, centavos),
      statusProposta: null,
      imovelRef: null,
      criadoEm: CRIADO_EM,
      corretor: null,
      participacoes,
    },
    dominio: {
      tipo: "VENDA",
      dataReferencia,
      valor: `${inteiro}.${centavos}`,
      participacoes,
    },
  };
}

function saldo(
  tipo: TipoSaldoMetrica,
  quantidade: number,
  inteiro: string,
  centavos: string,
  dia: string,
  precisao: PrecisaoSaldoMetrica = "EXATO",
): Par<LinhaSaldo, SaldoHistoricoMetrica> {
  const dataCorte = paraDataCivil(dia);
  return {
    linha: { tipo, quantidade, valorTotal: decimal(inteiro, centavos), precisao, dataCorte },
    dominio: { tipo, quantidade, valorTotal: `${inteiro}.${centavos}`, precisao, dataCorte },
  };
}

/**
 * Um VGV histórico mensal, na linha do banco e no domínio.
 *
 * A competência entra como `YYYY-MM` só para o teste ficar legível; o que vai
 * para a linha é o primeiro dia do mês, que é o que a coluna `@db.Date` guarda.
 */
function historico(
  competenciaMes: string,
  inteiro: string,
  centavos = "00",
): Par<LinhaVgvHistorico, VgvHistoricoMensalMetrica> {
  const competencia = paraDataCivil(`${competenciaMes}-01`);
  return {
    linha: { competencia, valorTotal: decimal(inteiro, centavos) },
    dominio: { competencia, valorTotal: `${inteiro}.${centavos}` },
  };
}

/**
 * Corretor e equipe não passam por conversão de tipo nenhuma — o `select` já
 * devolve exatamente os campos do domínio —, então linha e domínio são o mesmo
 * objeto.
 */
function corretor(
  id: string,
  nomeExibicao: string,
  equipeId: string,
  ativo = true,
): CorretorMetrica {
  return { id, nomeExibicao, equipeId, ativo };
}

function equipe(id: string, nome: string, ordemExibicao: number, ativa = true): EquipeMetrica {
  return { id, nome, gerenteNome: `Gerente ${nome}`, ordemExibicao, ativa };
}

/**
 * O mesmo recorte periódico que a fronteira expõe, extraído do resultado da
 * função pura. Só seleciona campos — nenhuma fórmula é reimplementada.
 */
function periodicasDe(metricas: MetricasEmpresaPuras): MetricasEmpresaPeriodicas {
  return {
    estadoPeriodoMensal: metricas.estadoPeriodoMensal,
    vgvPeriodos: metricas.vgvPeriodos,
    quadroMensal: metricas.quadroMensal,
  };
}

type Leituras = {
  lancamentos: readonly LinhaLancamento[] | Error;
  saldos: readonly LinhaSaldo[] | Error;
  corretores: readonly CorretorMetrica[] | Error;
  equipes: readonly EquipeMetrica[] | Error;
  /** A quinta leitura, da E4: candidatas a "Reservas de locação" (DEC-055). */
  reservas?: readonly LinhaReserva[] | Error;
  /** A sexta leitura: os agregados mensais do VGV histórico. */
  historicos?: readonly LinhaVgvHistorico[] | Error;
};

type Chamadas = {
  lancamento: unknown[];
  saldoHistorico: unknown[];
  corretor: unknown[];
  equipe: unknown[];
  reservaLocacao: unknown[];
  vgvHistoricoMensal: unknown[];
};

function criarPrismaFalso(leituras: Leituras): { prisma: PrismaClient; chamadas: Chamadas } {
  const chamadas: Chamadas = {
    lancamento: [],
    saldoHistorico: [],
    corretor: [],
    equipe: [],
    reservaLocacao: [],
    vgvHistoricoMensal: [],
  };

  const modelo = <T>(nome: keyof Chamadas, resposta: readonly T[] | Error) => ({
    findMany: async (argumentos: unknown): Promise<readonly T[]> => {
      chamadas[nome].push(argumentos);
      if (resposta instanceof Error) throw resposta;
      return resposta;
    },
  });

  const falso = {
    lancamento: modelo("lancamento", leituras.lancamentos),
    saldoHistorico: modelo("saldoHistorico", leituras.saldos),
    corretor: modelo("corretor", leituras.corretores),
    equipe: modelo("equipe", leituras.equipes),
    reservaLocacao: modelo("reservaLocacao", leituras.reservas ?? []),
    vgvHistoricoMensal: modelo("vgvHistoricoMensal", leituras.historicos ?? []),
  };

  return { prisma: falso as unknown as PrismaClient, chamadas };
}

// Cenário base: três equipes ativas, quatro corretores (um inativo), eventos em
// julho e agosto, e os dois saldos de abertura com cortes diferentes.
const EQUIPES = [equipe("e1", "Alfa", 1), equipe("e2", "Beta", 2), equipe("e3", "Gama", 3)];

const CORRETORES = [
  corretor("c1", "Ana", "e1"),
  corretor("c2", "Bruno", "e2"),
  corretor("c3", "Carla", "e3"),
  corretor("c4", "Diego", "e1", false),
];

const LANCAMENTOS = [
  lancamento("VENDA", "c1", "e1", "2026-08-10", "1000000"),
  lancamento("VENDA", "c2", "e2", "2026-07-05", "500000", "50"),
  lancamento("AVALIACAO_GOOGLE", "c3", "e3", "2026-08-02"),
  lancamento("PROPOSTA", "c1", "e1", "2026-08-03"),
  lancamento("LOCACAO", "c2", "e2", "2026-08-04", "3500"),
];

const SALDOS = [
  saldo("VENDA", 100, "5000000", "00", "2026-06-30"),
  saldo("AVALIACAO_GOOGLE", 480, "0", "00", "2026-07-31"),
];

const LEITURAS_BASE: Leituras = {
  lancamentos: LANCAMENTOS.map((par) => par.linha),
  saldos: SALDOS.map((par) => par.linha),
  corretores: CORRETORES,
  equipes: EQUIPES,
};

const DOMINIO_LANCAMENTOS = LANCAMENTOS.map((par) => par.dominio);
const DOMINIO_SALDOS = SALDOS.map((par) => par.dominio);

/** Falha de leitura, do jeito que o driver a entrega: uma rejeição qualquer. */
function falha(tabela: string): Error {
  return new Error(`conexão perdida ao ler ${tabela}`);
}

describe("T1 — as quatro leituras dão certo", () => {
  it("os três blocos ficam OK", async () => {
    const { prisma } = criarPrismaFalso(LEITURAS_BASE);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    assert.equal(resultado.equipes.estadoLeitura, "OK");
  });

  it("os dados são exatamente o que as funções puras produzem", async () => {
    const { prisma } = criarPrismaFalso(LEITURAS_BASE);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    const esperado = calcularMetricasEmpresa(DOMINIO_LANCAMENTOS, DOMINIO_SALDOS, [], AGORA);
    assert.deepEqual(resultado.empresa, {
      periodos: { estadoLeitura: "OK", dados: periodicasDe(esperado) },
      acumulados: { estadoLeitura: "OK", dados: esperado.acumulados },
    });
    assert.deepEqual(resultado.equipes, {
      estadoLeitura: "OK",
      dados: calcularMetricasEquipes(DOMINIO_LANCAMENTOS, CORRETORES, EQUIPES, AGORA),
    });
  });

  it("cada tabela é lida uma vez só", async () => {
    const { prisma, chamadas } = criarPrismaFalso(LEITURAS_BASE);
    await obterMetricasPainel(prisma, AGORA);

    assert.equal(chamadas.lancamento.length, 1);
    assert.equal(chamadas.saldoHistorico.length, 1);
    assert.equal(chamadas.corretor.length, 1);
    assert.equal(chamadas.equipe.length, 1);
  });
});

describe("T2 — a leitura de lançamentos falha", () => {
  it("derruba os três blocos, porque todos dependem dela", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, lancamentos: falha("lancamentos") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.equipes.estadoLeitura, "INDISPONIVEL");
  });

  it("nenhum bloco carrega dados", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, lancamentos: falha("lancamentos") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal("dados" in resultado.empresa.periodos, false);
    assert.equal("dados" in resultado.empresa.acumulados, false);
    assert.equal("dados" in resultado.equipes, false);
  });
});

describe("T3 — a leitura de saldo histórico falha", () => {
  it("só os acumulados caem: períodos e equipes seguem OK", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, saldos: falha("saldo_historico") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "INDISPONIVEL");
    assert.deepEqual(resultado.equipes, {
      estadoLeitura: "OK",
      dados: calcularMetricasEquipes(DOMINIO_LANCAMENTOS, CORRETORES, EQUIPES, AGORA),
    });
  });

  it("a falha do saldo não altera os dados periódicos", async () => {
    // Os períodos servidos com o saldo indisponível têm de ser idênticos, campo
    // a campo, aos que a chamada completa — com os saldos de verdade — produz.
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, saldos: falha("saldo_historico") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    const completo = calcularMetricasEmpresa(DOMINIO_LANCAMENTOS, DOMINIO_SALDOS, [], AGORA);
    assert.deepEqual(resultado.empresa.periodos, {
      estadoLeitura: "OK",
      dados: {
        estadoPeriodoMensal: completo.estadoPeriodoMensal,
        vgvPeriodos: completo.vgvPeriodos,
        quadroMensal: completo.quadroMensal,
      },
    });
  });

  it("os acumulados do saldo fictício interno nunca são expostos", async () => {
    // Com o saldo indisponível, a fronteira chama o núcleo com `[]` só para
    // obter a metade periódica. Os acumulados dessa chamada descrevem um banco
    // sem saldo cadastrado (`SEM_SALDO_HISTORICO`) — não o banco real que
    // falhou — e não podem vazar: nem `dados`, nem estado de domínio, nem zero.
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, saldos: falha("saldo_historico") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.deepEqual(resultado.empresa.acumulados, { estadoLeitura: "INDISPONIVEL" });
    assert.deepEqual(Object.keys(resultado.empresa.acumulados), ["estadoLeitura"]);
    assert.equal(
      JSON.stringify(resultado.empresa.acumulados).includes("SEM_SALDO_HISTORICO"),
      false,
    );
  });
});

describe("T4 — a leitura de corretores falha", () => {
  it("só equipes cai: períodos e acumulados seguem OK", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, corretores: falha("corretores") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.equipes.estadoLeitura, "INDISPONIVEL");

    const esperado = calcularMetricasEmpresa(DOMINIO_LANCAMENTOS, DOMINIO_SALDOS, [], AGORA);
    assert.deepEqual(resultado.empresa, {
      periodos: { estadoLeitura: "OK", dados: periodicasDe(esperado) },
      acumulados: { estadoLeitura: "OK", dados: esperado.acumulados },
    });
  });
});

describe("T5 — a leitura de equipes falha", () => {
  it("mesma propagação: só o bloco de equipes cai", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, equipes: falha("equipes") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.equipes.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
  });

  it("indisponibilidade de equipes não é confundida com configuração inválida", async () => {
    // Zero equipes lidas com sucesso seria `CONFIGURACAO_INVALIDA`; leitura que
    // falhou não afirma nada sobre a configuração.
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, equipes: falha("equipes") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal("dados" in resultado.equipes, false);
  });
});

describe("T6 — leitura bem-sucedida que não achou nada", () => {
  const vazio: Leituras = { lancamentos: [], saldos: [], corretores: [], equipes: [] };

  it("não é INDISPONIVEL: os três blocos ficam OK", async () => {
    const { prisma } = criarPrismaFalso(vazio);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    assert.equal(resultado.equipes.estadoLeitura, "OK");
  });

  it("quem decide o significado do vazio é o núcleo", async () => {
    const { prisma } = criarPrismaFalso(vazio);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;
    assert.equal(resultado.empresa.periodos.dados.estadoPeriodoMensal, "SEM_DADOS");

    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    if (resultado.empresa.acumulados.estadoLeitura !== "OK") return;
    assert.equal(resultado.empresa.acumulados.dados.vendidos.estado, "SEM_SALDO_HISTORICO");
    assert.equal(resultado.empresa.acumulados.dados.vgv.estado, "SEM_SALDO_HISTORICO");
    assert.equal(resultado.empresa.acumulados.dados.avaliacoes.estado, "SEM_SALDO_HISTORICO");

    assert.equal(resultado.equipes.estadoLeitura, "OK");
    if (resultado.equipes.estadoLeitura !== "OK") return;
    assert.equal(resultado.equipes.dados.estadoEquipes, "CONFIGURACAO_INVALIDA");
    assert.deepEqual(resultado.equipes.dados.equipes, []);
  });
});

describe("T7 — nenhum ramo indisponível carrega dados", () => {
  it("a propriedade `dados` não existe, nem como chave nula", async () => {
    const { prisma } = criarPrismaFalso({
      lancamentos: falha("lancamentos"),
      saldos: falha("saldo_historico"),
      corretores: falha("corretores"),
      equipes: falha("equipes"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.deepEqual(resultado.empresa.periodos, { estadoLeitura: "INDISPONIVEL" });
    assert.deepEqual(resultado.empresa.acumulados, { estadoLeitura: "INDISPONIVEL" });
    assert.deepEqual(resultado.equipes, { estadoLeitura: "INDISPONIVEL" });
    assert.deepEqual(Object.keys(resultado.empresa.periodos), ["estadoLeitura"]);
    assert.deepEqual(Object.keys(resultado.empresa.acumulados), ["estadoLeitura"]);
    assert.deepEqual(Object.keys(resultado.equipes), ["estadoLeitura"]);
  });
});

describe("T8 — erro de domínio não vira INDISPONIVEL", () => {
  it("VENDA relevante sem valor propaga a exceção do núcleo", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [lancamento("VENDA", "c1", "e1", "2026-08-10", null).linha],
    });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA), /VENDA sem valor/);
  });

  it("propaga também no caminho parcial, com o saldo indisponível", async () => {
    // A chamada interna com `[]` ainda soma o VGV dos períodos, então a mesma
    // VENDA sem valor tem de rejeitar — não virar `INDISPONIVEL` parcial.
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [lancamento("VENDA", "c1", "e1", "2026-08-10", null).linha],
      saldos: falha("saldo_historico"),
    });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA), /VENDA sem valor/);
  });

  it("a leitura tinha dado certo — não há nada de indisponível a relatar", async () => {
    // Se a fronteira capturasse a exceção, este cenário devolveria um resultado
    // em vez de rejeitar, e a tela mostraria "sem conexão" para um dado que
    // chegou íntegro e está errado no cadastro.
    const { prisma, chamadas } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [lancamento("VENDA", "c1", "e1", "2026-08-10", null).linha],
    });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA));
    assert.equal(chamadas.lancamento.length, 1);
  });
});

describe("venda compartilhada atravessa a fronteira sem cálculo (DEC-051)", () => {
  const COMPARTILHADA = vendaCompartilhada("2026-08-14", "900000", [
    { corretorId: "c1", equipeId: "e1" },
    { corretorId: "c2", equipeId: "e1" },
    { corretorId: "c3", equipeId: "e3" },
  ]);

  it("mapeia as participações aninhadas preservando corretor, equipe e ordem", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, lancamentos: [COMPARTILHADA.linha] });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    // A fronteira não divide, não deduplica e não conta: o que ela devolve é o
    // que o núcleo puro produz sobre exatamente o mesmo domínio.
    const esperado = calcularMetricasEquipes(
      [COMPARTILHADA.dominio],
      CORRETORES,
      EQUIPES,
      AGORA,
    );
    assert.deepEqual(resultado.equipes, { estadoLeitura: "OK", dados: esperado });
  });

  it("a venda entra uma vez nos números da empresa", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [COMPARTILHADA.linha],
      saldos: [],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;
    assert.equal(resultado.empresa.periodos.dados.quadroMensal.VENDA, 1);
    assert.equal(resultado.empresa.periodos.dados.vgvPeriodos.mensal, "900000.00");
  });

  it("recusa VENDA com o crédito antigo preenchido em vez de calcular torto", async () => {
    const corrompida = {
      ...COMPARTILHADA.linha,
      corretorId: "c1",
      equipeId: "e1",
    };
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, lancamentos: [corrompida] });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA), /crédito antigo/);
  });

  it("recusa VENDA sem participação", async () => {
    const semElenco = { ...COMPARTILHADA.linha, participacoes: [] };
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, lancamentos: [semElenco] });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA), /sem participação/);
  });

  it("recusa não-VENDA sem corretor ou equipe", async () => {
    const individualQuebrado = {
      ...lancamento("LOCACAO", "c2", "e2", "2026-08-04", "3500").linha,
      corretorId: null,
    };
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [individualQuebrado],
    });

    await assert.rejects(() => obterMetricasPainel(prisma, AGORA), /sem corretor ou equipe/);
  });
});

/**
 * As listas operacionais atravessando a fronteira (E4).
 *
 * O que se prova é que a camada **lê e normaliza**, e que a regra de produto —
 * status, ordem e corte em três — continua sendo do núcleo (DEC-013).
 */
describe("listas operacionais na fronteira", () => {
  function reserva(
    id: string,
    status: LinhaReserva["status"],
    dia: string,
    imovelRef = `CA-${id}`,
  ): LinhaReserva {
    return {
      id,
      status,
      imovelRef,
      dataReferencia: paraDataCivil(dia),
      criadoEm: CRIADO_EM,
      corretor: { nomeExibicao: `Corretor ${id}` },
    };
  }

  function proposta(
    id: string,
    status: "AGUARDANDO" | "ACEITA" | "REJEITADA",
    dia: string,
    imovelRef: string | null = `AP-${id}`,
  ): LinhaLancamento {
    return {
      id,
      tipo: "PROPOSTA",
      corretorId: "c1",
      equipeId: "e1",
      dataReferencia: paraDataCivil(dia),
      valor: null,
      statusProposta: status,
      imovelRef,
      criadoEm: CRIADO_EM,
      corretor: { nomeExibicao: `Corretor ${id}` },
      participacoes: [],
    };
  }

  it("a leitura de reservas não filtra, não ordena e não corta", async () => {
    const { prisma, chamadas } = criarPrismaFalso({
      ...LEITURAS_BASE,
      reservas: [reserva("a", "ATIVA", "2026-08-10")],
    });
    await obterMetricasPainel(prisma, AGORA);

    assert.equal(chamadas.reservaLocacao.length, 1, "uma leitura de reservas");
    const argumentos = chamadas.reservaLocacao[0] as Record<string, unknown>;
    assert.equal("where" in argumentos, false, "sem filtro de status");
    assert.equal("orderBy" in argumentos, false, "a ordem é do núcleo");
    assert.equal("take" in argumentos, false, "o corte em três é do núcleo");
  });

  it("as propostas saem da leitura de lançamentos, sem consulta própria", async () => {
    const { prisma, chamadas } = criarPrismaFalso(LEITURAS_BASE);
    await obterMetricasPainel(prisma, AGORA);

    // Quatro modelos com leitura: lançamento, saldo, corretor, equipe e reserva.
    assert.equal(chamadas.lancamento.length, 1, "uma leitura de lançamentos, e só uma");
  });

  it("transporta as candidatas e deixa o núcleo selecionar", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [
        proposta("p1", "AGUARDANDO", "2026-08-01"),
        proposta("p2", "AGUARDANDO", "2026-08-02"),
        proposta("p3", "AGUARDANDO", "2026-08-03"),
        proposta("p4", "AGUARDANDO", "2026-08-04"),
        proposta("p5", "ACEITA", "2026-08-05"),
      ],
      reservas: [
        reserva("r1", "ATIVA", "2026-08-01"),
        reserva("r2", "ATIVA", "2026-08-02"),
        reserva("r3", "ATIVA", "2026-08-03"),
        reserva("r4", "ATIVA", "2026-08-04"),
        reserva("r5", "CANCELADA", "2026-08-05"),
      ],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.propostas.estadoLeitura, "OK");
    if (resultado.propostas.estadoLeitura !== "OK") return;
    assert.deepEqual(
      resultado.propostas.dados.map((item) => item.id),
      ["p4", "p3", "p2", "p1"],
      "só AGUARDANDO, todas, das mais recentes para as mais antigas",
    );

    assert.equal(resultado.reservas.estadoLeitura, "OK");
    if (resultado.reservas.estadoLeitura !== "OK") return;
    assert.deepEqual(
      resultado.reservas.dados.map((item) => item.id),
      ["r4", "r3", "r2", "r1"],
      "quantas cabem por vez é da tela, não da fronteira",
    );
  });

  it("a proposta legada sem imóvel chega com `null`, sem texto inventado", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [proposta("legada", "AGUARDANDO", "2026-08-01", null)],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.propostas.estadoLeitura, "OK");
    if (resultado.propostas.estadoLeitura !== "OK") return;
    assert.equal(resultado.propostas.dados[0].imovelRef, null);
  });

  it("falha na leitura de reservas derruba só as reservas", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      reservas: falha("reservas"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.reservas.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.propostas.estadoLeitura, "OK", "propostas não dependem de reservas");
    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    assert.equal(resultado.equipes.estadoLeitura, "OK");
  });

  it("falha na leitura de lançamentos derruba as propostas junto", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: falha("lançamentos"),
      reservas: [reserva("a", "ATIVA", "2026-08-10")],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    // As propostas saem da mesma leitura; as reservas, não.
    assert.equal(resultado.propostas.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.reservas.estadoLeitura, "OK");
  });

  it("o ramo indisponível não carrega dados", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, reservas: falha("reservas") });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal("dados" in resultado.reservas, false);
  });

  it("nenhuma candidata devolve lista vazia, que é dado e não ausência", async () => {
    const { prisma } = criarPrismaFalso({ ...LEITURAS_BASE, reservas: [] });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.reservas.estadoLeitura, "OK");
    if (resultado.reservas.estadoLeitura !== "OK") return;
    assert.deepEqual(resultado.reservas.dados, []);
  });

  it("o saldo chega com a precisão que o banco devolveu", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      saldos: [saldo("VENDA", 500, "1000", "00", "2026-06-30", "MINIMO_CONHECIDO").linha],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    if (resultado.empresa.acumulados.estadoLeitura !== "OK") return;
    const { vendidos } = resultado.empresa.acumulados.dados;
    assert.equal(vendidos.estado, "OK");
    if (vendidos.estado !== "OK") return;
    assert.equal(vendidos.precisao, "MINIMO_CONHECIDO");
  });
});

describe("dinheiro atravessa a fronteira como string canônica", () => {
  it("um milhão redondo vira \"1000000.00\", nunca number", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [lancamento("VENDA", "c1", "e1", "2026-08-10", "1000000").linha],
      saldos: [],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;

    const mensal = resultado.empresa.periodos.dados.vgvPeriodos.mensal;
    assert.equal(typeof mensal, "string");
    assert.equal(mensal, "1000000.00");
  });

  it("os centavos do saldo de abertura chegam inteiros ao acumulado", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [],
      saldos: [saldo("VENDA", 3, "999999999999", "99", "2026-06-30").linha],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    if (resultado.empresa.acumulados.estadoLeitura !== "OK") return;
    assert.equal(resultado.empresa.acumulados.dados.vgv.valor, "999999999999.99");
  });
});

describe("a leitura de saldo é restrita aos tipos suportados", () => {
  it("o where limita a VENDA e AVALIACAO_GOOGLE", async () => {
    const { prisma, chamadas } = criarPrismaFalso(LEITURAS_BASE);
    await obterMetricasPainel(prisma, AGORA);

    const argumentos = chamadas.saldoHistorico[0] as { where: { tipo: { in: string[] } } };
    assert.deepEqual([...argumentos.where.tipo.in].sort(), ["AVALIACAO_GOOGLE", "VENDA"]);
  });

  it("um tipo fora do domínio de saldo não entra, mesmo se o banco devolver", async () => {
    // O `where` já impede; o guard da fronteira é a segunda linha de defesa, e é
    // ele que impede um cast largo fingindo que todo tipo tem saldo.
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      saldos: [
        saldo("VENDA", 10, "1000", "00", "2026-06-30").linha,
        {
          tipo: "LOCACAO",
          quantidade: 99,
          valorTotal: decimal("777"),
          precisao: "EXATO",
          dataCorte: paraDataCivil("2026-06-30"),
        },
      ],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    if (resultado.empresa.acumulados.estadoLeitura !== "OK") return;
    // 10 do saldo mais as duas vendas do cenário base, ambas posteriores ao
    // corte. O saldo de `LOCACAO` não acrescenta nada, porque não entrou.
    assert.deepEqual(resultado.empresa.acumulados.dados.vendidos, { estado: "OK", valor: 12, precisao: "EXATO" });
    assert.equal(resultado.empresa.acumulados.dados.avaliacoes.estado, "SEM_SALDO_HISTORICO");
  });
});

describe("as leituras não ordenam nem agregam no banco", () => {
  it("nenhum findMany pede orderBy", async () => {
    const { prisma, chamadas } = criarPrismaFalso(LEITURAS_BASE);
    await obterMetricasPainel(prisma, AGORA);

    const todas = [
      ...chamadas.lancamento,
      ...chamadas.saldoHistorico,
      ...chamadas.corretor,
      ...chamadas.equipe,
    ] as Record<string, unknown>[];

    assert.equal(todas.length, 4);
    for (const argumentos of todas) {
      assert.equal("orderBy" in argumentos, false, "a ordem determinística é do núcleo");
    }
  });
});

describe("uma única referência temporal alimenta os blocos", () => {
  it("o mesmo `agora` decide o mês corrente na empresa e nas equipes", async () => {
    // Só há evento em julho; com `agora` em agosto, os blocos precisam
    // concordar que o mês corrente está sem dados.
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_BASE,
      lancamentos: [lancamento("VENDA", "c1", "e1", "2026-07-20", "400000").linha],
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.equipes.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;
    if (resultado.equipes.estadoLeitura !== "OK") return;

    assert.equal(resultado.empresa.periodos.dados.estadoPeriodoMensal, "SEM_DADOS");
    assert.equal(resultado.equipes.dados.estadoPeriodoMensal, "SEM_DADOS");
    // E o trimestre, que enxerga julho, continua somando.
    assert.equal(resultado.empresa.periodos.dados.vgvPeriodos.trimestral, "400000.00");
  });
});

/* ------------------------------------------------------------------ */
/* E4 — leitura do VGV histórico mensal                                */
/* ------------------------------------------------------------------ */

/**
 * A sexta leitura da fronteira.
 *
 * O que se prova aqui é de fronteira, não de cálculo: que a consulta acontece,
 * que ela pede só o que o núcleo usa, que `Decimal` vira string canônica sem
 * passar por `number`, e o que cada bloco faz quando **essa** leitura falha.
 * Quanto dá cada número continua sendo da `tests/metricas.test.ts`.
 */

/** Os sete meses fechados de 2026 — a massa de referência do ciclo. */
const HISTORICOS = [
  historico("2026-01", "2000000"),
  historico("2026-02", "3000000"),
  historico("2026-03", "4000000"),
  historico("2026-04", "5000000"),
  historico("2026-05", "6000000"),
  historico("2026-06", "7000000"),
  historico("2026-07", "8000000"),
];

const DOMINIO_HISTORICOS = HISTORICOS.map((par) => par.dominio);

/** A venda real de agosto do caso de referência. */
const VENDA_DE_AGOSTO = lancamento("VENDA", "c1", "e1", "2026-08-14", "6900000");

const LEITURAS_REFERENCIA: Leituras = {
  lancamentos: [VENDA_DE_AGOSTO.linha],
  saldos: SALDOS.map((par) => par.linha),
  corretores: CORRETORES,
  equipes: EQUIPES,
  historicos: HISTORICOS.map((par) => par.linha),
};

describe("E4 — a fronteira lê o VGV histórico mensal", () => {
  it("1. a leitura acontece e pede só competência e valor", async () => {
    const { prisma, chamadas } = criarPrismaFalso(LEITURAS_REFERENCIA);
    await obterMetricasPainel(prisma, AGORA);

    assert.equal(chamadas.vgvHistoricoMensal.length, 1, "uma consulta, e uma só");

    const argumentos = chamadas.vgvHistoricoMensal[0] as {
      select?: Record<string, unknown>;
      where?: unknown;
      orderBy?: unknown;
      take?: unknown;
    };

    assert.deepEqual(
      Object.keys(argumentos.select ?? {}).sort(),
      ["competencia", "valorTotal"],
      "nada além do que o núcleo calcula",
    );
    // A regra de recorte é do núcleo (DEC-013): o banco entrega as linhas e não
    // decide período, ordem nem teto.
    assert.equal(argumentos.where, undefined, "sem where");
    assert.equal(argumentos.orderBy, undefined, "sem orderBy");
    assert.equal(argumentos.take, undefined, "sem take");
  });

  it("2/3. cada Decimal vira string canônica e o domínio chega inteiro ao núcleo", async () => {
    const { prisma } = criarPrismaFalso(LEITURAS_REFERENCIA);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    // Comparar com a própria função pura alimentada pelo domínio esperado é o
    // que prova a conversão sem reimplementar fórmula nenhuma. O dublê de
    // `Decimal` já cobra `toFixed(2)` a cada chamada.
    const esperado = calcularMetricasEmpresa(
      [VENDA_DE_AGOSTO.dominio],
      DOMINIO_SALDOS,
      DOMINIO_HISTORICOS,
      AGORA,
    );

    assert.deepEqual(resultado.empresa, {
      periodos: { estadoLeitura: "OK", dados: periodicasDe(esperado) },
      acumulados: { estadoLeitura: "OK", dados: esperado.acumulados },
    });
  });

  it("4/5/6. caso de referência: 6,9 mensal · 14,9 trimestral · 41,9 anual", async () => {
    const { prisma } = criarPrismaFalso(LEITURAS_REFERENCIA);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;

    assert.deepEqual(resultado.empresa.periodos.dados.vgvPeriodos, {
      mensal: "6900000.00",
      trimestral: "14900000.00",
      anual: "41900000.00",
    });
  });

  it("7. o histórico mensal não toca nos acumulados", async () => {
    const comHistorico = await obterMetricasPainel(
      criarPrismaFalso(LEITURAS_REFERENCIA).prisma,
      AGORA,
    );
    const semHistorico = await obterMetricasPainel(
      criarPrismaFalso({ ...LEITURAS_REFERENCIA, historicos: [] }).prisma,
      AGORA,
    );

    assert.deepEqual(comHistorico.empresa.acumulados, semHistorico.empresa.acumulados);

    // O saldo de abertura continua sendo o único dono dos acumulados: 5.000.000
    // do saldo mais a venda de agosto, que é posterior ao corte de 30/06.
    assert.equal(comHistorico.empresa.acumulados.estadoLeitura, "OK");
    if (comHistorico.empresa.acumulados.estadoLeitura !== "OK") return;
    assert.equal(comHistorico.empresa.acumulados.dados.vgv.valor, "11900000.00");
    assert.equal(comHistorico.empresa.acumulados.dados.vendidos.valor, 101);
  });

  it("8. o histórico mensal não toca nas equipes", async () => {
    const comHistorico = await obterMetricasPainel(
      criarPrismaFalso(LEITURAS_REFERENCIA).prisma,
      AGORA,
    );
    const semHistorico = await obterMetricasPainel(
      criarPrismaFalso({ ...LEITURAS_REFERENCIA, historicos: [] }).prisma,
      AGORA,
    );

    assert.deepEqual(comHistorico.equipes, semHistorico.equipes);
  });

  it("9. falha só desta leitura derruba os períodos", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_REFERENCIA,
      historicos: falha("vgv_historico_mensal"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    // Sem os agregados de jan–jul, o trimestral e o anual pareceriam válidos e
    // estariam errados. `[]` como fallback seria pior do que dizer que a leitura
    // não aconteceu (DEC-042).
    assert.equal(resultado.empresa.periodos.estadoLeitura, "INDISPONIVEL");
    assert.equal(
      "dados" in resultado.empresa.periodos,
      false,
      "o ramo indisponível não carrega número nenhum",
    );
  });

  it("10. e os acumulados continuam OK nessa falha", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_REFERENCIA,
      historicos: falha("vgv_historico_mensal"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    if (resultado.empresa.acumulados.estadoLeitura !== "OK") return;

    // Os acumulados não dependem do histórico mensal, então derrubá-los junto
    // apagaria dado bom por falha alheia.
    assert.equal(resultado.empresa.acumulados.dados.vgv.valor, "11900000.00");
  });

  it("11. equipes, propostas e reservas também continuam OK nessa falha", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_REFERENCIA,
      historicos: falha("vgv_historico_mensal"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.equipes.estadoLeitura, "OK");
    assert.equal(resultado.propostas.estadoLeitura, "OK");
    assert.equal(resultado.reservas.estadoLeitura, "OK");
  });

  it("12. lista histórica vazia preserva exatamente o comportamento anterior", async () => {
    const { prisma } = criarPrismaFalso(LEITURAS_BASE);
    const resultado = await obterMetricasPainel(prisma, AGORA);

    const esperado = calcularMetricasEmpresa(DOMINIO_LANCAMENTOS, DOMINIO_SALDOS, [], AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;
    assert.deepEqual(resultado.empresa.periodos.dados, periodicasDe(esperado));
  });

  it("a falha das outras leituras não é confundida com a desta", async () => {
    // Saldo cai sozinho: períodos continuam OK, porque o histórico veio.
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_REFERENCIA,
      saldos: falha("saldo_historico"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "INDISPONIVEL");
    if (resultado.empresa.periodos.estadoLeitura !== "OK") return;
    assert.equal(resultado.empresa.periodos.dados.vgvPeriodos.anual, "41900000.00");
  });

  it("lançamentos e histórico caindo juntos derrubam os dois blocos", async () => {
    const { prisma } = criarPrismaFalso({
      ...LEITURAS_REFERENCIA,
      lancamentos: falha("lancamentos"),
      historicos: falha("vgv_historico_mensal"),
    });
    const resultado = await obterMetricasPainel(prisma, AGORA);

    assert.equal(resultado.empresa.periodos.estadoLeitura, "INDISPONIVEL");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "INDISPONIVEL");
  });
});
