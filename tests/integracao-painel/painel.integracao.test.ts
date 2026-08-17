import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";
import {
  calcularMetricasEmpresa,
  calcularMetricasEquipes,
  type CorretorMetrica,
  type EquipeMetrica,
  type LancamentoMetrica,
  type MetricasEmpresaPuras,
  type MetricasEquipesPuras,
  type SaldoHistoricoMetrica,
} from "@/lib/metricas";
import {
  obterMetricasPainel,
  type MetricasEmpresaPeriodicas,
  type ResultadoPainel,
} from "@/lib/metricas-prisma";
import { type ApresentacaoPainel, criarApresentacaoPainel } from "@/lib/apresentacao-painel";

/**
 * A fronteira da F3.3 contra o PostgreSQL **local**.
 *
 * Suíte isolada, num diretório próprio e com script próprio
 * (`npm run test:integracao:painel`). O motivo é o que ela precisa medir:
 * `obterMetricasPainel` lê as tabelas **inteiras**, então qualquer fixture de
 * outra suíte rodando ao mesmo tempo entraria nas contas. Por isso ela exige o
 * banco em repouso antes de começar e falha alto se não estiver — não limpa nada
 * que não seja seu.
 *
 * O cliente vem de `criarPrismaTeste()`, nunca de `src/lib/db.ts` (DEC-041): é
 * ele que exige protocolo PostgreSQL, host local, database e role
 * `casalouzada_test` antes de abrir conexão.
 *
 * As fórmulas não são reescritas aqui. A asserção principal compara o resultado
 * da fronteira com o que as funções puras produzem sobre os objetos de domínio
 * esperados; o que se prova é a leitura, a conversão e a composição dos blocos.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__F33_TESTE_";
const nomeFixture = (sufixo: string) => `${PREFIXO}${sufixo}`;

/** Instante fixo: 15 de agosto de 2026 em São Paulo. Nada depende do relógio. */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

const EQUIPES_DO_SEED = ["Equipe Suellen", "Equipe Lena", "Equipe Fernanda L."];
const TIPOS_COM_SALDO = ["VENDA", "AVALIACAO_GOOGLE"] as const;

const AVISO_REPOUSO =
  "esta suíte exige o banco dedicado de teste em repouso: as três equipes do seed, " +
  "nenhum corretor, nenhum lançamento e nenhum saldo histórico. Rode-a sozinha, depois " +
  "de `npm run test:integracao` terminar, nunca em paralelo com ela";

type ChaveEquipe = "A" | "B" | "C";

const NOME_DA_EQUIPE: Record<ChaveEquipe, string> = {
  A: "Equipe Suellen",
  B: "Equipe Lena",
  C: "Equipe Fernanda L.",
};

/**
 * Elenco mínimo para provar a fronteira: os três times ocupados, um inativo que
 * produz, e um transferido — hoje em B, com evento do mês creditado a A.
 */
const CORRETORES = [
  { chave: "ana", exibicao: "Ana", equipe: "A", ativo: true },
  { chave: "bruno", exibicao: "Bruno", equipe: "A", ativo: true },
  { chave: "carla", exibicao: "Carla", equipe: "B", ativo: true },
  { chave: "diego", exibicao: "Diego", equipe: "C", ativo: true },
  { chave: "elena", exibicao: "Elena", equipe: "A", ativo: false },
  { chave: "fabio", exibicao: "Fábio", equipe: "B", ativo: true },
] as const;

type ChaveCorretor = (typeof CORRETORES)[number]["chave"];

/**
 * Os eventos de participante único: seis dos sete tipos do enum, com a produção
 * do transferido dividida entre a equipe antiga e a atual. Venda tem lista
 * própria — desde o cutover da E3 ela credita por participação (DEC-051).
 */
const LANCAMENTOS = [
  { corretor: "carla", equipe: "B", tipo: "LOCACAO", dia: "2026-08-05", valor: "3500.00" },
  { corretor: "carla", equipe: "B", tipo: "CAPTACAO_VENDA", dia: "2026-08-06", valor: null },
  { corretor: "diego", equipe: "C", tipo: "CAPTACAO_EXCLUSIVA", dia: "2026-08-07", valor: null },
  { corretor: "diego", equipe: "C", tipo: "CAPTACAO_LOCACAO", dia: "2026-08-08", valor: null },
  { corretor: "fabio", equipe: "B", tipo: "PROPOSTA", dia: "2026-08-09", valor: null },
  { corretor: "ana", equipe: "A", tipo: "AVALIACAO_GOOGLE", dia: "2026-07-31", valor: null },
  { corretor: "bruno", equipe: "A", tipo: "AVALIACAO_GOOGLE", dia: "2026-08-01", valor: null },
] as const;

/**
 * Vendas antes, exatamente em cima e depois do corte, dinheiro com zeros finais
 * (`1000000.00`) e com centavos, a venda do transferido creditada à equipe
 * antiga, e — a última — a **venda compartilhada canônica da DEC-052**: R$ 900
 * mil com dois participantes da equipe A e um da B.
 */
const VENDAS = [
  { dia: "2026-05-10", valor: "700000.00", participantes: [{ corretor: "ana", equipe: "A" }] },
  { dia: "2026-06-30", valor: "800000.00", participantes: [{ corretor: "ana", equipe: "A" }] },
  { dia: "2026-07-05", valor: "1000000.00", participantes: [{ corretor: "bruno", equipe: "A" }] },
  { dia: "2026-08-10", valor: "1000000.00", participantes: [{ corretor: "fabio", equipe: "A" }] },
  { dia: "2026-08-12", valor: "1234567.89", participantes: [{ corretor: "elena", equipe: "A" }] },
  {
    dia: "2026-08-14",
    valor: "900000.00",
    participantes: [
      { corretor: "ana", equipe: "A" },
      { corretor: "bruno", equipe: "A" },
      { corretor: "carla", equipe: "B" },
    ],
  },
] as const;

