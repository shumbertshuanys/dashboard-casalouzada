import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  calcularMetricasEmpresa,
  calcularMetricasEquipes,
  type CorretorMetrica,
  type DestaqueOperacional,
  type EquipeMetrica,
  type LancamentoMetrica,
  type MetricasEmpresaPuras,
  type MetricasEquipesPuras,
  type PrecisaoSaldoMetrica,
  type PropostaOperacional,
  type ReservaOperacional,
  type SaldoHistoricoMetrica,
  selecionarPropostasEmAndamento,
  selecionarReservasAtivas,
  type StatusPropostaMetrica,
  type StatusReservaMetrica,
  type TipoEventoMetrica,
  type TipoSaldoMetrica,
} from "@/lib/metricas";

/**
 * Leitura das métricas do painel — a fronteira entre o banco e o núcleo puro.
 *
 * `src/lib/metricas.ts` continua sem conhecer Prisma (DEC-013): este módulo lê
 * as quatro tabelas, converte cada linha para os tipos de domínio da F3.2 e
 * chama as duas entradas puras. Nenhuma conta acontece aqui — nem soma, nem
 * contagem, nem `groupBy` no banco. Se um número precisar mudar, muda no núcleo,
 * num lugar só.
 *
 * O cliente Prisma entra **por parâmetro** (DEC-041). Importar o singleton de
 * `src/lib/db.ts` amarraria a camada à `DATABASE_URL` da aplicação e tiraria da
 * integração a chance de exercitar exatamente este código contra o banco local
 * de teste.
 *
 * Duas ideias sustentam o resto do arquivo:
 *
 * - **`INDISPONIVEL` é falha de leitura, e só isso** (DEC-042). Erro de domínio
 *   vindo do núcleo — uma VENDA sem valor, por exemplo — não vira estado de
 *   tela: ele propaga. Transformar em `INDISPONIVEL` esconderia dado corrompido
 *   atrás da mesma cara que uma queda de rede.
 * - **cada bloco cai só com quem ele depende.** Os números da empresa não são
 *   um bloco só: os recortes por período dependem apenas de lançamentos, e os
 *   acumulados dependem também do saldo histórico. Se o saldo falhar mas os
 *   lançamentos chegarem, o VGV do mês continua correto e continua exibível —
 *   derrubá-lo junto apagaria dado bom por falha alheia, exatamente o que a
 *   DEC-042 proíbe.
 */

/** A leitura daquele bloco aconteceu, ou não aconteceu. Nada além disso. */
export type EstadoLeitura = "OK" | "INDISPONIVEL";

/**
 * A metade dos números da empresa que só depende de lançamentos: estado do mês,
 * VGV por período e quadro mensal. Os acumulados ficam de fora porque têm uma
 * dependência de leitura a mais — o saldo histórico — e por isso podem falhar
 * quando esta metade não falhou.
 */
export type MetricasEmpresaPeriodicas = Pick<
  MetricasEmpresaPuras,
  "estadoPeriodoMensal" | "vgvPeriodos" | "quadroMensal"
>;

/**
 * O ramo indisponível **não** tem `dados`.
 *
 * União discriminada em vez de `dados: null`: quem consome é obrigado a testar
 * `estadoLeitura` antes de tocar nos números, e não existe caminho em que uma
 * falha de banco chegue à tela como campo vazio parecendo zero.
 */
export type BlocoPeriodosEmpresa =
  | { estadoLeitura: "OK"; dados: MetricasEmpresaPeriodicas }
  | { estadoLeitura: "INDISPONIVEL" };

export type BlocoAcumuladosEmpresa =
  | { estadoLeitura: "OK"; dados: MetricasEmpresaPuras["acumulados"] }
  | { estadoLeitura: "INDISPONIVEL" };

export type BlocoEquipes =
  | { estadoLeitura: "OK"; dados: MetricasEquipesPuras }
  | { estadoLeitura: "INDISPONIVEL" };

/**
 * As listas operacionais da Tela B, cada uma com o próprio estado de leitura.
 *
 * Blocos independentes pelo mesmo motivo dos outros: as reservas têm leitura
 * própria e podem cair sozinhas, enquanto as propostas vêm dos lançamentos e
 * caem junto com eles (DEC-042).
 */
