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
 *
 * Desde a E3, venda tem crédito próprio: uma `VENDA` é **um** evento com N
 * participações, e o crédito mora nelas (DEC-051). A empresa continua contando
 * a venda e o valor **uma vez**; cada participante recebe +1 e a sua fração
 * igualitária; cada equipe recebe a soma das frações dos seus participantes
 * (DEC-052). Não existe total por equipe no painel v1 — os quadros mostram
 * rankings por corretor —, então a regra "a equipe conta a venda uma vez"
 * aparece aqui como o VGV da equipe **não** repetir o valor integral quando ela
 * tem mais de um participante na mesma venda.
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

/** Todos os tipos menos VENDA — os que creditam um corretor só. */
export type TipoEventoIndividual = Exclude<TipoEventoMetrica, "VENDA">;

/**
 * O crédito de um participante numa venda (DEC-051).
 *
 * `equipeId` é o **snapshot** da equipe no momento do fato, nunca a lotação
 * atual do corretor. `ordem` começa em 1, é contígua dentro da venda e decide
 * quem recebe os centavos residuais da divisão (DEC-052).
 */
export type ParticipacaoMetrica = {
  corretorId: string;
  equipeId: string;
  ordem: number;
};

/**
 * Uma venda: **um** evento, com o crédito nas participações (DEC-051).
 *
 * Não tem `corretorId` nem `equipeId` de propósito — depois do cutover da E3
 * esses campos são `NULL` no banco para toda VENDA, e o tipo impede que algum
 * cálculo volte a creditar venda por eles.
 */
export type VendaMetrica = {
  tipo: "VENDA";
  /** Data civil do fato: meia-noite UTC do dia, como em `datas.ts`. */
  dataReferencia: Date;
  /** String decimal canônica; `null` é venda sem valor, que não soma calada. */
  valor: string | null;
  participacoes: readonly ParticipacaoMetrica[];
};

/**
 * Qualquer evento que não seja venda: um corretor, uma equipe.
 *
 * `equipeId` é a equipe **gravada no evento**, e é sempre ela que credita a
 * produção — nunca a lotação atual do corretor (DEC-002).
 */
export type EventoIndividualMetrica = {
  tipo: TipoEventoIndividual;
  corretorId: string;
  equipeId: string;
  dataReferencia: Date;
  /** String decimal canônica, ou `null` nos tipos que não têm valor. */
  valor: string | null;
};

/**
 * O lançamento como o cálculo precisa dele — não o modelo Prisma inteiro.
 *
 * União discriminada por `tipo`: acessar `corretorId` numa venda não compila, e
 * acessar `participacoes` num evento individual também não. É o tipo que impede
 * a dualidade de crédito que a E3 veio eliminar.
 */
export type LancamentoMetrica = VendaMetrica | EventoIndividualMetrica;

/** Estreita a união pelo discriminante. */
export function ehVenda(lancamento: LancamentoMetrica): lancamento is VendaMetrica {
  return lancamento.tipo === "VENDA";
}

/**
 * A precisão de um saldo de abertura (DEC-054).
 *
 * `EXATO` afirma o número; `MINIMO_CONHECIDO` é um **piso** — o proprietário
 * sabe que houve pelo menos aquilo. O cálculo é o mesmo nos dois casos: a
 * precisão viaja junto do acumulado só para a apresentação saber se prefixa o
 * número com "+ de".
 */
export const PRECISOES_SALDO = ["EXATO", "MINIMO_CONHECIDO"] as const;

export type PrecisaoSaldoMetrica = (typeof PRECISOES_SALDO)[number];

/** O saldo de abertura de um tipo, autoritativo até o próprio corte (DEC-036). */
export type SaldoHistoricoMetrica = {
  tipo: TipoSaldoMetrica;
  quantidade: number;
  valorTotal: string;
  precisao: PrecisaoSaldoMetrica;
  dataCorte: Date;
};

/** Há ou não evento no período. Nada além disso (DEC-039). */
export type EstadoPeriodo = "OK" | "SEM_DADOS";

/** Existe ou não o saldo de abertura daquele tipo (DEC-037). */
export type EstadoAcumulado = "OK" | "SEM_SALDO_HISTORICO";