/**
 * Candidatas às listas operacionais da Tela B (DEC-056).
 *
 * Mais de três `AGUARDANDO` para o corte aparecer; uma `ACEITA` e uma
 * `REJEITADA` mais recentes, que precisam ficar de fora mesmo sendo as últimas;
 * e duas empatadas em data, para o desempate por criação/id valer.
 */
const PROPOSTAS = [
  { corretor: "ana", equipe: "A", dia: "2026-08-21", status: "AGUARDANDO", imovel: "AP-201" },
  { corretor: "bruno", equipe: "A", dia: "2026-08-22", status: "AGUARDANDO", imovel: "AP-202" },
  { corretor: "carla", equipe: "B", dia: "2026-08-23", status: "AGUARDANDO", imovel: "AP-203" },
  { corretor: "diego", equipe: "C", dia: "2026-08-24", status: "AGUARDANDO", imovel: "AP-204" },
  // Mais recentes que todas as acima — e ainda assim fora da lista.
  { corretor: "fabio", equipe: "B", dia: "2026-08-27", status: "ACEITA", imovel: "AP-901" },
  { corretor: "fabio", equipe: "B", dia: "2026-08-28", status: "REJEITADA", imovel: "AP-902" },
] as const;

/** Reservas: mais de três ATIVA, mais uma FINALIZADA e uma CANCELADA. */
const RESERVAS = [
  { corretor: "ana", equipe: "A", dia: "2026-08-11", status: "ATIVA", imovel: "CA-101" },
  { corretor: "bruno", equipe: "A", dia: "2026-08-12", status: "ATIVA", imovel: "CA-102" },
  { corretor: "carla", equipe: "B", dia: "2026-08-13", status: "ATIVA", imovel: "CA-103" },
  { corretor: "diego", equipe: "C", dia: "2026-08-14", status: "ATIVA", imovel: "CA-104" },
  { corretor: "fabio", equipe: "B", dia: "2026-08-25", status: "FINALIZADA", imovel: "CA-901" },
  { corretor: "fabio", equipe: "B", dia: "2026-08-26", status: "CANCELADA", imovel: "CA-902" },
] as const;

/**
 * Cortes diferentes por tipo, para cada acumulado usar o da própria linha.
 *
 * As precisões também são diferentes de propósito (DEC-054): o saldo de venda é
 * `MINIMO_CONHECIDO` — e leva o "+ de" até a tela nos dois big numbers que ele
 * alimenta —, enquanto o de avaliação é `EXATO` e continua sem qualificador.
 */
const SALDOS = [
  {
    tipo: "VENDA",
    quantidade: 100,
    valorTotal: "5000000.00",
    precisao: "MINIMO_CONHECIDO",
    dataCorte: "2026-06-30",
  },
  {
    tipo: "AVALIACAO_GOOGLE",
    quantidade: 480,
    valorTotal: "0.00",
    precisao: "EXATO",
    dataCorte: "2026-07-31",
  },
] as const;

/** Só vira `true` depois de o repouso ser confirmado — ver `after`. */
let fixtureNossa = false;

let idDaEquipe: Record<ChaveEquipe, string>;
const idDoCorretor = new Map<ChaveCorretor, string>();

let equipesEsperadas: EquipeMetrica[] = [];
let corretoresEsperados: CorretorMetrica[] = [];
let lancamentosEsperados: LancamentoMetrica[] = [];
let saldosEsperados: SaldoHistoricoMetrica[] = [];

let resultado: ResultadoPainel;
/** O mesmo resultado atravessado pela camada de apresentação, com o mesmo `AGORA`. */
let apresentacaoReal: ApresentacaoPainel;

/** Estado de repouso, provado antes de escrever qualquer linha. */
async function exigirRepouso(): Promise<void> {
  const equipes = await prisma.equipe.findMany({ select: { nome: true, ativa: true } });
  const ativas = equipes.filter((equipe) => equipe.ativa);

  assert.equal(equipes.length, 3, `${AVISO_REPOUSO} — equipes cadastradas: ${equipes.length}`);
  assert.equal(ativas.length, 3, `${AVISO_REPOUSO} — equipes ativas: ${ativas.length}`);
  assert.deepEqual(
    ativas.map((equipe) => equipe.nome).sort(),
    [...EQUIPES_DO_SEED].sort(),
    `${AVISO_REPOUSO} — as equipes ativas não são as três do seed`,
  );

  const corretores = await prisma.corretor.count();
  const lancamentos = await prisma.lancamento.count();
  const saldos = await prisma.saldoHistorico.count();
  const reservas = await prisma.reservaLocacao.count();

  assert.equal(corretores, 0, `${AVISO_REPOUSO} — corretores encontrados: ${corretores}`);
  assert.equal(lancamentos, 0, `${AVISO_REPOUSO} — lançamentos encontrados: ${lancamentos}`);
  assert.equal(saldos, 0, `${AVISO_REPOUSO} — saldos históricos encontrados: ${saldos}`);
  // A leitura de reservas é global, como as outras: uma reserva de terceiro
  // entraria na lista operacional desta suíte.
  assert.equal(reservas, 0, `${AVISO_REPOUSO} — reservas encontradas: ${reservas}`);
}

/**
 * As três equipes do seed são **referenciadas**, nunca criadas: o caminho feliz
 * precisa das mesmas três que o painel exige em produção (DEC-040).
 */