export type BlocoDestaques =
  | { estadoLeitura: "OK"; dados: DestaqueOperacional[] }
  | { estadoLeitura: "INDISPONIVEL" };

export type ResultadoPainel = {
  empresa: {
    periodos: BlocoPeriodosEmpresa;
    acumulados: BlocoAcumuladosEmpresa;
  };
  equipes: BlocoEquipes;
  propostas: BlocoDestaques;
  reservas: BlocoDestaques;
};

/**
 * O único contrato do `Decimal` do Prisma que esta camada usa.
 *
 * Dinheiro sai do banco por `toFixed(2)` e vira string decimal canônica, que é
 * o que o núcleo espera. Não há `Number`, `parseFloat` nem `toNumber` no
 * caminho: um `Decimal(14, 2)` no topo da faixa não cabe exato num double, e
 * perder centavos aqui contaminaria todos os totais depois.
 */
type DecimalPrisma = { toFixed(casas: number): string };

/** Os únicos tipos com saldo de abertura na v1 (DEC-035). */
const TIPOS_COM_SALDO = ["VENDA", "AVALIACAO_GOOGLE"] as const;

type LinhaParticipacao = {
  corretorId: string;
  equipeId: string;
  ordem: number;
};

/**
 * A linha como o banco devolve **depois do cutover da E3**: em `VENDA` os dois
 * campos antigos são `NULL` e o crédito vem das participações; nos demais tipos
 * eles continuam obrigatórios e não há participação nenhuma.
 *
 * Os campos de proposta e o nome do corretor viajam junto porque a mesma leitura
 * alimenta duas coisas: as métricas e os candidatos da lista operacional. Uma
 * segunda consulta só para as propostas leria as mesmas linhas de novo.
 */
type LinhaLancamento = {
  id: string;
  tipo: TipoEventoMetrica;
  corretorId: string | null;
  equipeId: string | null;
  dataReferencia: Date;
  valor: DecimalPrisma | null;
  statusProposta: StatusPropostaMetrica | null;
  imovelRef: string | null;
  criadoEm: Date;
  corretor: { nomeExibicao: string } | null;
  participacoes: LinhaParticipacao[];
};

type LinhaReserva = {
  id: string;
  status: StatusReservaMetrica;
  imovelRef: string;
  dataReferencia: Date;
  criadoEm: Date;
  corretor: { nomeExibicao: string };
};

type LinhaSaldo = {
  tipo: TipoEventoMetrica;
  quantidade: number;
  valorTotal: DecimalPrisma;
  precisao: PrecisaoSaldoMetrica;
  dataCorte: Date;
};

type LinhaCorretor = {
  id: string;
  nomeExibicao: string;
  equipeId: string;
  ativo: boolean;
};

type LinhaEquipe = {
  id: string;
  nome: string;
  gerenteNome: string;
  ordemExibicao: number;
  ativa: boolean;
};

/**
 * Converte uma linha para o domínio, escolhendo o ramo da união pelo `tipo`.
 *
 * `dataReferencia` é `@db.Date` e chega como a meia-noite UTC do dia, que é
 * exatamente a data civil de `src/lib/datas.ts`. Passa direto: reinterpretar no
 * fuso da máquina deslocaria o dia e jogaria eventos para o mês vizinho.
 *
 * As duas exigências abaixo são o contrato final da DEC-051 lido de volta. O
 * banco já as garante pelo `CHECK` do cutover; aqui elas são verificadas de
 * novo porque esta camada é a última chance de perceber que o dado não é o que
 * o domínio afirma. Dado incompatível **lança** — nunca vira `INDISPONIVEL`,
 * que significa "a leitura não aconteceu" e não "a leitura trouxe lixo".
 *
 * Participação em lançamento não-VENDA é ignorada: a aplicação nunca cria isso,
 * e o cálculo dos tipos individuais não conhece participação.
 */
