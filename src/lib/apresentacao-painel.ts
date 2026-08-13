import {
  type Acumulado,
  CHAVES_RANKING,
  type ChaveRanking,
  type MetricasDeEquipe,
  type RankingsDaEquipe,
  type TipoEventoMetrica,
  TIPOS_EVENTO,
} from "@/lib/metricas";
import { mesCorrente } from "@/lib/datas";
import type {
  BlocoAcumuladosEmpresa,
  BlocoEquipes,
  BlocoPeriodosEmpresa,
  ResultadoPainel,
} from "@/lib/metricas-prisma";

/**
 * Shape de apresentação do painel — domínio (F3.2/F3.3) → o que a tela desenha.
 *
 * Esta é a terceira camada da fatia, e a fronteira de cada uma é estrita:
 * `src/lib/metricas.ts` calcula, `src/lib/metricas-prisma.ts` lê, e aqui só se
 * **formata e rotula**. Nada neste arquivo soma, conta, ordena ou recorta
 * período: se um número mudasse de valor ao passar por aqui, haveria duas
 * verdades sobre a mesma métrica (DEC-013).
 *
 * `ResultadoPainel` entra como **type-only** de propósito. O módulo de leitura
 * começa com `import "server-only"`, e trazê-lo para o runtime contaminaria esta
 * camada pura — que precisa rodar em teste unitário sem banco e sem ambiente.
 *
 * Três disciplinas atravessam o arquivo:
 *
 * - **dinheiro nunca vira `number`.** Entra como string decimal canônica
 *   (`"1250000.00"`), vira centavos `bigint` e sai como texto. Um double perde
 *   centavos no topo do `Decimal(14, 2)`, e o acumulado da empresa passa dele.
 * - **ausência nunca vira dígito.** Todo estado que não é `OK` produz `—`
 *   (DEC-014, DEC-042). Zero real, esse sim, é exibido como zero.
 * - **a ordem não se redeclara.** As oito métricas vêm de `CHAVES_RANKING` e as
 *   sete linhas do quadro mensal vêm de `TIPOS_EVENTO`, ambas do núcleo. Uma
 *   segunda lista aqui poderia divergir em silêncio.
 */

/** O que a tela mostra quando não há número a afirmar. */
const TRACO = "—";

const PREFIXO_MOEDA = "R$";

/** As oito métricas do ciclo de rotação, na chave do núcleo (DEC-033). */
export type ChaveMetrica = ChaveRanking;

/** Uma métrica do ciclo de rotação dos quadros de equipe. */
export type Metrica = { chave: ChaveMetrica; nome: string };

/** Valor com partes tipografadas de forma diferente: R$ 4,2 bi */
export type ValorComposto = { prefixo?: string; valor: string; sufixo?: string };

/** Linha `rótulo … valor` — serve tanto ao quadro mensal quanto aos rankings. */
export type Linha = { rotulo: string; valor: string };

/**
 * Estados de exibição, um por bloco, estreitos de propósito.
 *
 * Cada bloco só admite os estados que podem de fato alcançá-lo: um big number
 * nunca fica `SEM_DADOS` (acumulado não depende do mês) e o VGV por período
 * nunca fica `SEM_SALDO_HISTORICO` (período não olha saldo). Um enum único
 * permitiria escrever combinações que o domínio não produz (DEC-042).
 */
export type EstadoBigNumber = "OK" | "INDISPONIVEL" | "SEM_SALDO_HISTORICO";
export type EstadoVgvPeriodo = "OK" | "INDISPONIVEL" | "SEM_DADOS";
export type EstadoQuadroMensal = "OK" | "INDISPONIVEL" | "SEM_DADOS";

export type BigNumber = { rotulo: string; numero: ValorComposto; estado: EstadoBigNumber };
export type VgvPeriodo = { rotulo: string; valor: ValorComposto; estado: EstadoVgvPeriodo };