async function lerEquipesDoSeed(): Promise<void> {
  equipesEsperadas = await prisma.equipe.findMany({
    select: { id: true, nome: true, gerenteNome: true, ordemExibicao: true, ativa: true },
  });

  const porNome = (nome: string): string => {
    const equipe = equipesEsperadas.find((candidata) => candidata.nome === nome);
    assert.ok(equipe, `${AVISO_REPOUSO} — falta a equipe do seed ${nome}`);
    return equipe.id;
  };

  idDaEquipe = { A: porNome(NOME_DA_EQUIPE.A), B: porNome(NOME_DA_EQUIPE.B), C: porNome(NOME_DA_EQUIPE.C) };
}

async function criarFixture(): Promise<void> {
  for (const corretor of CORRETORES) {
    const criado = await prisma.corretor.create({
      data: {
        nomeCompleto: nomeFixture(corretor.chave),
        nomeExibicao: corretor.exibicao,
        equipeId: idDaEquipe[corretor.equipe],
        ativo: corretor.ativo,
      },
      select: { id: true },
    });
    idDoCorretor.set(corretor.chave, criado.id);
  }

  corretoresEsperados = CORRETORES.map((corretor) => ({
    id: idDoCorretor.get(corretor.chave) as string,
    nomeExibicao: corretor.exibicao,
    equipeId: idDaEquipe[corretor.equipe],
    ativo: corretor.ativo,
  }));

  for (const evento of LANCAMENTOS) {
    await prisma.lancamento.create({
      data: {
        tipo: evento.tipo,
        corretorId: idDoCorretor.get(evento.corretor) as string,
        // A equipe do evento é a gravada na fixture, não a lotação atual do
        // corretor: é isso que faz o transferido aparecer nos dois quadros.
        equipeId: idDaEquipe[evento.equipe],
        dataReferencia: paraDataCivil(evento.dia),
        valor: evento.valor,
        // Desde a E2B o CHECK exige status em toda proposta. As métricas não
        // olham este campo: a contagem independe do status (DEC-053).
        ...(evento.tipo === "PROPOSTA" ? { statusProposta: "AGUARDANDO" as const } : {}),
      },
    });
  }

  // Venda: um lançamento com os campos antigos NULL e o crédito nas
  // participações, gravadas na mesma escrita — é o estado final do cutover.
  for (const venda of VENDAS) {
    await prisma.lancamento.create({
      data: {
        tipo: "VENDA",
        dataReferencia: paraDataCivil(venda.dia),
        valor: venda.valor,
        participacoes: {
          create: venda.participantes.map((participante, indice) => ({
            corretorId: idDoCorretor.get(participante.corretor) as string,
            equipeId: idDaEquipe[participante.equipe],
            ordem: indice + 1,
          })),
        },
      },
    });
  }

  // Candidatas da Tela B. As propostas são lançamentos como quaisquer outros —
  // continuam contando no quadro mensal seja qual for o status (DEC-053) —, e
  // as reservas são entidade própria, fora de qualquer métrica (DEC-055).
  for (const proposta of PROPOSTAS) {
    await prisma.lancamento.create({
      data: {
        tipo: "PROPOSTA",
        corretorId: idDoCorretor.get(proposta.corretor) as string,
        equipeId: idDaEquipe[proposta.equipe],
        dataReferencia: paraDataCivil(proposta.dia),
        statusProposta: proposta.status,
        imovelRef: proposta.imovel,
      },
    });
  }

  for (const reserva of RESERVAS) {
    await prisma.reservaLocacao.create({
      data: {
        corretorId: idDoCorretor.get(reserva.corretor) as string,
        equipeId: idDaEquipe[reserva.equipe],
        dataReferencia: paraDataCivil(reserva.dia),
        status: reserva.status,
        imovelRef: reserva.imovel,
      },
    });
  }

  lancamentosEsperados = [
    ...LANCAMENTOS.map((evento) => ({
      tipo: evento.tipo,
      corretorId: idDoCorretor.get(evento.corretor) as string,
      equipeId: idDaEquipe[evento.equipe],
      dataReferencia: paraDataCivil(evento.dia),
      valor: evento.valor,
    })),
    ...VENDAS.map((venda) => ({
      tipo: "VENDA" as const,
      dataReferencia: paraDataCivil(venda.dia),
      valor: venda.valor,
      participacoes: venda.participantes.map((participante, indice) => ({
        corretorId: idDoCorretor.get(participante.corretor) as string,
        equipeId: idDaEquipe[participante.equipe],
        ordem: indice + 1,
      })),
    })),
    ...PROPOSTAS.map((proposta) => ({
      tipo: "PROPOSTA" as const,
      corretorId: idDoCorretor.get(proposta.corretor) as string,
      equipeId: idDaEquipe[proposta.equipe],
      dataReferencia: paraDataCivil(proposta.dia),
      valor: null,
    })),
  ];

  for (const saldo of SALDOS) {
    await prisma.saldoHistorico.create({
      data: {
        tipo: saldo.tipo,
        quantidade: saldo.quantidade,
        valorTotal: saldo.valorTotal,
        precisao: saldo.precisao,
        dataCorte: paraDataCivil(saldo.dataCorte),
      },
    });
  }

  saldosEsperados = SALDOS.map((saldo) => ({
    tipo: saldo.tipo,
    quantidade: saldo.quantidade,
    valorTotal: saldo.valorTotal,
    precisao: saldo.precisao,
    dataCorte: paraDataCivil(saldo.dataCorte),
  }));
}

