/**
 * Núcleo de cálculo do painel — puro.
 *
 * Toda regra que produz número exibido na TV converge para cá (DEC-013). Este
 * módulo **não** conhece Prisma, banco, ambiente nem React: recebe os dados já
 * lidos e devolve domínio. A leitura entra na F3.3, e a apresentação — moeda em
 * pt-BR, `R$`, `mi`, `bi`, `—` — na F3.4.
 *
 * Duas disciplinas atravessam o arquivo inteiro:
 *
 * - **dinheiro nunca vira `number`.** Valores entram e saem como string decimal
 *   canônica (`"1250000.00"`) e somam em centavos com `bigint`. Um double perde
 *   centavos no topo do `Decimal(14, 2)`, e o total agregado passa dele.
 * - **calendário não se reimplementa aqui.** As janelas civis vêm de
 *   `src/lib/datas.ts` (F3.1), e toda comparação de período é
 *   `inicio <= data < fimExclusivo`.
 *
 * Esta fatia (F3.2A) cobre só o nível empresa. Rankings, elenco de equipe e
 * `CONFIGURACAO_INVALIDA` são da F3.2B.
 */

import { anoCorrente, type JanelaCivil, mesCorrente, trimestreCorrente } from "@/lib/datas";

/** Os sete tipos do enum, na ordem de domínio do quadro mensal. */
export const TIPOS_EVENTO = [
  "VENDA",
  "LOCACAO",
  "CAPTACAO_VENDA",
  "CAPTACAO_EXCLUSIVA",
  "CAPTACAO_LOCACAO",
  "PROPOSTA",
  "AVALIACAO_GOOGLE",
] as const;

export type TipoEventoMetrica = (typeof TIPOS_EVENTO)[number];

/** Só os tipos que têm saldo de abertura (DEC-035). */
export type TipoSaldoMetrica = Extract<TipoEventoMetrica, "VENDA" | "AVALIACAO_GOOGLE">;

/**
 * O lançamento como o cálculo precisa dele — não o modelo Prisma inteiro.
 *
 * `corretorId` já serve ao diagnóstico de erro de venda sem valor. `equipeId` é o
 * único campo ainda sem lógica: fica carregado no formato de entrada para as
 * métricas por equipe da F3.2B, para o formato não mudar no meio.
 */
export type LancamentoMetrica = {
  tipo: TipoEventoMetrica;
  corretorId: string;
  equipeId: string;
  /** Data civil do fato: meia-noite UTC do dia, como em `datas.ts`. */
  dataReferencia: Date;
  /** String decimal canônica, ou `null` nos tipos que não têm valor. */
  valor: string | null;
};

/** O saldo de abertura de um tipo, autoritativo até o próprio corte (DEC-036). */
export type SaldoHistoricoMetrica = {
  tipo: TipoSaldoMetrica;
  quantidade: number;
  valorTotal: string;
  dataCorte: Date;
};

/** Há ou não evento no período. Nada além disso (DEC-039). */
export type EstadoPeriodo = "OK" | "SEM_DADOS";

/** Existe ou não o saldo de abertura daquele tipo (DEC-037). */
export type EstadoAcumulado = "OK" | "SEM_SALDO_HISTORICO";

/**
 * Um acumulado é um par estado + valor, e `valor` é `null` sempre que o estado
 * não for `OK`. Zero é um número que afirma alguma coisa; ausência de saldo não
 * afirma nada (DEC-014, DEC-042).
 */
export type Acumulado<T> = {
  estado: EstadoAcumulado;
  valor: T | null;
};

/** As sete contagens do mês corrente. Sem VGV: ele não é linha do quadro. */
export type QuadroMensal = Record<TipoEventoMetrica, number>;

export type MetricasEmpresaPuras = {
  estadoPeriodoMensal: EstadoPeriodo;
  acumulados: {
    vendidos: Acumulado<number>;
    vgv: Acumulado<string>;
    avaliacoes: Acumulado<number>;
  };
  vgvPeriodos: {
    mensal: string;
    trimestral: string;
    anual: string;
  };
  quadroMensal: QuadroMensal;
};

const VALOR_CANONICO = /^(\d+)\.(\d{2})$/;

/** `"1250000.25"` → `125000025n`. Recusa qualquer forma não canônica. */
function paraCentavos(valor: string, origem: string): bigint {
  const partes = VALOR_CANONICO.exec(valor);
  if (!partes) {
    throw new Error(
      `Valor monetário fora da forma canônica em ${origem}: ${JSON.stringify(valor)} — ` +
        `esperado dígitos com exatamente duas casas decimais, como "1250000.00".`,
    );
  }
  // Concatenar já é a conversão: parte inteira seguida dos centavos.
  return BigInt(partes[1] + partes[2]);
}

