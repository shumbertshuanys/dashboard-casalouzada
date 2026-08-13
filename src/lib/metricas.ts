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
 * São duas entradas independentes: `calcularMetricasEmpresa` para os números da
 * empresa (F3.2A) e `calcularMetricasEquipes` para os quadros das equipes
 * (F3.2B). Nenhuma das duas lê banco — a leitura é da F3.3.
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
 * `equipeId` é a equipe **gravada no evento**, e é sempre ela que credita a
 * produção — nunca a lotação atual do corretor (DEC-002).
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

/** O corretor como o ranking precisa dele. Sem foto, CRECI ou datas. */
export type CorretorMetrica = {
  id: string;
  /** Nome curto, o que vai para a TV. */
  nomeExibicao: string;
  /** Lotação **atual** — serve ao elenco e ao headcount, nunca ao crédito. */
  equipeId: string;
  ativo: boolean;
};

/** A equipe como o painel precisa dela. */
export type EquipeMetrica = {
  id: string;
  nome: string;
  gerenteNome: string;
  ordemExibicao: number;
  ativa: boolean;
};

/** A área dos quadros de equipe está utilizável ou não (DEC-040). */
export type EstadoEquipes = "OK" | "CONFIGURACAO_INVALIDA";

/** As oito métricas do ciclo de rotação, na ordem do protótipo (DEC-033). */
export const CHAVES_RANKING = [
  "vendidos",
  "vgv",
  "locados",
  "capVenda",
  "exclusivas",
  "capLocacao",
  "propostas",
  "avaliacoes",
] as const;

export type ChaveRanking = (typeof CHAVES_RANKING)[number];

/** As sete métricas de contagem — todas menos o VGV, que é dinheiro. */
export type ChaveRankingContagem = Exclude<ChaveRanking, "vgv">;

export type LinhaRankingContagem = {
  corretorId: string;
  nomeExibicao: string;
  valor: number;
};

export type LinhaRankingVgv = {
  corretorId: string;
  nomeExibicao: string;
  /** String decimal canônica, como todo dinheiro daqui. */
  valor: string;
};

/**
 * Os oito rankings, um por métrica do ciclo.
 *
 * Escrito chave a chave, e não como `Record<…> & { vgv }`: a interseção não é
 * indexável por `ChaveRanking`, então quem percorre as oito métricas em ordem
 * precisaria de cast.
 */
export type RankingsDaEquipe = {
  vendidos: LinhaRankingContagem[];
  vgv: LinhaRankingVgv[];
  locados: LinhaRankingContagem[];
  capVenda: LinhaRankingContagem[];
  exclusivas: LinhaRankingContagem[];
  capLocacao: LinhaRankingContagem[];
  propostas: LinhaRankingContagem[];
  avaliacoes: LinhaRankingContagem[];
};

export type MetricasDeEquipe = {
  id: string;
  nome: string;
  gerenteNome: string;
  /** Headcount ativo **atual**, não o tamanho do elenco do mês. */
  totalCorretores: number;
  rankings: RankingsDaEquipe;
};

export type MetricasEquipesPuras = {
  estadoPeriodoMensal: EstadoPeriodo;
  estadoEquipes: EstadoEquipes;
  /** Vazio quando o estado não é `OK`: não se renderiza subconjunto arbitrário. */
  equipes: MetricasDeEquipe[];
};

/** O painel v1 tem quatro colunas fixas: mensal geral mais três equipes (DEC-040). */
export const EQUIPES_ATIVAS_ESPERADAS = 3;