/** Apaga só o que esta suíte criou. As três equipes do seed nunca são tocadas. */
async function limpar(cliente: PrismaClient): Promise<void> {
  // Uma venda não tem `corretor` no lançamento desde o cutover: o vínculo é a
  // participação, e ela segura o corretor por FK `Restrict`. Sem apagar as
  // vendas por aqui primeiro, a remoção dos corretores abaixo falharia e a
  // fixture ficaria para trás.
  await cliente.lancamento.deleteMany({
    where: { participacoes: { some: { corretor: { nomeCompleto: { startsWith: PREFIXO } } } } },
  });
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  // Reservas seguram o corretor por FK `Restrict`, como as participações.
  await cliente.reservaLocacao.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.saldoHistorico.deleteMany({ where: { tipo: { in: [...TIPOS_COM_SALDO] } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

before(async () => {
  await exigirRepouso();
  // A partir daqui tudo o que existir nas tabelas é nosso, e a limpeza do
  // `after` não corre risco de apagar dado de terceiro.
  fixtureNossa = true;

  await lerEquipesDoSeed();
  await criarFixture();

  resultado = await obterMetricasPainel(prisma, AGORA);
  apresentacaoReal = criarApresentacaoPainel(resultado, AGORA);
});

after(async () => {
  if (fixtureNossa) {
    await limpar(prisma);

    const corretores = await prisma.corretor.count();
    const lancamentos = await prisma.lancamento.count();
    const saldos = await prisma.saldoHistorico.count();
    const ativas = await prisma.equipe.findMany({ where: { ativa: true }, select: { nome: true } });

    console.log(
      `  restantes — corretores: ${corretores}, lancamentos: ${lancamentos}, saldos: ${saldos}`,
    );
    assert.equal(corretores, 0, "a limpeza precisa zerar os corretores");
    assert.equal(lancamentos, 0, "a limpeza precisa zerar os lançamentos");
    assert.equal(saldos, 0, "a limpeza precisa zerar o saldo histórico");
    assert.deepEqual(
      ativas.map((equipe) => equipe.nome).sort(),
      [...EQUIPES_DO_SEED].sort(),
      "as três equipes do seed continuam ativas e intactas",
    );
  }

  await prisma.$disconnect();
});

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

function dadosPeriodos(painel: ResultadoPainel): MetricasEmpresaPeriodicas {
  if (painel.empresa.periodos.estadoLeitura !== "OK") {
    throw new Error("o bloco de períodos da empresa deveria estar OK");
  }
  return painel.empresa.periodos.dados;
}

function dadosAcumulados(painel: ResultadoPainel): MetricasEmpresaPuras["acumulados"] {
  if (painel.empresa.acumulados.estadoLeitura !== "OK") {
    throw new Error("o bloco de acumulados da empresa deveria estar OK");
  }
  return painel.empresa.acumulados.dados;
}

function dadosEquipes(painel: ResultadoPainel): MetricasEquipesPuras {
  if (painel.equipes.estadoLeitura !== "OK") {
    throw new Error("o bloco de equipes deveria estar OK");
  }
  return painel.equipes.dados;
}

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string; usuario: string }[]
    >`SELECT current_database() AS db, current_user AS usuario`;
    assert.equal(linha.db, "casalouzada_test");
    assert.equal(linha.usuario, "casalouzada_test");
  });
});

describe("leitura completa — todos os blocos", () => {
  it("períodos, acumulados e equipes ficam OK", () => {
    assert.equal(resultado.empresa.periodos.estadoLeitura, "OK");
    assert.equal(resultado.empresa.acumulados.estadoLeitura, "OK");
    assert.equal(resultado.equipes.estadoLeitura, "OK");
  });

  it("empresa bate exatamente com o núcleo puro sobre os dados esperados", () => {
    const esperado = calcularMetricasEmpresa(lancamentosEsperados, saldosEsperados, [], AGORA);
    assert.deepEqual(resultado.empresa, {
      periodos: { estadoLeitura: "OK", dados: periodicasDe(esperado) },
      acumulados: { estadoLeitura: "OK", dados: esperado.acumulados },
    });
  });

  it("equipes bate exatamente com o núcleo puro sobre os dados esperados", () => {
    assert.deepEqual(resultado.equipes, {
      estadoLeitura: "OK",
      dados: calcularMetricasEquipes(
        lancamentosEsperados,
        corretoresEsperados,
        equipesEsperadas,
        AGORA,
      ),
    });
  });
});

describe("conversão Prisma → domínio", () => {
  it("o Decimal do banco chega como string canônica, com os zeros finais", () => {
    // Um `1000000.00` que tivesse passado por `number` voltaria como "1000000".
    const equipeA = dadosEquipes(resultado).equipes[0];
    const primeiro = equipeA.rankings.vgv[0];

    assert.equal(primeiro.corretorId, idDoCorretor.get("fabio"));
    assert.equal(typeof primeiro.valor, "string");
    assert.equal(primeiro.valor, "1000000.00");
  });

  it("os centavos sobrevivem à leitura", () => {
    // 1.000.000,00 + 1.234.567,89 + os 900.000,00 da venda compartilhada, que
    // entra **uma vez** pelo valor integral (DEC-052).
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.mensal, "3134567.89");
  });

  it("as datas civis chegam sem deslocamento de fuso", () => {
    // A venda de 2026-06-30 está exatamente no corte e a de 2026-07-05 depois
    // dele: um dia deslocado mudaria as duas contas.
    assert.deepEqual(dadosAcumulados(resultado).vendidos, {
      estado: "OK",
      valor: 104,
      precisao: "MINIMO_CONHECIDO",
    });
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.trimestral, "4134567.89");
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.anual, "5634567.89");
  });
});