/** `125000025n` → `"1250000.25"`. O total agregado pode passar de `Decimal(14, 2)`. */
function deCentavos(centavos: bigint): string {
  const digitos = centavos.toString().padStart(3, "0");
  return `${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}

/**
 * O valor de uma venda, ou erro.
 *
 * Venda sem valor **não** vira zero: o VGV ficaria plausível e errado, sem nada
 * na tela indicando que falta dado. Falhar aqui deixa a decisão para a camada de
 * leitura, que sabe transformar falha em política de exibição.
 */
function valorDaVenda(lancamento: LancamentoMetrica): string {
  if (lancamento.valor === null) {
    const dia = lancamento.dataReferencia.toISOString().slice(0, 10);
    throw new Error(
      `Lançamento de VENDA sem valor não pode entrar no VGV: corretor ${lancamento.corretorId}, ` +
        `data de referência ${dia}.`,
    );
  }
  return lancamento.valor;
}

/**
 * Soma exata, em centavos. Lista vazia é `"0.00"` — zero real, não ausência.
 *
 * `BigInt(0)` em vez do literal `0n` porque o `target` do projeto é ES2017, onde
 * literais BigInt não compilam; o tipo existe pela `lib`, e a chamada resolve.
 */
function somar(valores: readonly string[], origem: string): string {
  let centavos = BigInt(0);
  for (const valor of valores) centavos += paraCentavos(valor, origem);
  return deCentavos(centavos);
}

/** `[inicio, fimExclusivo)` — nunca "último segundo do dia". */
function dentroDaJanela(janela: JanelaCivil, data: Date): boolean {
  return data >= janela.inicio && data < janela.fimExclusivo;
}

/**
 * Só o que veio **depois** do corte. O corte é inclusivo no saldo, então um
 * evento exatamente em `dataCorte` já está representado ali e não soma de novo
 * (DEC-036).
 */
function posterioresAoCorte(
  lancamentos: readonly LancamentoMetrica[],
  tipo: TipoSaldoMetrica,
  dataCorte: Date,
): LancamentoMetrica[] {
  return lancamentos.filter(
    (lancamento) => lancamento.tipo === tipo && lancamento.dataReferencia > dataCorte,
  );
}

/** VGV de uma janela: só `VENDA`, só lançamentos, saldo com participação zero. */
function vgvDaJanela(
  lancamentos: readonly LancamentoMetrica[],
  janela: JanelaCivil,
  origem: string,
): string {
  const vendas = lancamentos.filter(
    (lancamento) =>
      lancamento.tipo === "VENDA" && dentroDaJanela(janela, lancamento.dataReferencia),
  );
  return somar(vendas.map(valorDaVenda), origem);
}

/** As sete contagens. Cada tipo incrementa só a própria linha (DEC-003). */
function contarPorTipo(lancamentos: readonly LancamentoMetrica[]): QuadroMensal {
  const quadro = Object.fromEntries(TIPOS_EVENTO.map((tipo) => [tipo, 0])) as QuadroMensal;
  for (const lancamento of lancamentos) quadro[lancamento.tipo] += 1;
  return quadro;
}

/**
 * Métricas de nível empresa a partir dos dados já lidos.
 *
 * `agora` é injetável para o teste não depender do relógio; só serve para
 * descobrir qual é o período civil corrente em São Paulo.
 *
 * Recebe **todos** os lançamentos: o recorte por período é feito aqui, e o
 * acumulado precisa enxergar os anteriores ao corte para saber que não deve
 * somá-los. Não existe filtro global por `dataCorte`.
 */
export function calcularMetricasEmpresa(
  lancamentos: readonly LancamentoMetrica[],
  saldos: readonly SaldoHistoricoMetrica[],
  agora: Date = new Date(),
): MetricasEmpresaPuras {
  const mes = mesCorrente(agora);
  const doMes = lancamentos.filter((lancamento) =>
    dentroDaJanela(mes, lancamento.dataReferencia),
  );

  const saldoVenda = saldos.find((saldo) => saldo.tipo === "VENDA");
  const saldoAvaliacao = saldos.find((saldo) => saldo.tipo === "AVALIACAO_GOOGLE");

  const vendasPosteriores = saldoVenda
    ? posterioresAoCorte(lancamentos, "VENDA", saldoVenda.dataCorte)
    : [];
  const avaliacoesPosteriores = saldoAvaliacao
    ? posterioresAoCorte(lancamentos, "AVALIACAO_GOOGLE", saldoAvaliacao.dataCorte)
    : [];

  const semSaldo = { estado: "SEM_SALDO_HISTORICO", valor: null } as const;

  return {
    // Mês sem nenhum lançamento não afirma desempenho zero (DEC-039).
    estadoPeriodoMensal: doMes.length === 0 ? "SEM_DADOS" : "OK",

    acumulados: {
      vendidos: saldoVenda
        ? { estado: "OK", valor: saldoVenda.quantidade + vendasPosteriores.length }
        : semSaldo,
      vgv: saldoVenda
        ? {
            estado: "OK",
            valor: somar(
              [saldoVenda.valorTotal, ...vendasPosteriores.map(valorDaVenda)],
              "VGV acumulado",
            ),
          }
        : semSaldo,
      avaliacoes: saldoAvaliacao
        ? { estado: "OK", valor: saldoAvaliacao.quantidade + avaliacoesPosteriores.length }
        : semSaldo,
    },

    // Períodos ignoram saldo e `dataCorte` por completo (DEC-004, DEC-036).
    vgvPeriodos: {
      mensal: vgvDaJanela(lancamentos, mes, "VGV mensal"),
      trimestral: vgvDaJanela(lancamentos, trimestreCorrente(agora), "VGV trimestral"),
      anual: vgvDaJanela(lancamentos, anoCorrente(agora), "VGV anual"),
    },

    quadroMensal: contarPorTipo(doMes),
  };
}
