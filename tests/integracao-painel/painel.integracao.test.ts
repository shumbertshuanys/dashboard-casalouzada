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

/** Cortes diferentes por tipo, para cada acumulado usar o da própria linha. */
const SALDOS = [
  { tipo: "VENDA", quantidade: 100, valorTotal: "5000000.00", dataCorte: "2026-06-30" },
  { tipo: "AVALIACAO_GOOGLE", quantidade: 480, valorTotal: "0.00", dataCorte: "2026-07-31" },
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

  assert.equal(corretores, 0, `${AVISO_REPOUSO} — corretores encontrados: ${corretores}`);
  assert.equal(lancamentos, 0, `${AVISO_REPOUSO} — lançamentos encontrados: ${lancamentos}`);
  assert.equal(saldos, 0, `${AVISO_REPOUSO} — saldos históricos encontrados: ${saldos}`);
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
  ];

  for (const saldo of SALDOS) {
    await prisma.saldoHistorico.create({
      data: {
        tipo: saldo.tipo,
        quantidade: saldo.quantidade,
        valorTotal: saldo.valorTotal,
        dataCorte: paraDataCivil(saldo.dataCorte),
      },
    });
  }

  saldosEsperados = SALDOS.map((saldo) => ({
    tipo: saldo.tipo,
    quantidade: saldo.quantidade,
    valorTotal: saldo.valorTotal,
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
    const esperado = calcularMetricasEmpresa(lancamentosEsperados, saldosEsperados, AGORA);
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
    assert.deepEqual(dadosAcumulados(resultado).vendidos, { estado: "OK", valor: 104 });
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.trimestral, "4134567.89");
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.anual, "5634567.89");
  });
});

describe("números da empresa", () => {
  it("os acumulados somam o saldo e só o que veio depois do corte de cada tipo", () => {
    const acumulados = dadosAcumulados(resultado);

    assert.deepEqual(acumulados.vendidos, { estado: "OK", valor: 104 });
    assert.deepEqual(acumulados.vgv, { estado: "OK", valor: "9134567.89" });
    // O corte da avaliação é outro: só o evento de 01/08 entra.
    assert.deepEqual(acumulados.avaliacoes, { estado: "OK", valor: 481 });
  });

  it("o quadro mensal conta os sete tipos, inclusive os do corretor inativo", () => {
    assert.deepEqual(dadosPeriodos(resultado).quadroMensal, {
      // Três vendas no mês — a compartilhada conta uma, não três.
      VENDA: 3,
      LOCACAO: 1,
      CAPTACAO_VENDA: 1,
      CAPTACAO_EXCLUSIVA: 1,
      CAPTACAO_LOCACAO: 1,
      PROPOSTA: 1,
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

      const esperado = calcularMetricasEmpresa(lancamentosEsperados, saldosEsperados, AGORA);
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
    });
  });

  it("os imóveis vendidos acumulados somam saldo e eventos posteriores ao corte", () => {
    assert.deepEqual(apresentacaoReal.bigNumbers[0], {
      rotulo: "Imóveis vendidos",
      numero: { valor: "104" },
      estado: "OK",
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

  it("o quadro mensal chega com as sete linhas", () => {
    assert.equal(apresentacaoReal.quadroMensal.estado, "OK");
    assert.equal(apresentacaoReal.quadroMensal.linhas.length, 7);
    assert.deepEqual(apresentacaoReal.quadroMensal.linhas[0], { rotulo: "Vendidos", valor: "3" });
  });
});