function paraLancamento(linha: LinhaLancamento): LancamentoMetrica {
  const dia = linha.dataReferencia.toISOString().slice(0, 10);
  const valor = linha.valor === null ? null : linha.valor.toFixed(2);

  if (linha.tipo === "VENDA") {
    if (linha.corretorId !== null || linha.equipeId !== null) {
      throw new Error(
        `VENDA com crédito antigo preenchido depois do cutover: data ${dia}. ` +
          `O crédito de venda mora em ParticipacaoVenda (DEC-051).`,
      );
    }
    if (linha.participacoes.length === 0) {
      throw new Error(`VENDA sem participação: data ${dia}. Toda venda tem pelo menos uma.`);
    }
    return {
      tipo: "VENDA",
      dataReferencia: linha.dataReferencia,
      valor,
      participacoes: linha.participacoes.map((participacao) => ({
        corretorId: participacao.corretorId,
        equipeId: participacao.equipeId,
        ordem: participacao.ordem,
      })),
    };
  }

  if (linha.corretorId === null || linha.equipeId === null) {
    throw new Error(
      `Lançamento ${linha.tipo} sem corretor ou equipe: data ${dia}. ` +
        `Só VENDA tem os dois campos nulos (DEC-051).`,
    );
  }

  return {
    tipo: linha.tipo,
    corretorId: linha.corretorId,
    equipeId: linha.equipeId,
    dataReferencia: linha.dataReferencia,
    valor,
  };
}

/** O `where` já restringiu os tipos; isto estreita o enum para o TypeScript. */
function ehTipoComSaldo(tipo: TipoEventoMetrica): tipo is TipoSaldoMetrica {
  return tipo === "VENDA" || tipo === "AVALIACAO_GOOGLE";
}

/**
 * O enum do schema tem sete tipos, mas `SaldoHistoricoMetrica` só admite os dois
 * com saldo de abertura. O guard existe para não fingir, com um cast largo, que
 * qualquer tipo serviria — se um dia aparecer linha de outro tipo, ela fica de
 * fora do domínio em vez de entrar disfarçada.
 */
function paraSaldos(linhas: readonly LinhaSaldo[]): SaldoHistoricoMetrica[] {
  const saldos: SaldoHistoricoMetrica[] = [];
  for (const linha of linhas) {
    if (!ehTipoComSaldo(linha.tipo)) continue;
    saldos.push({
      tipo: linha.tipo,
      quantidade: linha.quantidade,
      valorTotal: linha.valorTotal.toFixed(2),
      // Passa direto: a precisão não muda conta nenhuma aqui (DEC-054).
      precisao: linha.precisao,
      dataCorte: linha.dataCorte,
    });
  }
  return saldos;
}

/**
 * As propostas candidatas à lista operacional, extraídas das mesmas linhas de
 * lançamento que alimentam as métricas.
 *
 * Aqui só se **projeta** o tipo `PROPOSTA` para a forma que o núcleo espera. A
 * regra de produto — quais status entram, em que ordem e quantas cabem — é do
 * núcleo (DEC-013), e não acontece nesta camada. Uma proposta sem status ou sem
 * corretor não é candidata possível: o `CHECK` da E2B exige status, e proposta
 * credita pelo lançamento; se aparecer alguma assim, ela fica de fora em vez de
 * entrar com campo inventado.
 */
function paraPropostasCandidatas(linhas: readonly LinhaLancamento[]): PropostaOperacional[] {
  const candidatas: PropostaOperacional[] = [];
  for (const linha of linhas) {
    if (linha.tipo !== "PROPOSTA") continue;
    if (linha.statusProposta === null || linha.corretor === null) continue;
    candidatas.push({
      id: linha.id,
      status: linha.statusProposta,
      imovelRef: linha.imovelRef,
      corretorNome: linha.corretor.nomeExibicao,
      dataReferencia: linha.dataReferencia,
      criadoEm: linha.criadoEm,
    });
  }
  return candidatas;
}

/** As reservas candidatas. Sem filtro de status, sem ordem, sem corte. */
function paraReservasCandidatas(linhas: readonly LinhaReserva[]): ReservaOperacional[] {
  return linhas.map((linha) => ({
    id: linha.id,
    status: linha.status,
    imovelRef: linha.imovelRef,
    corretorNome: linha.corretor.nomeExibicao,
    dataReferencia: linha.dataReferencia,
    criadoEm: linha.criadoEm,
  }));
}