/**
 * Um acumulado: valor **e** a precisão do saldo que o originou, ou a ausência.
 *
 * União discriminada de propósito: `SEM_SALDO_HISTORICO` não tem valor nem
 * precisão, e o tipo impede afirmar "+ de —". Zero é um número que afirma alguma
 * coisa; ausência de saldo não afirma nada (DEC-014, DEC-042).
 */
export type Acumulado<T> =
  | { estado: "OK"; valor: T; precisao: PrecisaoSaldoMetrica }
  | { estado: "SEM_SALDO_HISTORICO"; valor: null };

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

/* ------------------------------------------------------------------ */
/* Destaques operacionais da Tela B (DEC-056)                          */
/* ------------------------------------------------------------------ */

/**
 * Os destaques operacionais **não são métrica** (DEC-014): são listas do que
 * está em aberto agora. Por isso não têm recorte de mês, não entram em nenhum
 * total e não conhecem `dataCorte` — e por isso, também, uma lista vazia é dado
 * legítimo, nunca `0`.
 *
 * O banco entrega candidatos; a regra de produto — quais status entram, em que
 * ordem e quantos cabem — mora inteira aqui (DEC-013).
 */

/** Quantos itens cabem em cada lista da Tela B (DEC-056). */
export const MAXIMO_DESTAQUES = 3;

/** Uma proposta candidata à lista "Propostas em andamento". */
export type PropostaOperacional = {
  id: string;
  status: StatusPropostaMetrica;
  /** Proposta legada pode não ter imóvel; ela continua entrando (DEC-053). */
  imovelRef: string | null;
  corretorNome: string;
  dataReferencia: Date;
  criadoEm: Date;
};

/** Uma reserva candidata à lista "Reservas de locação". */
export type ReservaOperacional = {
  id: string;
  status: StatusReservaMetrica;
  imovelRef: string;
  corretorNome: string;
  dataReferencia: Date;
  criadoEm: Date;
};

export type StatusPropostaMetrica = "AGUARDANDO" | "ACEITA" | "REJEITADA";
export type StatusReservaMetrica = "ATIVA" | "FINALIZADA" | "CANCELADA";

/** O que a Tela B mostra de cada item: imóvel e corretor, nada além (DEC-056). */
export type DestaqueOperacional = {
  id: string;
  /** `null` só em proposta legada sem imóvel; a apresentação decide o texto. */
  imovelRef: string | null;
  corretorNome: string;
};

/**
 * Mais recentes primeiro, com desempate determinístico.
 *
 * `dataReferencia` decrescente é a regra de produto; `criadoEm` decrescente
 * desempata o mesmo dia; e `id` crescente fecha o caso de dois registros
 * gravados no mesmo instante. Sem os dois desempates, dois itens empatados
 * poderiam trocar de lugar a cada atualização da TV sem nada ter mudado.
 *
 * Copia antes de ordenar: a lista do chamador não é mexida.
 */
function ordenarDestaques<T extends { dataReferencia: Date; criadoEm: Date; id: string }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) => {
    const porData = b.dataReferencia.getTime() - a.dataReferencia.getTime();
    if (porData !== 0) return porData;

    const porCriacao = b.criadoEm.getTime() - a.criadoEm.getTime();
    if (porCriacao !== 0) return porCriacao;

    return compararTexto(a.id, b.id);
  });
}

function paraDestaque(item: {
  id: string;
  imovelRef: string | null;
  corretorNome: string;
}): DestaqueOperacional {
  return { id: item.id, imovelRef: item.imovelRef, corretorNome: item.corretorNome };
}

/**
 * As até três propostas em andamento: só `AGUARDANDO`, mais recentes primeiro.
 *
 * Toda proposta continua contando na métrica mensal qualquer que seja o status
 * (DEC-053) — o filtro aqui é só da lista operacional. A proposta legada sem
 * imóvel **entra normalmente**: some da lista seria perder de vista algo que
 * está genuinamente em aberto.
 */
export function selecionarPropostasEmAndamento(
  candidatas: readonly PropostaOperacional[],
): DestaqueOperacional[] {
  return ordenarDestaques(candidatas.filter((proposta) => proposta.status === "AGUARDANDO"))
    .slice(0, MAXIMO_DESTAQUES)
    .map(paraDestaque);
}

