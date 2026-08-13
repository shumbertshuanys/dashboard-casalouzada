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
 * Eventos antes, exatamente em cima e depois de cada corte, os sete tipos do
 * enum, dinheiro com zeros finais (`1000000.00`) e com centavos, e a produção do
 * transferido dividida entre a equipe antiga e a atual.
 */
const LANCAMENTOS = [
  { corretor: "ana", equipe: "A", tipo: "VENDA", dia: "2026-05-10", valor: "700000.00" },
  { corretor: "ana", equipe: "A", tipo: "VENDA", dia: "2026-06-30", valor: "800000.00" },
  { corretor: "bruno", equipe: "A", tipo: "VENDA", dia: "2026-07-05", valor: "1000000.00" },
  { corretor: "fabio", equipe: "A", tipo: "VENDA", dia: "2026-08-10", valor: "1000000.00" },
  { corretor: "elena", equipe: "A", tipo: "VENDA", dia: "2026-08-12", valor: "1234567.89" },
  { corretor: "carla", equipe: "B", tipo: "LOCACAO", dia: "2026-08-05", valor: "3500.00" },
  { corretor: "carla", equipe: "B", tipo: "CAPTACAO_VENDA", dia: "2026-08-06", valor: null },
  { corretor: "diego", equipe: "C", tipo: "CAPTACAO_EXCLUSIVA", dia: "2026-08-07", valor: null },
  { corretor: "diego", equipe: "C", tipo: "CAPTACAO_LOCACAO", dia: "2026-08-08", valor: null },
  { corretor: "fabio", equipe: "B", tipo: "PROPOSTA", dia: "2026-08-09", valor: null },
  { corretor: "ana", equipe: "A", tipo: "AVALIACAO_GOOGLE", dia: "2026-07-31", valor: null },
  { corretor: "bruno", equipe: "A", tipo: "AVALIACAO_GOOGLE", dia: "2026-08-01", valor: null },
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
      },
    });
  }

  lancamentosEsperados = LANCAMENTOS.map((evento) => ({
    tipo: evento.tipo,
    corretorId: idDoCorretor.get(evento.corretor) as string,
    equipeId: idDaEquipe[evento.equipe],
    dataReferencia: paraDataCivil(evento.dia),
    valor: evento.valor,
  }));

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
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.mensal, "2234567.89");
  });

  it("as datas civis chegam sem deslocamento de fuso", () => {
    // A venda de 2026-06-30 está exatamente no corte e a de 2026-07-05 depois
    // dele: um dia deslocado mudaria as duas contas.
    assert.deepEqual(dadosAcumulados(resultado).vendidos, { estado: "OK", valor: 103 });
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.trimestral, "3234567.89");
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.anual, "4734567.89");
  });
});

describe("números da empresa", () => {
  it("os acumulados somam o saldo e só o que veio depois do corte de cada tipo", () => {
    const acumulados = dadosAcumulados(resultado);

    assert.deepEqual(acumulados.vendidos, { estado: "OK", valor: 103 });
    assert.deepEqual(acumulados.vgv, { estado: "OK", valor: "8234567.89" });
    // O corte da avaliação é outro: só o evento de 01/08 entra.
    assert.deepEqual(acumulados.avaliacoes, { estado: "OK", valor: 481 });
  });

  it("o quadro mensal conta os sete tipos, inclusive os do corretor inativo", () => {
    assert.deepEqual(dadosPeriodos(resultado).quadroMensal, {
      VENDA: 2,
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
    // A venda dela continua no VGV mensal da empresa: 1000000.00 do Fábio mais
    // 1234567.89 da Elena.
    assert.equal(dadosPeriodos(resultado).vgvPeriodos.mensal, "2234567.89");
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