function paraCorretor(linha: LinhaCorretor): CorretorMetrica {
  return {
    id: linha.id,
    nomeExibicao: linha.nomeExibicao,
    equipeId: linha.equipeId,
    ativo: linha.ativo,
  };
}

function paraEquipe(linha: LinhaEquipe): EquipeMetrica {
  return {
    id: linha.id,
    nome: linha.nome,
    gerenteNome: linha.gerenteNome,
    ordemExibicao: linha.ordemExibicao,
    ativa: linha.ativa,
  };
}

/** Recorta de `MetricasEmpresaPuras` só a metade que não depende de saldo. */
function soPeriodicas(metricas: MetricasEmpresaPuras): MetricasEmpresaPeriodicas {
  return {
    estadoPeriodoMensal: metricas.estadoPeriodoMensal,
    vgvPeriodos: metricas.vgvPeriodos,
    quadroMensal: metricas.quadroMensal,
  };
}

/**
 * Compõe os dois sub-blocos da empresa a partir do que a leitura conseguiu.
 *
 * Fica deliberadamente fora de qualquer `try`: se o núcleo lançar — VENDA
 * relevante sem valor —, a exceção propaga em vez de virar `INDISPONIVEL`.
 *
 * No caso de saldo indisponível com lançamentos disponíveis, o núcleo é chamado
 * com `[]` no lugar dos saldos **apenas** para obter a metade periódica, que
 * não olha saldo nenhum. Os acumulados que essa chamada produz descrevem um
 * banco fictício sem saldo cadastrado (`SEM_SALDO_HISTORICO`), não o banco
 * real que falhou na leitura — por isso são descartados aqui e nunca expostos.
 */
function comporEmpresa(
  lancamentos: readonly LancamentoMetrica[] | null,
  saldos: readonly SaldoHistoricoMetrica[] | null,
  instante: Date,
): ResultadoPainel["empresa"] {
  if (lancamentos === null) {
    return {
      periodos: { estadoLeitura: "INDISPONIVEL" },
      acumulados: { estadoLeitura: "INDISPONIVEL" },
    };
  }

  if (saldos === null) {
    const parciais = calcularMetricasEmpresa(lancamentos, [], instante);
    return {
      periodos: { estadoLeitura: "OK", dados: soPeriodicas(parciais) },
      acumulados: { estadoLeitura: "INDISPONIVEL" },
    };
  }

  const completas = calcularMetricasEmpresa(lancamentos, saldos, instante);
  return {
    periodos: { estadoLeitura: "OK", dados: soPeriodicas(completas) },
    acumulados: { estadoLeitura: "OK", dados: completas.acumulados },
  };
}

/**
 * Lê o que o painel precisa e devolve os dois blocos já calculados.
 *
 * `agora` é injetável para o teste não depender do relógio, e serve só para
 * descobrir qual é o período civil corrente.
 *
 * As leituras são quatro `findMany` independentes sob `Promise.allSettled` — não
 * uma transação, e não `Promise.all`. `Promise.all` rejeita no primeiro erro e
 * apagaria da tela um bloco que tinha tudo de que precisava: se só o saldo
 * histórico falhar, os quadros de equipe continuam corretos e continuam
 * exibíveis. Conhecer sucesso e falha **de cada leitura** é o que permite esse
 * sucesso parcial.
 *
 * Nenhuma query ordena: a ordem final de equipes e rankings é decidida pelo
 * núcleo, com desempates próprios, e não pode depender da ordem em que o banco
 * devolveu as linhas.
 */