/**
 * As até três reservas de locação ativas, mais recentes primeiro.
 *
 * Reserva é operação, não produção (DEC-055): `FINALIZADA` e `CANCELADA` saem da
 * lista sem afetar contagem nenhuma, porque nunca houve contagem de reserva.
 */
export function selecionarReservasAtivas(
  candidatas: readonly ReservaOperacional[],
): DestaqueOperacional[] {
  return ordenarDestaques(candidatas.filter((reserva) => reserva.status === "ATIVA"))
    .slice(0, MAXIMO_DESTAQUES)
    .map(paraDestaque);
}

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
function valorDaVenda(venda: VendaMetrica): string {
  if (venda.valor === null) {
    const dia = venda.dataReferencia.toISOString().slice(0, 10);
    throw new Error(
      `Lançamento de VENDA sem valor não pode entrar no VGV: data de referência ${dia}, ` +
        `${venda.participacoes.length} participante(s).`,
    );
  }
  return venda.valor;
}

/**
 * Exige a estrutura que a DEC-051 garante no banco e na aplicação: pelo menos
 * um participante, ordem inteira, contígua de 1 a N, sem repetição, e nenhum
 * corretor duas vezes na mesma venda.
 *
 * Estrutura inválida **lança**. Creditar mesmo assim distribuiria dinheiro por
 * uma lista que não fecha — e uma venda sem participação nenhuma creditaria
 * ninguém em silêncio, que é pior do que falhar alto.
 */
export function validarParticipacoesDaVenda(
  participacoes: readonly ParticipacaoMetrica[],
  origem: string,
): void {
  if (participacoes.length === 0) {
    throw new Error(`Venda sem participação não credita ninguém: ${origem}.`);
  }

  const ordens = new Set<number>();
  const corretores = new Set<string>();

  for (const participacao of participacoes) {
    const { ordem } = participacao;
    if (!Number.isInteger(ordem) || ordem < 1 || ordem > participacoes.length) {
      throw new Error(
        `Ordem de participação fora de 1..${participacoes.length} em ${origem}: ${ordem}.`,
      );
    }
    if (ordens.has(ordem)) {
      throw new Error(`Ordem de participação repetida em ${origem}: ${ordem}.`);
    }
    if (corretores.has(participacao.corretorId)) {
      throw new Error(
        `Corretor repetido na mesma venda em ${origem}: ${participacao.corretorId}.`,
      );
    }
    ordens.add(ordem);
    corretores.add(participacao.corretorId);
  }
}

/**
 * A divisão igualitária do valor de uma venda, em centavos exatos (DEC-052).
 *
 * Divisão inteira e resto: os `resto` primeiros participantes, por `ordem`
 * crescente, recebem um centavo a mais. `R$ 100,00` entre três dá
 * `33,34 / 33,33 / 33,33`, e a soma das frações é **exatamente** o valor — é
 * essa invariante que faz o VGV das equipes recompor o total da venda.
 *
 * A fração não é persistida em lugar nenhum: deriva de (valor, N, ordem) aqui,
 * toda vez. Devolve um mapa por `ordem`, que é única dentro da venda.
 */