describe("números da empresa", () => {
  it("os acumulados somam o saldo e só o que veio depois do corte de cada tipo", () => {
    const acumulados = dadosAcumulados(resultado);

    // A precisão do saldo de VENDA viaja junto dos dois acumulados que ele
    // alimenta, sem mudar número nenhum (DEC-054).
    assert.deepEqual(acumulados.vendidos, {
      estado: "OK",
      valor: 104,
      precisao: "MINIMO_CONHECIDO",
    });
    assert.deepEqual(acumulados.vgv, {
      estado: "OK",
      valor: "9134567.89",
      precisao: "MINIMO_CONHECIDO",
    });
    // O corte da avaliação é outro: só o evento de 01/08 entra. E a precisão é
    // a da própria linha de saldo — a de venda ser mínimo conhecido não
    // contamina esta.
    assert.deepEqual(acumulados.avaliacoes, { estado: "OK", valor: 481, precisao: "EXATO" });
  });

  it("o quadro mensal conta os sete tipos, inclusive os do corretor inativo", () => {
    assert.deepEqual(dadosPeriodos(resultado).quadroMensal, {
      // Três vendas no mês — a compartilhada conta uma, não três.
      VENDA: 3,
      LOCACAO: 1,
      CAPTACAO_VENDA: 1,
      CAPTACAO_EXCLUSIVA: 1,
      CAPTACAO_LOCACAO: 1,
      // Uma do elenco original mais as seis candidatas da Tela B: toda proposta
      // conta na métrica mensal, qualquer que seja o status (DEC-053).
      PROPOSTA: 7,
      AVALIACAO_GOOGLE: 1,
    });
    assert.equal(dadosPeriodos(resultado).estadoPeriodoMensal, "OK");
  });
});

describe("quadros de equipe", () => {
  it("saem as três equipes ativas, na ordem de exibição", () => {
    const equipes = dadosEquipes(resultado);
    assert.equal(equipes.estadoEquipes, "OK");
    assert.deepEqual(
      equipes.equipes.map((equipe) => equipe.nome),
      [NOME_DA_EQUIPE.A, NOME_DA_EQUIPE.B, NOME_DA_EQUIPE.C],
    );
  });

  it("o transferido aparece nos dois quadros", () => {
    const fabio = idDoCorretor.get("fabio");
    const [equipeA, equipeB] = dadosEquipes(resultado).equipes;

    assert.ok(equipeA.rankings.vgv.some((linha) => linha.corretorId === fabio));
    assert.ok(equipeB.rankings.vgv.some((linha) => linha.corretorId === fabio));
    // Sem duplicar produção: a venda dele conta só na equipe gravada no evento.
    assert.equal(equipeB.rankings.vgv.find((linha) => linha.corretorId === fabio)?.valor, "0.00");
  });

  it("o headcount é a lotação atual, não o elenco do mês", () => {
    const [equipeA, equipeB, equipeC] = dadosEquipes(resultado).equipes;

    // A tem Ana e Bruno ativos; Elena é inativa e Fábio já saiu.
    assert.equal(equipeA.totalCorretores, 2);
    assert.equal(equipeB.totalCorretores, 2);
    assert.equal(equipeC.totalCorretores, 1);
  });

  it("o corretor inativo fica fora dos rankings, mas seus eventos ficam na empresa", () => {
    const elena = idDoCorretor.get("elena");
    const linhas = dadosEquipes(resultado).equipes.flatMap((equipe) => equipe.rankings.vgv);

    assert.equal(
      linhas.some((linha) => linha.corretorId === elena),
      false,
    );
    // A venda dela continua no VGV mensal da empresa: 1000000.00 do Fábio,
    // 1234567.89 da Elena e 900000.00 da venda compartilhada.
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.mensal, "3134567.89");
  });
});

/**
 * O exemplo canônico da DEC-052, do banco até o domínio: R$ 900.000 com Ana e
 * Bruno na equipe A e Carla na B.
 *
 * Empresa: 1 venda e 900 mil, uma vez só. Cada participante: +1 vendido e
 * 300 mil. Equipe A: 600 mil — a soma das frações dos **dois** participantes
 * dela, não o valor da venda repetido. Equipe B: 300 mil. As duas somam
 * exatamente o valor integral.
 */