export async function obterMetricasPainel(
  prisma: PrismaClient,
  agora?: Date,
): Promise<ResultadoPainel> {
  // Uma referência temporal só, congelada antes de qualquer I/O. Dois
  // `new Date()` independentes poderiam cair em meses diferentes na virada e
  // produzir uma tela em que a empresa e as equipes falam de períodos distintos.
  const instante = agora ?? new Date();

  const [lidosLancamentos, lidosSaldos, lidosCorretores, lidosEquipes, lidasReservas] =
    await Promise.allSettled([
      // As participações vêm aninhadas, não numa leitura própria: elas são parte
      // do mesmo fato, e separá-las criaria um bloco cuja falha isolada — venda
      // sem crédito — não tem significado de tela. Falhando junto, cai o mesmo
      // bloco que já dependia de lançamentos. Os campos de proposta seguem a
      // mesma lógica: a lista operacional sai destas linhas.
      prisma.lancamento.findMany({
        select: {
          id: true,
          tipo: true,
          corretorId: true,
          equipeId: true,
          dataReferencia: true,
          valor: true,
          statusProposta: true,
          imovelRef: true,
          criadoEm: true,
          corretor: { select: { nomeExibicao: true } },
          participacoes: { select: { corretorId: true, equipeId: true, ordem: true } },
        },
      }),
      prisma.saldoHistorico.findMany({
        where: { tipo: { in: [...TIPOS_COM_SALDO] } },
        select: {
          tipo: true,
          quantidade: true,
          valorTotal: true,
          precisao: true,
          dataCorte: true,
        },
      }),
      prisma.corretor.findMany({
        select: { id: true, nomeExibicao: true, equipeId: true, ativo: true },
      }),
      prisma.equipe.findMany({
        select: { id: true, nome: true, gerenteNome: true, ordemExibicao: true, ativa: true },
      }),
      // Reserva tem leitura própria porque é uma entidade própria (DEC-055), e
      // é isso que permite ela cair sozinha sem levar métricas nem propostas
      // junto. Sem `where`, sem `orderBy` e sem `take`: o banco entrega os
      // candidatos e a regra de produto fica no núcleo.
      prisma.reservaLocacao.findMany({
        select: {
          id: true,
          status: true,
          imovelRef: true,
          dataReferencia: true,
          criadoEm: true,
          corretor: { select: { nomeExibicao: true } },
        },
      }),
    ]);

  // `null` aqui é leitura que falhou. Lista vazia é leitura que deu certo e não
  // achou nada — quem decide o que isso significa é o núcleo (DEC-039, DEC-040).
  const lancamentos =
    lidosLancamentos.status === "fulfilled" ? lidosLancamentos.value.map(paraLancamento) : null;
  const saldos = lidosSaldos.status === "fulfilled" ? paraSaldos(lidosSaldos.value) : null;
  const corretores =
    lidosCorretores.status === "fulfilled" ? lidosCorretores.value.map(paraCorretor) : null;
  const equipes = lidosEquipes.status === "fulfilled" ? lidosEquipes.value.map(paraEquipe) : null;

  // As propostas dependem da mesma leitura das métricas; as reservas, da sua.
  // Cada bloco cai só com quem ele depende (DEC-042).
  const propostasCandidatas =
    lidosLancamentos.status === "fulfilled"
      ? paraPropostasCandidatas(lidosLancamentos.value)
      : null;
  const reservasCandidatas =
    lidasReservas.status === "fulfilled" ? paraReservasCandidatas(lidasReservas.value) : null;

  // As chamadas ao núcleo ficam deliberadamente fora de qualquer `try`: exceção
  // de domínio precisa escapar, não virar `INDISPONIVEL`.
  return {
    empresa: comporEmpresa(lancamentos, saldos, instante),

    equipes:
      lancamentos !== null && corretores !== null && equipes !== null
        ? {
            estadoLeitura: "OK",
            dados: calcularMetricasEquipes(lancamentos, corretores, equipes, instante),
          }
        : { estadoLeitura: "INDISPONIVEL" },

    propostas:
      propostasCandidatas !== null
        ? { estadoLeitura: "OK", dados: selecionarPropostasEmAndamento(propostasCandidatas) }
        : { estadoLeitura: "INDISPONIVEL" },

    reservas:
      reservasCandidatas !== null
        ? { estadoLeitura: "OK", dados: selecionarReservasAtivas(reservasCandidatas) }
        : { estadoLeitura: "INDISPONIVEL" },
  };
}