export function dividirValorDaVenda(
  valor: string,
  participacoes: readonly ParticipacaoMetrica[],
  origem: string,
): Map<number, string> {
  validarParticipacoesDaVenda(participacoes, origem);

  const centavos = paraCentavos(valor, origem);
  const total = BigInt(participacoes.length);
  const base = centavos / total;
  const resto = centavos % total;

  const fracoes = new Map<number, string>();
  for (const participacao of participacoes) {
    // A ordem é contígua de 1 a N, então exatamente `resto` participantes
    // satisfazem esta comparação — nem um a mais, nem um a menos.
    const extra = BigInt(participacao.ordem) <= resto ? BigInt(1) : BigInt(0);
    fracoes.set(participacao.ordem, deCentavos(base + extra));
  }
  return fracoes;
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
 * As vendas posteriores ao corte. O corte é inclusivo no saldo, então uma venda
 * exatamente em `dataCorte` já está representada ali e não soma de novo
 * (DEC-036).
 */
function vendasPosterioresAoCorte(
  lancamentos: readonly LancamentoMetrica[],
  dataCorte: Date,
): VendaMetrica[] {
  return lancamentos.filter(
    (lancamento): lancamento is VendaMetrica =>
      ehVenda(lancamento) && lancamento.dataReferencia > dataCorte,
  );
}

/** Mesma regra de corte, para os tipos em que só a contagem importa. */
function contarPosterioresAoCorte(
  lancamentos: readonly LancamentoMetrica[],
  tipo: TipoSaldoMetrica,
  dataCorte: Date,
): number {
  return lancamentos.filter(
    (lancamento) => lancamento.tipo === tipo && lancamento.dataReferencia > dataCorte,
  ).length;
}

/**
 * VGV de uma janela: só `VENDA`, só lançamentos, saldo com participação zero.
 *
 * Uma venda entra **uma vez**, pelo valor integral, qualquer que seja o número
 * de participantes — a empresa não infla com o tamanho do elenco (DEC-052).
 */
function vgvDaJanela(
  lancamentos: readonly LancamentoMetrica[],
  janela: JanelaCivil,
  origem: string,
): string {
  const vendas = lancamentos.filter(
    (lancamento): lancamento is VendaMetrica =>
      ehVenda(lancamento) && dentroDaJanela(janela, lancamento.dataReferencia),
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
    ? vendasPosterioresAoCorte(lancamentos, saldoVenda.dataCorte)
    : [];
  const avaliacoesPosteriores = saldoAvaliacao
    ? contarPosterioresAoCorte(lancamentos, "AVALIACAO_GOOGLE", saldoAvaliacao.dataCorte)
    : 0;

  const semSaldo = { estado: "SEM_SALDO_HISTORICO", valor: null } as const;

  return {
    estadoPeriodoMensal: estadoDoMes(doMes),

    // A precisão vem do saldo que originou cada acumulado e viaja junto sem
    // mudar número nenhum (DEC-054): a soma de um `MINIMO_CONHECIDO` é a mesma
    // de um `EXATO`, e o que muda é só como a tela afirma o resultado.
    acumulados: {
      vendidos: saldoVenda
        ? {
            estado: "OK",
            valor: saldoVenda.quantidade + vendasPosteriores.length,
            precisao: saldoVenda.precisao,
          }
        : semSaldo,
      vgv: saldoVenda
        ? {
            estado: "OK",
            valor: somar(
              [saldoVenda.valorTotal, ...vendasPosteriores.map(valorDaVenda)],
              "VGV acumulado",
            ),
            precisao: saldoVenda.precisao,
          }
        : semSaldo,
      avaliacoes: saldoAvaliacao
        ? {
            estado: "OK",
            valor: saldoAvaliacao.quantidade + avaliacoesPosteriores,
            precisao: saldoAvaliacao.precisao,
          }
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
 * Um crédito de produção dentro de uma equipe: quem produziu, de que tipo, e —
 * só em venda — quanto de VGV cabe àquele participante.
 *
 * É a forma normalizada que unifica os dois modelos de crédito: um evento
 * individual gera **um** crédito, para o corretor gravado nele; uma venda gera
 * **um crédito por participação daquela equipe**, cada um com a sua fração.
 */
type CreditoDaEquipe = {
  corretorId: string;
  tipo: TipoEventoMetrica;
  /** Fração canônica da venda; `null` em todo tipo que não é VENDA. */
  vgv: string | null;
};

/**
 * Os créditos do mês que pertencem a uma equipe.
 *
 * Para eventos individuais, pertencer é `Lancamento.equipeId` — a equipe
 * gravada no fato (DEC-002). Para vendas, é ter **pelo menos uma participação**
 * com o snapshot daquela equipe (DEC-051): a venda entra no quadro da equipe
 * uma vez por participante dela, nunca pela lotação atual de ninguém.
 *
 * Duas pessoas da mesma equipe geram dois créditos — cada participante recebe o
 * seu +1 (DEC-052) —, mas cada um com **a sua fração**: o VGV que a equipe
 * recebe é a soma das frações dos seus participantes, não o valor da venda
 * repetido. A soma das frações de todas as equipes é exatamente o valor.
 */
function creditosDaEquipe(
  equipeId: string,
  lancamentosDoMes: readonly LancamentoMetrica[],
): CreditoDaEquipe[] {
  const creditos: CreditoDaEquipe[] = [];

  for (const lancamento of lancamentosDoMes) {
    if (!ehVenda(lancamento)) {
      if (lancamento.equipeId === equipeId) {
        creditos.push({ corretorId: lancamento.corretorId, tipo: lancamento.tipo, vgv: null });
      }
      continue;
    }

    const dia = lancamento.dataReferencia.toISOString().slice(0, 10);
    const origem = `venda de ${dia}`;
    // Validada antes do filtro por equipe, de propósito: uma venda sem
    // participação nenhuma não pode passar despercebida só porque não credita
    // esta equipe — ela não credita equipe alguma.
    validarParticipacoesDaVenda(lancamento.participacoes, origem);

    const daEquipe = lancamento.participacoes.filter(
      (participacao) => participacao.equipeId === equipeId,
    );
    if (daEquipe.length === 0) continue;

    const fracoes = dividirValorDaVenda(valorDaVenda(lancamento), lancamento.participacoes, origem);
    for (const participacao of daEquipe) {
      creditos.push({
        corretorId: participacao.corretorId,
        tipo: "VENDA",
        // `ordem` é chave da divisão e a validação já garantiu que existe.
        vgv: fracoes.get(participacao.ordem) as string,
      });
    }
  }

  return creditos;
}

/**
 * O elenco mensal de uma equipe: a união dos corretores **ativos** lotados nela
 * hoje com os corretores **ativos** que tenham produção do mês creditada a ela
 * (DEC-038, estendida pela DEC-052).
 *
 * "Produção creditada" já chega resolvida nos créditos: para venda, isso quer
 * dizer participação com o snapshot desta equipe — um participante ativo entra
 * no elenco da equipe da participação, mesmo lotado hoje em outra.
 *
 * A união é por `id`, e sai sem repetição porque cada corretor aparece uma vez
 * na lista de entrada. Corretor inativo não entra em elenco nenhum (DEC-006) —
 * sua participação continua existindo e continua contando nos totais da
 * empresa, que são calculados dos lançamentos e não passam por aqui.
 */
function elencoDaEquipe(
  equipe: EquipeMetrica,
  corretores: readonly CorretorMetrica[],
  creditos: readonly CreditoDaEquipe[],
): CorretorMetrica[] {
  const produziramNoMes = new Set(creditos.map((credito) => credito.corretorId));

  return corretores.filter(
    (corretor) =>
      corretor.ativo && (corretor.equipeId === equipe.id || produziramNoMes.has(corretor.id)),
  );
}

/** Os oito rankings de uma equipe, já ordenados. */
function rankingsDaEquipe(
  elenco: readonly CorretorMetrica[],
  creditos: readonly CreditoDaEquipe[],
  nomeDaEquipe: string,
): RankingsDaEquipe {
  const porCorretor = new Map<string, CreditoDaEquipe[]>();
  for (const credito of creditos) {
    const lista = porCorretor.get(credito.corretorId);
    if (lista) lista.push(credito);
    else porCorretor.set(credito.corretorId, [credito]);
  }

  // Corretor ativo sem evento aparece com zero real: o elenco inteiro é
  // percorrido, não só quem produziu.
  const contagem = (chave: ChaveRankingContagem): LinhaRankingContagem[] =>
    ordenarRanking(
      elenco.map((corretor) => ({
        corretorId: corretor.id,
        nomeExibicao: corretor.nomeExibicao,
        valor: (porCorretor.get(corretor.id) ?? []).filter(
          (credito) => credito.tipo === TIPO_DA_CONTAGEM[chave],
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
          .filter((credito) => credito.tipo === "VENDA")
          .map((credito) => credito.vgv as string),
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
      // O crédito é o do fato: `Lancamento.equipeId` nos eventos individuais
      // (DEC-002) e `ParticipacaoVenda.equipeId` nas vendas (DEC-051).
      const creditos = creditosDaEquipe(equipe.id, doMes);
      const elenco = elencoDaEquipe(equipe, corretores, creditos);

      return {
        id: equipe.id,
        nome: equipe.nome,
        gerenteNome: equipe.gerenteNome,
        // Headcount atual: o transferido conta na equipe de hoje, não na antiga
        // onde ainda aparece por produção histórica.
        totalCorretores: corretores.filter(
          (corretor) => corretor.ativo && corretor.equipeId === equipe.id,
        ).length,
        rankings: rankingsDaEquipe(elenco, creditos, equipe.nome),
      };
    }),
  };
}