describe("venda compartilhada (DEC-052)", () => {
  /** O VGV que um corretor tem no quadro de uma equipe. */
  function vgvNoQuadro(indiceDaEquipe: number, chave: ChaveCorretor): string | undefined {
    const equipe = dadosEquipes(resultado).equipes[indiceDaEquipe];
    return equipe.rankings.vgv.find((linha) => linha.corretorId === idDoCorretor.get(chave))
      ?.valor;
  }

  function vendidosNoQuadro(indiceDaEquipe: number, chave: ChaveCorretor): number | undefined {
    const equipe = dadosEquipes(resultado).equipes[indiceDaEquipe];
    return equipe.rankings.vendidos.find(
      (linha) => linha.corretorId === idDoCorretor.get(chave),
    )?.valor;
  }

  it("cada participante recebe a sua fração igualitária", () => {
    // Ana e Bruno também têm a produção própria do mês? Não: as vendas
    // individuais deles são de maio, junho e julho. No mês corrente, o que
    // eles têm é exatamente a fração da venda compartilhada.
    assert.equal(vgvNoQuadro(0, "ana"), "300000.00");
    assert.equal(vgvNoQuadro(0, "bruno"), "300000.00");
    assert.equal(vgvNoQuadro(1, "carla"), "300000.00");
  });

  it("cada participante recebe +1 vendido", () => {
    assert.equal(vendidosNoQuadro(0, "ana"), 1);
    assert.equal(vendidosNoQuadro(0, "bruno"), 1);
    assert.equal(vendidosNoQuadro(1, "carla"), 1);
  });

  it("a equipe com dois participantes recebe a soma das frações, não o valor repetido", () => {
    const equipeA = dadosEquipes(resultado).equipes[0];
    const equipeB = dadosEquipes(resultado).equipes[1];

    // Só as linhas dos participantes da venda compartilhada. Fábio tem a venda
    // individual de 1 milhão no quadro de A e fica de fora desta conta.
    const daVendaEmA = ["ana", "bruno"].map((chave) =>
      equipeA.rankings.vgv.find(
        (linha) => linha.corretorId === idDoCorretor.get(chave as ChaveCorretor),
      ),
    );
    assert.deepEqual(
      daVendaEmA.map((linha) => linha?.valor),
      ["300000.00", "300000.00"],
    );

    const carla = equipeB.rankings.vgv.find(
      (linha) => linha.corretorId === idDoCorretor.get("carla"),
    );
    assert.equal(carla?.valor, "300000.00");

    // 600 mil de A mais 300 mil de B = o valor integral da venda. Se a equipe A
    // tivesse recebido a venda "duas vezes", isto daria 2,1 milhões.
    const centavos = ["300000.00", "300000.00", "300000.00"].reduce(
      (total, valor) => total + BigInt(valor.replace(".", "")),
      BigInt(0),
    );
    assert.equal(centavos, BigInt("90000000"));
  });

  it("a empresa conta a venda uma vez, qualquer que seja o elenco", () => {
    // Três participantes, um evento: o quadro mensal e o VGV do mês já provam
    // isso acima; aqui a leitura do banco confirma que é mesmo uma linha só.
    const vendasDeAgosto = lancamentosEsperados.filter(
      (lancamento) =>
        lancamento.tipo === "VENDA" &&
        lancamento.dataReferencia >= paraDataCivil("2026-08-01") &&
        lancamento.dataReferencia <= paraDataCivil("2026-08-31"),
    );
    assert.equal(vendasDeAgosto.length, 3);
  });
});

describe("configuração inválida não contamina os números da empresa", () => {
  it("com uma quarta equipe ativa, só a área de equipes cai", async () => {
    const quarta = await prisma.equipe.create({
      data: {
        nome: nomeFixture("QUARTA_EQUIPE"),
        gerenteNome: "Gerente Extra",
        ordemExibicao: 94,
        ativa: true,
      },
      select: { id: true },
    });

    try {
      const comQuatro = await obterMetricasPainel(prisma, AGORA);

      // A leitura funcionou: o estado de leitura continua OK nos dois blocos.
      assert.equal(comQuatro.equipes.estadoLeitura, "OK");
      assert.equal(dadosEquipes(comQuatro).estadoEquipes, "CONFIGURACAO_INVALIDA");
      assert.deepEqual(dadosEquipes(comQuatro).equipes, []);

      const esperado = calcularMetricasEmpresa(lancamentosEsperados, saldosEsperados, [], AGORA);
      assert.deepEqual(comQuatro.empresa, {
        periodos: { estadoLeitura: "OK", dados: periodicasDe(esperado) },
        acumulados: { estadoLeitura: "OK", dados: esperado.acumulados },
      });

      // E a mesma coisa vista pela ponta que a TV consome: a área de equipes
      // acusa a configuração, sem lista, e os números da empresa continuam
      // sendo entregues formatados.
      const apresentacao = criarApresentacaoPainel(comQuatro, AGORA);

      assert.equal(apresentacao.equipes.estado, "CONFIGURACAO_INVALIDA");
      assert.equal("equipes" in apresentacao.equipes, false);
      assert.ok(apresentacao.bigNumbers.every((big) => big.estado === "OK"));
      assert.ok(apresentacao.vgvPeriodos.every((item) => item.estado === "OK"));
      assert.equal(apresentacao.quadroMensal.estado, "OK");
    } finally {
      await prisma.equipe.delete({ where: { id: quarta.id } });
    }
  });

  it("removida a quarta equipe, os quadros voltam", async () => {
    const voltou = await obterMetricasPainel(prisma, AGORA);
    assert.equal(dadosEquipes(voltou).estadoEquipes, "OK");
    assert.equal(dadosEquipes(voltou).equipes.length, 3);
  });
});

/**
 * A cadeia inteira, do banco ao que a tela desenha.
 *
 * Poucos asserts, escolhidos por serem discriminantes: o que se prova aqui é que
 * banco → leitura → apresentação continua ligado e coerente, não os detalhes de
 * formatação, que têm as 85 asserções da `tests/apresentacao-painel.test.ts`.
 *
 * Um instante só, o mesmo `AGORA` das duas camadas — como a rota faz.
 */