export type Equipe = {
  nome: string;
  gerente: string;
  totalCorretores: number;
  /** Já ordenado pelo núcleo, uma lista pronta por métrica. Aqui não se reordena. */
  rankings: Record<ChaveMetrica, Linha[]>;
};

/** Sempre sete linhas, inclusive nos estados sem número — ali são sete `—`. */
export type AreaQuadroMensal = { estado: EstadoQuadroMensal; linhas: Linha[] };

/**
 * A área dos quadros de equipe.
 *
 * `INDISPONIVEL` e `CONFIGURACAO_INVALIDA` não carregam `equipes`: no primeiro
 * caso não se leu nada, e no segundo entregar uma lista permitiria renderizar um
 * subconjunto arbitrário, que é o que a DEC-040 proíbe. `SEM_DADOS` carrega as
 * equipes porque o elenco é conhecido — o que falta é produção do mês.
 */
export type AreaEquipes =
  | { estado: "OK"; equipes: Equipe[] }
  | { estado: "SEM_DADOS"; equipes: Equipe[] }
  | { estado: "INDISPONIVEL" }
  | { estado: "CONFIGURACAO_INVALIDA" };

export type ApresentacaoPainel = {
  periodo: string;
  bigNumbers: BigNumber[];
  vgvPeriodos: VgvPeriodo[];
  quadroMensal: AreaQuadroMensal;
  metricas: readonly Metrica[];
  equipes: AreaEquipes;
};

/** Como cada métrica do ciclo aparece no título do quadro (DEC-033). */
const ROTULOS_METRICA: Record<ChaveMetrica, string> = {
  vendidos: "Vendidos",
  vgv: "VGV do mês",
  locados: "Locados",
  capVenda: "Captação de venda",
  exclusivas: "Exclusividades",
  capLocacao: "Captação de locação",
  propostas: "Propostas",
  avaliacoes: "Avaliações Google",
};

/** Como cada tipo do enum aparece no quadro mensal geral. */
const ROTULOS_QUADRO_MENSAL: Record<TipoEventoMetrica, string> = {
  VENDA: "Vendidos",
  LOCACAO: "Locados",
  CAPTACAO_VENDA: "Captação de venda",
  CAPTACAO_EXCLUSIVA: "Exclusividades",
  CAPTACAO_LOCACAO: "Captação de locação",
  PROPOSTA: "Propostas",
  AVALIACAO_GOOGLE: "Avaliações Google",
};

/**
 * As oito métricas do ciclo, derivadas da ordem do núcleo.
 *
 * Derivada, e não escrita à mão: uma segunda lista precisaria ser mantida em
 * sincronia com `CHAVES_RANKING`, e o dia em que divergisse a TV mostraria o
 * rótulo de uma métrica sobre os números de outra.
 */
export const METRICAS_PAINEL: readonly Metrica[] = CHAVES_RANKING.map((chave) => ({
  chave,
  nome: ROTULOS_METRICA[chave],
}));

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * O rótulo do período exibido no topo: `"agosto de 2026"`.
 *
 * Qual é o mês corrente já é decidido por `mesCorrente`, que conhece
 * `America/Sao_Paulo`; daqui para frente é só data civil lida por getters UTC.
 * Refazer a conversão de fuso aqui abriria um segundo caminho que poderia
 * discordar do recorte que produziu os números.
 */
export function rotuloPeriodoMensal(agora: Date): string {
  const inicio = mesCorrente(agora).inicio;
  return `${MESES[inicio.getUTCMonth()]} de ${inicio.getUTCFullYear()}`;
}