/** Qual tipo de evento alimenta cada ranking de contagem. */
const TIPO_DA_CONTAGEM: Record<ChaveRankingContagem, TipoEventoMetrica> = {
  vendidos: "VENDA",
  locados: "LOCACAO",
  capVenda: "CAPTACAO_VENDA",
  exclusivas: "CAPTACAO_EXCLUSIVA",
  capLocacao: "CAPTACAO_LOCACAO",
  propostas: "PROPOSTA",
  avaliacoes: "AVALIACAO_GOOGLE",
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

/**
 * Mês sem **nenhum** lançamento não afirma desempenho zero (DEC-039).
 *
 * A mesma regra vale para os números da empresa e para os quadros de equipe, e
 * mora num lugar só para as duas entradas não divergirem.
 */
function estadoDoMes(lancamentosDoMes: readonly LancamentoMetrica[]): EstadoPeriodo {
  return lancamentosDoMes.length === 0 ? "SEM_DADOS" : "OK";
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
    estadoPeriodoMensal: estadoDoMes(doMes),

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

/**
 * Colação pt-BR para **nomes**, usada só no desempate dos rankings.
 *
 * `Intl` entra aqui só para colação textual: ordenar "Ávila" antes de "Bastos"
 * exige conhecer a regra do idioma. Dinheiro não é formatado nesta camada, e sua
 * aritmética continua exata, em centavos `bigint`.
 */
const COLACAO_PT_BR = new Intl.Collator("pt-BR");

/** Comparação de string por ordem de código, para o desempate final por id. */
function compararTexto(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Ordena um ranking: resultado decrescente, depois `nomeExibicao` em pt-BR
 * crescente, depois `id` crescente.
 *
 * Os dois desempates existem para a ordem ser **determinística** entre
 * atualizações: sem eles, dois corretores empatados poderiam trocar de lugar a
 * cada refresh da TV sem que nada tivesse mudado. Copia antes de ordenar — a
 * entrada do chamador não é mexida.
 */
function ordenarRanking<T extends { corretorId: string; nomeExibicao: string }>(
  linhas: readonly T[],
  compararResultado: (a: T, b: T) => number,
): T[] {
  return [...linhas].sort((a, b) => {
    const porResultado = compararResultado(a, b);
    if (porResultado !== 0) return porResultado;

    const porNome = COLACAO_PT_BR.compare(a.nomeExibicao, b.nomeExibicao);
    if (porNome !== 0) return porNome;

    return compararTexto(a.corretorId, b.corretorId);
  });
}

/**
 * Compara dois valores monetários canônicos, do maior para o menor.
 *
 * Pela mesma representação exata em centavos que o resto do núcleo monetário
 * usa, para não abrir um segundo caminho baseado em ponto flutuante.
 */
function compararDinheiroDesc(a: string, b: string): number {
  const centavosA = paraCentavos(a, "ranking de VGV");
  const centavosB = paraCentavos(b, "ranking de VGV");
  if (centavosA > centavosB) return -1;
  if (centavosA < centavosB) return 1;
  return 0;
}

/**
 * O elenco mensal de uma equipe: a união dos corretores **ativos** lotados nela
 * hoje com os corretores **ativos** que tenham lançamento do mês creditado a ela
 * (DEC-038).
 *
 * A união é por `id`, e sai sem repetição porque cada corretor aparece uma vez
 * na lista de entrada. Corretor inativo não entra em elenco nenhum (DEC-006) —
 * seus eventos continuam contando nos totais da empresa, que são calculados dos
 * lançamentos e não passam por aqui.
 */
function elencoDaEquipe(
  equipe: EquipeMetrica,
  corretores: readonly CorretorMetrica[],
  lancamentosDaEquipeNoMes: readonly LancamentoMetrica[],
): CorretorMetrica[] {
  const produziramNoMes = new Set(
    lancamentosDaEquipeNoMes.map((lancamento) => lancamento.corretorId),
  );

  return corretores.filter(
    (corretor) =>
      corretor.ativo && (corretor.equipeId === equipe.id || produziramNoMes.has(corretor.id)),
  );
}

/** Os oito rankings de uma equipe, já ordenados. */
function rankingsDaEquipe(
  elenco: readonly CorretorMetrica[],
  lancamentosDaEquipeNoMes: readonly LancamentoMetrica[],
  nomeDaEquipe: string,
): RankingsDaEquipe {
  const porCorretor = new Map<string, LancamentoMetrica[]>();
  for (const lancamento of lancamentosDaEquipeNoMes) {
    const lista = porCorretor.get(lancamento.corretorId);
    if (lista) lista.push(lancamento);
    else porCorretor.set(lancamento.corretorId, [lancamento]);
  }

  // Corretor ativo sem evento aparece com zero real: o elenco inteiro é
  // percorrido, não só quem produziu.
  const contagem = (chave: ChaveRankingContagem): LinhaRankingContagem[] =>
    ordenarRanking(
      elenco.map((corretor) => ({
        corretorId: corretor.id,
        nomeExibicao: corretor.nomeExibicao,
        valor: (porCorretor.get(corretor.id) ?? []).filter(
          (lancamento) => lancamento.tipo === TIPO_DA_CONTAGEM[chave],
        ).length,
      })),
      (a, b) => b.valor - a.valor,
    );

  const vgv = ordenarRanking(
    elenco.map((corretor) => ({
      corretorId: corretor.id,
      nomeExibicao: corretor.nomeExibicao,
      valor: somar(
        (porCorretor.get(corretor.id) ?? [])
          .filter((lancamento) => lancamento.tipo === "VENDA")
          .map(valorDaVenda),
        `ranking de VGV da equipe ${nomeDaEquipe}`,
      ),
    })),
    (a, b) => compararDinheiroDesc(a.valor, b.valor),
  );

  return {
    vendidos: contagem("vendidos"),
    vgv,
    locados: contagem("locados"),
    capVenda: contagem("capVenda"),
    exclusivas: contagem("exclusivas"),
    capLocacao: contagem("capLocacao"),
    propostas: contagem("propostas"),
    avaliacoes: contagem("avaliacoes"),
  };
}

/**
 * Métricas dos quadros de equipe a partir dos dados já lidos.
 *
 * Recorte fixo: **mês corrente**. Rankings são produção do mês, e não tocam
 * trimestre, ano, saldo histórico nem `dataCorte`.
 *
 * Se as equipes ativas não forem exatamente três, devolve
 * `CONFIGURACAO_INVALIDA` com a lista **vazia**. Vazia de propósito: entregar um
 * subconjunto deixaria a apresentação renderizar três equipes escolhidas por
 * acaso e esconder a quarta, que é justamente o que a DEC-040 proíbe. Os números
 * da empresa não são afetados — `calcularMetricasEmpresa` nem enxerga equipes.
 */
export function calcularMetricasEquipes(
  lancamentos: readonly LancamentoMetrica[],
  corretores: readonly CorretorMetrica[],
  equipes: readonly EquipeMetrica[],
  agora: Date = new Date(),
): MetricasEquipesPuras {
  const mes = mesCorrente(agora);
  const doMes = lancamentos.filter((lancamento) =>
    dentroDaJanela(mes, lancamento.dataReferencia),
  );
  const estadoPeriodoMensal = estadoDoMes(doMes);

  const ativas = equipes.filter((equipe) => equipe.ativa);
  if (ativas.length !== EQUIPES_ATIVAS_ESPERADAS) {
    return { estadoPeriodoMensal, estadoEquipes: "CONFIGURACAO_INVALIDA", equipes: [] };
  }

  // A ordem da tela não pode depender da ordem em que os dados chegaram.
  const ordenadas = [...ativas].sort(
    (a, b) => a.ordemExibicao - b.ordemExibicao || compararTexto(a.id, b.id),
  );

  return {
    estadoPeriodoMensal,
    estadoEquipes: "OK",
    equipes: ordenadas.map((equipe) => {
      // O crédito é sempre por `Lancamento.equipeId` (DEC-002).
      const daEquipe = doMes.filter((lancamento) => lancamento.equipeId === equipe.id);
      const elenco = elencoDaEquipe(equipe, corretores, daEquipe);

      return {
        id: equipe.id,
        nome: equipe.nome,
        gerenteNome: equipe.gerenteNome,
        // Headcount atual: o transferido conta na equipe de hoje, não na antiga
        // onde ainda aparece por produção histórica.
        totalCorretores: corretores.filter(
          (corretor) => corretor.ativo && corretor.equipeId === equipe.id,
        ).length,
        rankings: rankingsDaEquipe(elenco, daEquipe, equipe.nome),
      };
    }),
  };
}