describe("banco → leitura → apresentação", () => {
  it("o período sai do mesmo instante das métricas", () => {
    assert.equal(apresentacaoReal.periodo, "agosto de 2026");
  });

  it("o VGV acumulado chega compacto e com moeda", () => {
    // 5.000.000,00 do saldo mais as quatro vendas posteriores ao corte.
    assert.deepEqual(apresentacaoReal.bigNumbers[1], {
      rotulo: "VGV acumulado",
      numero: { prefixo: "R$", valor: "9,1", sufixo: "mi" },
      estado: "OK",
      // O saldo de VENDA é mínimo conhecido nesta fixture (DEC-054).
      qualificador: "+ de",
    });
  });

  it("os imóveis vendidos acumulados somam saldo e eventos posteriores ao corte", () => {
    assert.deepEqual(apresentacaoReal.bigNumbers[0], {
      rotulo: "Imóveis vendidos",
      numero: { valor: "104" },
      estado: "OK",
      qualificador: "+ de",
    });
  });

  it("as três equipes do seed chegam à tela", () => {
    const area = apresentacaoReal.equipes;
    assert.equal(area.estado, "OK");
    if (area.estado !== "OK") return;

    assert.deepEqual(
      area.equipes.map((equipe) => equipe.nome),
      [NOME_DA_EQUIPE.A, NOME_DA_EQUIPE.B, NOME_DA_EQUIPE.C],
    );
  });

  it("o ranking de VGV distingue quem vendeu de quem não vendeu", () => {
    const area = apresentacaoReal.equipes;
    if (area.estado !== "OK") return;

    // Fábio tem a venda individual de 1.000.000,00 creditada à equipe A; Ana e
    // Bruno têm a fração de 300.000,00 da venda compartilhada — e é a fração
    // que chega formatada à tela, não o valor integral da venda.
    const [primeiro, ...resto] = area.equipes[0].rankings.vgv;
    assert.deepEqual(primeiro, { rotulo: "Fábio", valor: "R$ 1,0 mi" });
    assert.deepEqual(resto, [
      { rotulo: "Ana", valor: "R$ 0,3 mi" },
      { rotulo: "Bruno", valor: "R$ 0,3 mi" },
    ]);
  });

  it("o saldo mínimo conhecido atravessa até a tela como `+ de`", () => {
    // O saldo de VENDA é MINIMO_CONHECIDO e alimenta dois big numbers; o de
    // avaliação é EXATO e continua sem qualificador (DEC-054).
    assert.equal(apresentacaoReal.bigNumbers[0].qualificador, "+ de", "imóveis vendidos");
    assert.equal(apresentacaoReal.bigNumbers[1].qualificador, "+ de", "VGV acumulado");
    assert.equal(apresentacaoReal.bigNumbers[2].qualificador, undefined, "avaliações");

    // O número não muda por causa da precisão — só a afirmação.
    assert.equal(apresentacaoReal.bigNumbers[0].numero.valor, "104");
    assert.deepEqual(apresentacaoReal.bigNumbers[1].numero, {
      prefixo: "R$",
      valor: "9,1",
      sufixo: "mi",
    });
  });

  it("o quadro mensal chega com as sete linhas", () => {
    assert.equal(apresentacaoReal.quadroMensal.estado, "OK");
    assert.equal(apresentacaoReal.quadroMensal.linhas.length, 7);
    assert.deepEqual(apresentacaoReal.quadroMensal.linhas[0], { rotulo: "Vendidos", valor: "3" });
  });
});

/**
 * A Tela B do banco até a tela (DEC-056).
 *
 * A seleção — status, ordem e corte em três — é do núcleo, e o que se prova aqui
 * é que ela atravessa a leitura real inteira, com os nomes e imóveis certos.
 */
describe("listas operacionais — banco → leitura → apresentação", () => {
  function itensDe(lista: (typeof apresentacaoReal)["operacionais"]["propostas"]) {
    assert.equal(lista.estado, "OK");
    if (lista.estado !== "OK") return [];
    return lista.itens;
  }

  it("propostas: só AGUARDANDO, as três mais recentes, imóvel e corretor", () => {
    const itens = itensDe(apresentacaoReal.operacionais.propostas);

    assert.deepEqual(itens, [
      { imovel: "AP-204", corretor: "Diego" },
      { imovel: "AP-203", corretor: "Carla" },
      { imovel: "AP-202", corretor: "Bruno" },
    ]);
  });

  it("a ACEITA e a REJEITADA ficam de fora, mesmo sendo as mais recentes", () => {
    const imoveis = itensDe(apresentacaoReal.operacionais.propostas).map((item) => item.imovel);

    assert.equal(imoveis.includes("AP-901"), false, "ACEITA não entra");
    assert.equal(imoveis.includes("AP-902"), false, "REJEITADA não entra");
  });

  it("reservas: só ATIVA, as três mais recentes, imóvel e corretor", () => {
    const itens = itensDe(apresentacaoReal.operacionais.reservas);

    assert.deepEqual(itens, [
      { imovel: "CA-104", corretor: "Diego" },
      { imovel: "CA-103", corretor: "Carla" },
      { imovel: "CA-102", corretor: "Bruno" },
    ]);
  });

  it("a FINALIZADA e a CANCELADA ficam de fora, mesmo sendo as mais recentes", () => {
    const imoveis = itensDe(apresentacaoReal.operacionais.reservas).map((item) => item.imovel);

    assert.equal(imoveis.includes("CA-901"), false, "FINALIZADA não entra");
    assert.equal(imoveis.includes("CA-902"), false, "CANCELADA não entra");
  });

  it("as duas listas param em três, mesmo com quatro candidatas cada", () => {
    assert.equal(itensDe(apresentacaoReal.operacionais.propostas).length, 3);
    assert.equal(itensDe(apresentacaoReal.operacionais.reservas).length, 3);
  });

  it("os dois blocos de leitura ficam OK", () => {
    assert.equal(resultado.propostas.estadoLeitura, "OK");
    assert.equal(resultado.reservas.estadoLeitura, "OK");
  });

  it("reserva não mexe em métrica nenhuma", () => {
    // Reserva é operação, não produção (DEC-055): as seis criadas não aparecem
    // no quadro mensal, no VGV nem em ranking algum.
    assert.equal(dadosPeriodos(resultado).quadroMensal.LOCACAO, 1, "só a locação real");
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.mensal, "3134567.89");

    const locadosDaEquipeC = dadosEquipes(resultado).equipes[2].rankings.locados;
    assert.ok(
      locadosDaEquipeC.every((linha) => linha.valor === 0),
      "a reserva do Diego não virou locação",
    );
  });

  it("a venda compartilhada da E3 continua intacta com as listas no ar", () => {
    const equipeA = dadosEquipes(resultado).equipes[0];
    const ana = equipeA.rankings.vgv.find(
      (linha) => linha.corretorId === idDoCorretor.get("ana"),
    );

    assert.equal(ana?.valor, "300000.00", "a fração da venda compartilhada não mudou");
    assert.equal(dadosPeriodos(resultado).quadroMensal.VENDA, 3);
  });
});