/** `1250000` → `1.250.000`. Mesmo agrupamento textual de `dinheiro.ts`. */
function agruparMilhar(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Contagem para a tela: `2643` → `"2.643"`.
 *
 * Contagem é `number` de verdade — vem de `length` e de coluna `Int`, não de
 * dinheiro —, então aqui não há centavos nem `bigint`. `Intl` fica de fora: o
 * separador de milhar do painel é sempre o ponto, independentemente do locale da
 * máquina que renderiza.
 */
export function formatarInteiro(valor: number): string {
  if (!Number.isInteger(valor)) {
    throw new Error(
      `Contagem precisa ser um inteiro: ${JSON.stringify(valor)} — este caminho não ` +
        `formata dinheiro nem fração.`,
    );
  }
  const negativo = valor < 0;
  const digitos = agruparMilhar(String(Math.abs(valor)));
  return negativo ? `-${digitos}` : digitos;
}

const VALOR_CANONICO = /^(\d+)\.(\d{2})$/;

// Os literais `1n`/`10n` não compilam com `target: ES2017`; o tipo existe pela
// `lib`, e `BigInt(...)` resolve. Mesmo caminho já usado em `src/lib/metricas.ts`.
const ZERO = BigInt(0);
const UM = BigInt(1);
const DOIS = BigInt(2);
const DEZ = BigInt(10);
const CEM = BigInt(100);
const MIL = BigInt(1000);
const CENTAVOS_POR_MILHAO = BigInt("100000000");
const CENTAVOS_POR_BILHAO = BigInt("100000000000");

/** `"1250000.25"` → `125000025n`. Recusa qualquer forma não canônica. */
function paraCentavos(canonico: string): bigint {
  const partes = VALOR_CANONICO.exec(canonico);
  if (!partes) {
    throw new Error(
      `Valor monetário fora da forma canônica: ${JSON.stringify(canonico)} — esperado ` +
        `dígitos não negativos com exatamente duas casas decimais, como "1250000.00".`,
    );
  }
  // Concatenar já é a conversão: parte inteira seguida dos centavos.
  return BigInt(partes[1] + partes[2]);
}

type Sufixo = "mi" | "bi";

/** Unidade de compactação e quantas casas decimais ela admite. */
type Magnitude = { unidade: bigint; sufixo: Sufixo; casas: number };

/**
 * Escolhe unidade e precisão pela **magnitude** do valor:
 *
 * - a partir de 1 bilhão o número sai em `bi`; abaixo disso sempre em `mi`,
 *   inclusive quando é menor que um milhão (`R$ 0,9 mi`);
 * - abaixo de 100 na unidade escolhida, uma casa decimal; de 100 para cima,
 *   nenhuma — `R$ 42,5 mi` e `R$ 431 mi`.
 */
function magnitudeDe(centavos: bigint): Magnitude {
  const bilhao = centavos >= CENTAVOS_POR_BILHAO;
  const unidade = bilhao ? CENTAVOS_POR_BILHAO : CENTAVOS_POR_MILHAO;
  return {
    unidade,
    sufixo: bilhao ? "bi" : "mi",
    casas: centavos >= CEM * unidade ? 0 : 1,
  };
}

/**
 * Valor na unidade, multiplicado por `10^casas` e arredondado meio-para-cima.
 *
 * Tudo em `bigint`: o arredondamento compara `resto * 2` com o divisor, sem
 * nenhuma divisão em ponto flutuante no caminho.
 */
function escalar(centavos: bigint, { unidade, casas }: Magnitude): bigint {
  const numerador = centavos * (casas === 1 ? DEZ : UM);
  const quociente = numerador / unidade;
  const resto = numerador % unidade;
  return resto * DOIS >= unidade ? quociente + UM : quociente;
}

/**
 * A magnitude que o valor **já arredondado** pede, ou `null` se a atual serve.
 *
 * Arredondar pode empurrar o número para a faixa seguinte, e aí a regra escolhida
 * antes deixa de valer: `99,95 mi` vira `100,0 mi`, que pela regra de precisão é
 * `100 mi`; e `999,5 mi` vira `1000 mi`, que é `1,0 bi`. Sem esta segunda
 * passada a tela mostraria `100,0 mi` e `1000 mi`.
 */
function promocao(atual: Magnitude, escalado: bigint): Magnitude | null {
  if (atual.casas === 1 && escalado >= MIL) {
    // Chegou a 100 na unidade: daqui para cima não há casa decimal.
    return { unidade: atual.unidade, sufixo: atual.sufixo, casas: 0 };
  }
  if (atual.casas === 0 && atual.sufixo === "mi" && escalado >= MIL) {
    // Mil milhões são um bilhão, e um bilhão volta a ter casa decimal.
    return { unidade: CENTAVOS_POR_BILHAO, sufixo: "bi", casas: 1 };
  }
  return null;
}

/** `4250000000n` com uma casa → `"425"` → `"42,5"`. */
function texto(escalado: bigint, casas: number): string {
  const digitos = escalado.toString();
  if (casas === 0) return agruparMilhar(digitos);

  const inteiro = digitos.length > 1 ? digitos.slice(0, -1) : "0";
  return `${agruparMilhar(inteiro)},${digitos.slice(-1)}`;
}

/** Dinheiro compactado com as três partes sempre presentes. */
type DinheiroCompacto = { prefixo: string; valor: string; sufixo: Sufixo };

/**
 * Positivo, mas menor que o menor passo que a compactação sabe desenhar.
 *
 * `0,1` não é limiar escolhido à mão: é a menor casa que a regra de precisão
 * admite na unidade `mi`. Quem cai aqui é exatamente quem o arredondamento
 * levaria a zero.
 */
const SUB_RESOLUCAO = "< 0,1";

/**
 * O único algoritmo monetário da camada — as duas funções públicas saem daqui.
 *
 * Uma segunda passada de arredondamento basta: cada promoção só aumenta a
 * magnitude, e o novo arredondamento acontece numa faixa em que o valor está
 * longe do próximo limite — `100` na unidade e `1,0 bi` não transbordam de novo.
 */
function compor(canonico: string): DinheiroCompacto {
  const centavos = paraCentavos(canonico);

  const inicial = magnitudeDe(centavos);
  const escaladoInicial = escalar(centavos, inicial);

  // Uma venda real e pequena não pode sair da tela idêntica a "não vendeu
  // nada". `R$ 0,0 mi` é reservado ao zero **exato**; qualquer positivo que a
  // escala levaria a zero sai marcado como abaixo da resolução. O corte não é
  // constante mágica: é o próprio arredondamento que decide quem cabe aqui.
  if (centavos > ZERO && escaladoInicial === ZERO) {
    return { prefixo: PREFIXO_MOEDA, valor: SUB_RESOLUCAO, sufixo: inicial.sufixo };
  }

  const promovida = promocao(inicial, escaladoInicial);
  const magnitude = promovida ?? inicial;
  const escalado = promovida ? escalar(centavos, promovida) : escaladoInicial;

  return {
    prefixo: PREFIXO_MOEDA,
    valor: texto(escalado, magnitude.casas),
    sufixo: magnitude.sufixo,
  };
}

/** `"4200000.00"` → `{ prefixo: "R$", valor: "4,2", sufixo: "mi" }`. */
export function formatarDinheiroComposto(canonico: string): ValorComposto {
  return compor(canonico);
}

/** `"4200000.00"` → `"R$ 4,2 mi"`. Deriva da forma composta, sem recalcular. */
export function formatarDinheiroTexto(canonico: string): string {
  const { prefixo, valor, sufixo } = compor(canonico);
  return `${prefixo} ${valor} ${sufixo}`;
}

/** Ausência: sem prefixo e sem sufixo, para a tela não desenhar `R$ —`. */
function ausente(): ValorComposto {
  return { valor: TRACO };
}

const ROTULO_VENDIDOS = "Imóveis vendidos";
const ROTULO_VGV_ACUMULADO = "VGV acumulado";
const ROTULO_AVALIACOES = "Avaliações Google";

const ROTULOS_BIG_NUMBERS = [ROTULO_VENDIDOS, ROTULO_VGV_ACUMULADO, ROTULO_AVALIACOES];
const ROTULOS_VGV_PERIODOS = ["Anual", "Trimestral", "Mensal"];

/**
 * Um big number a partir do acumulado correspondente.
 *
 * Sem saldo do tipo o número é indisponível, nunca zero e nunca "só os
 * lançamentos" (DEC-037) — e a falta do saldo de um tipo não contamina o outro.
 */
function bigNumberDe<T>(
  rotulo: string,
  acumulado: Acumulado<T>,
  apresentar: (valor: T) => ValorComposto,
): BigNumber {
  if (acumulado.estado !== "OK" || acumulado.valor === null) {
    return { rotulo, numero: ausente(), estado: "SEM_SALDO_HISTORICO" };
  }
  return { rotulo, numero: apresentar(acumulado.valor), estado: "OK" };
}

function bigNumbersDe(acumulados: BlocoAcumuladosEmpresa): BigNumber[] {
  if (acumulados.estadoLeitura !== "OK") {
    return ROTULOS_BIG_NUMBERS.map((rotulo) => ({
      rotulo,
      numero: ausente(),
      estado: "INDISPONIVEL" as const,
    }));
  }

  const { vendidos, vgv, avaliacoes } = acumulados.dados;
  const contagem = (valor: number): ValorComposto => ({ valor: formatarInteiro(valor) });

  return [
    bigNumberDe(ROTULO_VENDIDOS, vendidos, contagem),
    bigNumberDe(ROTULO_VGV_ACUMULADO, vgv, formatarDinheiroComposto),
    bigNumberDe(ROTULO_AVALIACOES, avaliacoes, contagem),
  ];
}

/**
 * As três faixas de VGV.
 *
 * Trimestre e ano seguem exibindo o valor real mesmo quando o mês está sem
 * dados: eles têm janelas próprias, e um mês vazio não diz nada sobre elas. Já o
 * VGV **mensal** vira `—`, porque mês sem nenhum lançamento não afirma
 * desempenho zero (DEC-039) — `R$ 0,0 mi` ali seria um número plausível e falso.
 */
function vgvPeriodosDe(periodos: BlocoPeriodosEmpresa): VgvPeriodo[] {
  if (periodos.estadoLeitura !== "OK") {
    return ROTULOS_VGV_PERIODOS.map((rotulo) => ({
      rotulo,
      valor: ausente(),
      estado: "INDISPONIVEL" as const,
    }));
  }

  const dados = periodos.dados;
  const semDados = dados.estadoPeriodoMensal === "SEM_DADOS";

  return [
    { rotulo: "Anual", valor: formatarDinheiroComposto(dados.vgvPeriodos.anual), estado: "OK" },
    {
      rotulo: "Trimestral",
      valor: formatarDinheiroComposto(dados.vgvPeriodos.trimestral),
      estado: "OK",
    },
    semDados
      ? { rotulo: "Mensal", valor: ausente(), estado: "SEM_DADOS" }
      : {
          rotulo: "Mensal",
          valor: formatarDinheiroComposto(dados.vgvPeriodos.mensal),
          estado: "OK",
        },
  ];
}

/** As sete linhas sem número — a lista existe inteira mesmo sem dado a exibir. */
function linhasAusentes(): Linha[] {
  return TIPOS_EVENTO.map((tipo) => ({ rotulo: ROTULOS_QUADRO_MENSAL[tipo], valor: TRACO }));
}

function quadroMensalDe(periodos: BlocoPeriodosEmpresa): AreaQuadroMensal {
  if (periodos.estadoLeitura !== "OK") {
    return { estado: "INDISPONIVEL", linhas: linhasAusentes() };
  }

  const dados = periodos.dados;
  if (dados.estadoPeriodoMensal === "SEM_DADOS") {
    return { estado: "SEM_DADOS", linhas: linhasAusentes() };
  }

  return {
    estado: "OK",
    linhas: TIPOS_EVENTO.map((tipo) => ({
      rotulo: ROTULOS_QUADRO_MENSAL[tipo],
      // Dentro de um mês `OK`, zero é zero real e é exibido (DEC-039).
      valor: formatarInteiro(dados.quadroMensal[tipo]),
    })),
  };
}

/**
 * Os oito rankings de uma equipe, na ordem e com o conteúdo que o núcleo já
 * decidiu. `semDados` troca **apenas os valores** por `—`: os nomes e a posição
 * de cada corretor continuam ali, porque o elenco é conhecido mesmo quando a
 * produção do mês não é.
 */
function rankingsDe(rankings: RankingsDaEquipe, semDados: boolean): Record<ChaveMetrica, Linha[]> {
  const saida = {} as Record<ChaveMetrica, Linha[]>;

  for (const chave of CHAVES_RANKING) {
    saida[chave] =
      chave === "vgv"
        ? rankings.vgv.map((linha) => ({
            rotulo: linha.nomeExibicao,
            valor: semDados ? TRACO : formatarDinheiroTexto(linha.valor),
          }))
        : rankings[chave].map((linha) => ({
            rotulo: linha.nomeExibicao,
            valor: semDados ? TRACO : formatarInteiro(linha.valor),
          }));
  }

  return saida;
}

function equipeDe(equipe: MetricasDeEquipe, semDados: boolean): Equipe {
  return {
    nome: equipe.nome,
    gerente: equipe.gerenteNome,
    totalCorretores: equipe.totalCorretores,
    rankings: rankingsDe(equipe.rankings, semDados),
  };
}

/**
 * A área de equipes, com precedência explícita.
 *
 * `CONFIGURACAO_INVALIDA` vem **antes** de `SEM_DADOS`: com número de equipes
 * ativas diferente de três, a lista chega vazia do núcleo (DEC-040), e devolver
 * `SEM_DADOS` com zero equipes faria a tela anunciar "mês sem dados" quando o
 * problema real é de cadastro. São diagnósticos diferentes, e o de configuração
 * é o que precisa aparecer.
 */
function areaEquipesDe(equipes: BlocoEquipes): AreaEquipes {
  if (equipes.estadoLeitura !== "OK") {
    return { estado: "INDISPONIVEL" };
  }

  const dados = equipes.dados;
  if (dados.estadoEquipes === "CONFIGURACAO_INVALIDA") {
    return { estado: "CONFIGURACAO_INVALIDA" };
  }

  const semDados = dados.estadoPeriodoMensal === "SEM_DADOS";
  const lista = dados.equipes.map((equipe) => equipeDe(equipe, semDados));

  return semDados ? { estado: "SEM_DADOS", equipes: lista } : { estado: "OK", equipes: lista };
}

/**
 * Traduz o resultado da leitura no que a tela desenha.
 *
 * `agora` é **obrigatório** e serve só ao rótulo do período. Um default
 * `new Date()` aqui criaria um segundo relógio: a leitura da F3.3 congela o
 * instante antes das consultas, e o cabeçalho poderia acabar anunciando um mês
 * diferente daquele que produziu os números logo abaixo dele.
 *
 * Puro e síncrono: mesma entrada, mesma saída, sem I/O e sem relógio próprio.
 */
export function criarApresentacaoPainel(
  resultado: ResultadoPainel,
  agora: Date,
): ApresentacaoPainel {
  return {
    periodo: rotuloPeriodoMensal(agora),
    bigNumbers: bigNumbersDe(resultado.empresa.acumulados),
    vgvPeriodos: vgvPeriodosDe(resultado.empresa.periodos),
    quadroMensal: quadroMensalDe(resultado.empresa.periodos),
    metricas: METRICAS_PAINEL,
    equipes: areaEquipesDe(resultado.equipes),
  };
}
