import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";

/**
 * Modelo da Entrega v1 (E2A) contra o PostgreSQL **local**.
 *
 * Só o que a migration aditiva entregou: `ParticipacaoVenda` com as duas
 * unicidades, os campos de proposta, a precisão do saldo e a reserva com
 * default `ATIVA`. Nada de métricas, divisão de VGV ou painel — o cutover e o
 * cálculo da venda compartilhada são da E3 (DEC-051, DEC-052).
 *
 * As suítes de integração rodam em paralelo — e os `it` de um mesmo describe
 * também. Por isso esta suíte não disputa nada nem com as outras nem consigo:
 * equipes/corretores/lançamentos têm prefixo próprio, reservas só existem
 * aqui, e os testes de precisão do saldo usam os tipos `LOCACAO` e
 * `CAPTACAO_LOCACAO` — que o DDL aceita e nenhuma outra suíte cria — para não
 * tocar nas linhas `VENDA`/`AVALIACAO_GOOGLE` da suíte de saldo histórico nem
 * disputar a unicidade de `tipo` entre si.
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__E2A_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

async function limpar(cliente: PrismaClient): Promise<void> {
  // Participações caem por Cascade junto com os lançamentos.
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.reservaLocacao.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.saldoHistorico.deleteMany({
    where: { tipo: { in: ["LOCACAO", "CAPTACAO_LOCACAO"] }, descricao: { startsWith: PREFIXO } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

let equipeId = "";
let outraEquipeId = "";
let corretorId = "";
let outroCorretorId = "";

before(async () => {
  await limpar(prisma);

  const equipe = await prisma.equipe.create({
    data: { nome: nome("Equipe"), gerenteNome: "E2A", ordemExibicao: 97, ativa: false },
  });
  const outraEquipe = await prisma.equipe.create({
    data: { nome: nome("Equipe B"), gerenteNome: "E2A", ordemExibicao: 98, ativa: false },
  });
  const corretor = await prisma.corretor.create({
    data: { nomeCompleto: nome("Corretor"), nomeExibicao: "E2A Um", equipeId: equipe.id },
  });
  const outro = await prisma.corretor.create({
    data: { nomeCompleto: nome("Corretor B"), nomeExibicao: "E2A Dois", equipeId: outraEquipe.id },
  });

  equipeId = equipe.id;
  outraEquipeId = outraEquipe.id;
  corretorId = corretor.id;
  outroCorretorId = outro.id;
});

after(async () => {
  await limpar(prisma);
  await prisma.$disconnect();
});

async function criarVenda(): Promise<string> {
  const venda = await prisma.lancamento.create({
    data: {
      tipo: "VENDA",
      corretorId,
      equipeId,
      dataReferencia: paraDataCivil("2026-08-05"),
      valor: "900000.00",
    },
  });
  return venda.id;
}

describe("ParticipacaoVenda", () => {
  it("persiste corretor, equipe histórica e ordem", async () => {
    const lancamentoId = await criarVenda();

    // A equipe da participação é o snapshot informado — deliberadamente a de
    // outra equipe, para provar que nada é derivado da lotação do corretor.
    const criada = await prisma.participacaoVenda.create({
      data: { lancamentoId, corretorId, equipeId: outraEquipeId, ordem: 1 },
    });

    const relida = await prisma.participacaoVenda.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.lancamentoId, lancamentoId);
    assert.equal(relida.corretorId, corretorId);
    assert.equal(relida.equipeId, outraEquipeId);
    assert.equal(relida.ordem, 1);
  });

  it("o banco recusa o mesmo corretor duas vezes na mesma venda", async () => {
    const lancamentoId = await criarVenda();
    await prisma.participacaoVenda.create({
      data: { lancamentoId, corretorId, equipeId, ordem: 1 },
    });

    // A recusa é a prova: quem barra é a unique do banco, não código nosso.
    await assert.rejects(
      () =>
        prisma.participacaoVenda.create({
          data: { lancamentoId, corretorId, equipeId, ordem: 2 },
        }),
      (erro: unknown) => (erro as { code?: string }).code === "P2002",
    );
  });

  it("o banco recusa a mesma ordem duas vezes na mesma venda", async () => {
    const lancamentoId = await criarVenda();
    await prisma.participacaoVenda.create({
      data: { lancamentoId, corretorId, equipeId, ordem: 1 },
    });

    await assert.rejects(
      () =>
        prisma.participacaoVenda.create({
          data: { lancamentoId, corretorId: outroCorretorId, equipeId: outraEquipeId, ordem: 1 },
        }),
      (erro: unknown) => (erro as { code?: string }).code === "P2002",
    );

    // Contraprova: outro corretor com outra ordem entra normalmente.
    const segunda = await prisma.participacaoVenda.create({
      data: { lancamentoId, corretorId: outroCorretorId, equipeId: outraEquipeId, ordem: 2 },
    });
    assert.equal(segunda.ordem, 2);
  });

  it("apagar a venda leva as participações junto (Cascade)", async () => {
    const lancamentoId = await criarVenda();
    await prisma.participacaoVenda.create({
      data: { lancamentoId, corretorId, equipeId, ordem: 1 },
    });

    await prisma.lancamento.delete({ where: { id: lancamentoId } });

    const restantes = await prisma.participacaoVenda.count({ where: { lancamentoId } });
    assert.equal(restantes, 0);
  });
});

describe("campos de proposta", () => {
  it("armazena statusProposta e valorProposta quando informados", async () => {
    const proposta = await prisma.lancamento.create({
      data: {
        tipo: "PROPOSTA",
        corretorId,
        equipeId,
        dataReferencia: paraDataCivil("2026-08-06"),
        imovelRef: "AP-202",
        valorProposta: "450000.00",
        statusProposta: "AGUARDANDO",
      },
    });

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: proposta.id } });
    assert.equal(relida.statusProposta, "AGUARDANDO");
    // Comparação por string: um double não representaria dinheiro exatamente.
    assert.equal(relida.valorProposta?.toFixed(2), "450000.00");
    // O `valor` monetário continua fora da proposta (DEC-053).
    assert.equal(relida.valor, null);
  });

  it("sem status, o banco recusa — a E2B fechou a janela transitória da E2A", async () => {
    // Na E2A este teste afirmava o NULL transitório; desde o CHECK da E2B,
    // proposta sem status não entra mais (DEC-053).
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: {
            tipo: "PROPOSTA",
            corretorId,
            equipeId,
            dataReferencia: paraDataCivil("2026-08-07"),
            imovelRef: "AP-203",
          },
        }),
      (erro: unknown) => /check|23514|proposta_campos/i.test(String((erro as Error).message)),
    );
  });
});

describe("SaldoHistorico.precisao", () => {
  // Os `it` de um mesmo describe rodam CONCORRENTES no runner do Node, e
  // `saldo_historico.tipo` é único. Cada teste usa portanto um tipo próprio —
  // que o DDL aceita e nenhuma outra suíte cria — e cuida da própria fixture
  // do começo ao fim: nada é herdado nem disputado entre `it`s.

  it("nasce EXATO quando não informada", async () => {
    await prisma.saldoHistorico.deleteMany({
      where: { tipo: "LOCACAO", descricao: { startsWith: PREFIXO } },
    });

    const saldo = await prisma.saldoHistorico.create({
      data: {
        tipo: "LOCACAO",
        quantidade: 10,
        valorTotal: "1.00",
        dataCorte: paraDataCivil("2026-01-01"),
        descricao: nome("saldo default"),
      },
    });

    assert.equal(saldo.precisao, "EXATO");

    await prisma.saldoHistorico.delete({ where: { id: saldo.id } });
  });

  it("aceita MINIMO_CONHECIDO quando explícito", async () => {
    await prisma.saldoHistorico.deleteMany({
      where: { tipo: "CAPTACAO_LOCACAO", descricao: { startsWith: PREFIXO } },
    });

    const criado = await prisma.saldoHistorico.create({
      data: {
        tipo: "CAPTACAO_LOCACAO",
        quantidade: 20,
        valorTotal: "2.00",
        dataCorte: paraDataCivil("2026-02-01"),
        descricao: nome("saldo minimo"),
      },
    });
    assert.equal(criado.precisao, "EXATO");

    const alterado = await prisma.saldoHistorico.update({
      where: { id: criado.id },
      data: { precisao: "MINIMO_CONHECIDO" },
    });
    assert.equal(alterado.precisao, "MINIMO_CONHECIDO");

    // Releitura: a precisão persistiu e o resto da linha não foi tocado.
    const relido = await prisma.saldoHistorico.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.precisao, "MINIMO_CONHECIDO");
    assert.equal(relido.quantidade, 20);
    assert.equal(relido.valorTotal.toFixed(2), "2.00");

    await prisma.saldoHistorico.delete({ where: { id: criado.id } });
  });
});

describe("ReservaLocacao", () => {
  it("nasce ATIVA quando o status não é informado", async () => {
    const reserva = await prisma.reservaLocacao.create({
      data: {
        corretorId,
        equipeId,
        imovelRef: "CASA-31",
        dataReferencia: paraDataCivil("2026-08-08"),
      },
    });

    assert.equal(reserva.status, "ATIVA");
    assert.equal(reserva.imovelRef, "CASA-31");
  });

  it("guarda o snapshot de equipe informado, não a lotação do corretor", async () => {
    const reserva = await prisma.reservaLocacao.create({
      data: {
        corretorId,
        // Snapshot deliberadamente diferente da equipe atual do corretor.
        equipeId: outraEquipeId,
        imovelRef: "CASA-32",
        dataReferencia: paraDataCivil("2026-08-09"),
      },
    });

    const relida = await prisma.reservaLocacao.findUniqueOrThrow({ where: { id: reserva.id } });
    assert.equal(relida.equipeId, outraEquipeId);
  });
});