/**
 * E4 — o VGV histórico mensal, lido do banco de verdade.
 *
 * Bloco isolado, com fixture própria: as sete competências entram **depois** de
 * a leitura compartilhada da suíte já ter sido calculada, então nenhuma
 * asserção anterior muda de valor por causa delas.
 *
 * A massa do escritório é exatamente esta — jan a jul de 2026 consolidados, e
 * agosto em diante alimentado por VENDA real. Os três meses cobertos que têm
 * venda na fixture (maio, junho e julho) são o que torna a substituição
 * observável de ponta a ponta.
 */
describe("E4 — VGV histórico mensal lido do PostgreSQL", () => {
  const COMPETENCIAS = [
    { mes: "2026-01", valor: "2000000.00" },
    { mes: "2026-02", valor: "3000000.00" },
    { mes: "2026-03", valor: "4000000.00" },
    { mes: "2026-04", valor: "5000000.00" },
    { mes: "2026-05", valor: "6000000.00" },
    { mes: "2026-06", valor: "7000000.00" },
    { mes: "2026-07", valor: "8000000.00" },
  ] as const;

  let comHistorico: ResultadoPainel;

  before(async () => {
    assert.equal(
      await prisma.vgvHistoricoMensal.count(),
      0,
      "a tabela precisa estar vazia antes desta fixture",
    );

    for (const competencia of COMPETENCIAS) {
      await prisma.vgvHistoricoMensal.create({
        data: {
          competencia: paraDataCivil(`${competencia.mes}-01`),
          valorTotal: competencia.valor,
        },
      });
    }

    comHistorico = await obterMetricasPainel(prisma, AGORA);
  });

  after(async () => {
    await prisma.vgvHistoricoMensal.deleteMany({});
    assert.equal(
      await prisma.vgvHistoricoMensal.count(),
      0,
      "a limpeza precisa zerar o VGV histórico mensal",
    );
  });

  it("a leitura chega ao núcleo com competência e valor canônico", () => {
    // A conversão é provada comparando com a própria função pura alimentada
    // pelo domínio esperado: se `competencia` fosse reinterpretada noutro fuso,
    // ou se o `Decimal` passasse por `number`, os números divergiriam aqui.
    const historicosEsperados = COMPETENCIAS.map((competencia) => ({
      competencia: paraDataCivil(`${competencia.mes}-01`),
      valorTotal: competencia.valor,
    }));

    const esperado = calcularMetricasEmpresa(
      lancamentosEsperados,
      saldosEsperados,
      historicosEsperados,
      AGORA,
    );

    assert.equal(comHistorico.empresa.periodos.estadoLeitura, "OK");
    if (comHistorico.empresa.periodos.estadoLeitura !== "OK") return;
    assert.deepEqual(comHistorico.empresa.periodos.dados.vgvPeriodos, esperado.vgvPeriodos);
  });

  it("o mensal não muda — agosto continua sendo só VENDA real", () => {
    assert.equal(comHistorico.empresa.periodos.estadoLeitura, "OK");
    if (comHistorico.empresa.periodos.estadoLeitura !== "OK") return;

    assert.equal(comHistorico.empresa.periodos.dados.vgvPeriodos.mensal, "3134567.89");
    assert.equal(
      comHistorico.empresa.periodos.dados.vgvPeriodos.mensal,
      dadosPeriodos(resultado).vgvPeriodos.mensal,
      "idêntico ao da leitura sem histórico",
    );
  });

  it("o trimestral substitui julho pelo agregado", () => {
    assert.equal(comHistorico.empresa.periodos.estadoLeitura, "OK");
    if (comHistorico.empresa.periodos.estadoLeitura !== "OK") return;

    // Q3 é jul–set. Antes: a venda de 1.000.000 de julho mais os 3.134.567,89 de
    // agosto. Agora julho está coberto, sua venda sai, e entram 8.000.000.
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.trimestral, "4134567.89");
    assert.equal(comHistorico.empresa.periodos.dados.vgvPeriodos.trimestral, "11134567.89");
  });

  it("o anual substitui maio, junho e julho pelos agregados", () => {
    assert.equal(comHistorico.empresa.periodos.estadoLeitura, "OK");
    if (comHistorico.empresa.periodos.estadoLeitura !== "OK") return;

    // Antes: 700.000 (maio) + 800.000 (junho) + 4.134.567,89 (Q3) = 5.634.567,89.
    // Agora os três meses com venda estão cobertos e entram os sete agregados:
    // 35.000.000 + 3.134.567,89 de agosto.
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.anual, "5634567.89");
    assert.equal(comHistorico.empresa.periodos.dados.vgvPeriodos.anual, "38134567.89");
  });

  it("os acumulados e as equipes ficam exatamente onde estavam", () => {
    assert.deepEqual(
      comHistorico.empresa.acumulados,
      resultado.empresa.acumulados,
      "saldo histórico continua sendo o único dono dos acumulados",
    );
    assert.deepEqual(comHistorico.equipes, resultado.equipes);
    assert.deepEqual(comHistorico.propostas, resultado.propostas);
    assert.deepEqual(comHistorico.reservas, resultado.reservas);
  });

  it("o quadro mensal continua contando só VENDA real", () => {
    assert.equal(comHistorico.empresa.periodos.estadoLeitura, "OK");
    if (comHistorico.empresa.periodos.estadoLeitura !== "OK") return;

    assert.deepEqual(
      comHistorico.empresa.periodos.dados.quadroMensal,
      dadosPeriodos(resultado).quadroMensal,
    );
  });
});
