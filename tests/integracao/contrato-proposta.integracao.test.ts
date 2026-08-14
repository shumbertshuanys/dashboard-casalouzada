import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";

/**
 * Contrato de proposta e precisão do saldo (E2B) contra o PostgreSQL **local**.
 *
 * Todo `it` é autossuficiente e seguro sob concorrência — dentro do arquivo e
 * entre arquivos: cada lançamento é uma linha nova (nenhuma unique disputada),
 * e os testes de saldo usam os tipos `CAPTACAO_VENDA` e `PROPOSTA` — que o DDL
 * aceita e nenhuma outra suíte cria (a suíte de saldo usa VENDA/AVALIACAO, e a
 * da E2A usa LOCACAO/CAPTACAO_LOCACAO).
 */

const prisma = criarPrismaTeste();
const PREFIXO = "__E2B_TESTE_";
const nome = (sufixo: string) => `${PREFIXO}${sufixo}`;

/** Um erro de CHECK do PostgreSQL, qualquer que seja a embalagem do Prisma. */
function ehViolacaoDeCheck(erro: unknown): boolean {
  return /check|23514|proposta_campos/i.test(String((erro as Error).message ?? ""));
}

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.lancamento.deleteMany({
    where: { corretor: { nomeCompleto: { startsWith: PREFIXO } } },
  });
  await cliente.saldoHistorico.deleteMany({
    where: { tipo: { in: ["CAPTACAO_VENDA", "PROPOSTA"] }, descricao: { startsWith: PREFIXO } },
  });
  await cliente.corretor.deleteMany({ where: { nomeCompleto: { startsWith: PREFIXO } } });
  await cliente.equipe.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
}

let equipeId = "";
let corretorId = "";

before(async () => {
  await limpar(prisma);
  const equipe = await prisma.equipe.create({
    data: { nome: nome("Equipe"), gerenteNome: "E2B", ordemExibicao: 95, ativa: false },
  });
  const corretor = await prisma.corretor.create({
    data: { nomeCompleto: nome("Corretor"), nomeExibicao: "E2B Um", equipeId: equipe.id },
  });
  equipeId = equipe.id;
  corretorId = corretor.id;
});

after(async () => {
  await limpar(prisma);
  await prisma.$disconnect();
});

function dadosProposta(dia: string, extras: object = {}) {
  return {
    tipo: "PROPOSTA" as const,
    corretorId,
    equipeId,
    dataReferencia: paraDataCivil(dia),
    statusProposta: "AGUARDANDO" as const,
    imovelRef: "AP-500",
    ...extras,
  };
}

describe("proposta — round-trip", () => {
  it("persiste status e valorProposta, com valor monetário NULL", async () => {
    const criada = await prisma.lancamento.create({
      data: dadosProposta("2026-08-01", { valorProposta: "450000.00" }),
    });

    const relida = await prisma.lancamento.findUniqueOrThrow({ where: { id: criada.id } });
    assert.equal(relida.statusProposta, "AGUARDANDO");
    // Comparação por string: um double não representaria dinheiro exatamente.
    assert.equal(relida.valorProposta?.toFixed(2), "450000.00");
    assert.equal(relida.valor, null);
    assert.equal(relida.imovelRef, "AP-500");
  });

  it("troca de status AGUARDANDO → ACEITA → REJEITADA", async () => {
    const criada = await prisma.lancamento.create({ data: dadosProposta("2026-08-02") });

    const aceita = await prisma.lancamento.update({
      where: { id: criada.id },
      data: { statusProposta: "ACEITA" },
    });
    assert.equal(aceita.statusProposta, "ACEITA");

    const rejeitada = await prisma.lancamento.update({
      where: { id: criada.id },
      data: { statusProposta: "REJEITADA" },
    });
    assert.equal(rejeitada.statusProposta, "REJEITADA");
    // Trocar status não mexe em mais nada da linha.
    assert.equal(rejeitada.imovelRef, "AP-500");
    assert.equal(rejeitada.valor, null);
  });

  it("virar outro tipo zera os campos de proposta — como a action grava", async () => {
    const criada = await prisma.lancamento.create({
      data: dadosProposta("2026-08-03", { valorProposta: "100000.00" }),
    });

    const trocada = await prisma.lancamento.update({
      where: { id: criada.id },
      data: { tipo: "CAPTACAO_VENDA", statusProposta: null, valorProposta: null },
    });
    assert.equal(trocada.tipo, "CAPTACAO_VENDA");
    assert.equal(trocada.statusProposta, null);
    assert.equal(trocada.valorProposta, null);
  });

  it("legado sem imóvel continua aceito e editável em status", async () => {
    // Simula a proposta anterior à obrigatoriedade do imóvel: o CHECK não
    // exige imovel_ref de propósito (DEC-053).
    const legada = await prisma.lancamento.create({
      data: dadosProposta("2026-08-04", { imovelRef: null }),
    });
    assert.equal(legada.imovelRef, null);

    const aceita = await prisma.lancamento.update({
      where: { id: legada.id },
      data: { statusProposta: "ACEITA" },
    });
    assert.equal(aceita.statusProposta, "ACEITA");
    assert.equal(aceita.imovelRef, null);
  });
});

describe("proposta — CHECK do banco", () => {
  it("recusa proposta sem status", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: dadosProposta("2026-08-05", { statusProposta: null }),
        }),
      ehViolacaoDeCheck,
    );
  });

  it("recusa proposta com o `valor` monetário preenchido", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: dadosProposta("2026-08-06", { valor: "100000.00" }),
        }),
      ehViolacaoDeCheck,
    );
  });

  it("recusa valorProposta zero", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: dadosProposta("2026-08-07", { valorProposta: "0.00" }),
        }),
      ehViolacaoDeCheck,
    );
  });

  it("recusa statusProposta em tipo não-PROPOSTA", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: {
            tipo: "CAPTACAO_VENDA",
            corretorId,
            equipeId,
            dataReferencia: paraDataCivil("2026-08-08"),
            statusProposta: "AGUARDANDO",
          },
        }),
      ehViolacaoDeCheck,
    );
  });

  it("recusa valorProposta em tipo não-PROPOSTA", async () => {
    await assert.rejects(
      () =>
        prisma.lancamento.create({
          data: {
            tipo: "AVALIACAO_GOOGLE",
            corretorId,
            equipeId,
            dataReferencia: paraDataCivil("2026-08-09"),
            valorProposta: "100.00",
          },
        }),
      ehViolacaoDeCheck,
    );
  });
});

describe("saldo histórico — precisão (DEC-054)", () => {
  it("ciclo completo: nasce EXATO, vira MINIMO_CONHECIDO e volta, sem tocar no resto", async () => {
    // Tipo CAPTACAO_VENDA: livre de disputa com as outras suítes.
    await prisma.saldoHistorico.deleteMany({
      where: { tipo: "CAPTACAO_VENDA", descricao: { startsWith: PREFIXO } },
    });

    const criado = await prisma.saldoHistorico.create({
      data: {
        tipo: "CAPTACAO_VENDA",
        quantidade: 500,
        valorTotal: "800000000.00",
        precisao: "EXATO",
        dataCorte: paraDataCivil("2026-07-31"),
        descricao: nome("ciclo"),
      },
    });
    assert.equal(criado.precisao, "EXATO");

    const minimo = await prisma.saldoHistorico.update({
      where: { id: criado.id },
      data: { precisao: "MINIMO_CONHECIDO" },
    });
    assert.equal(minimo.precisao, "MINIMO_CONHECIDO");

    const deVolta = await prisma.saldoHistorico.update({
      where: { id: criado.id },
      data: { precisao: "EXATO" },
    });
    assert.equal(deVolta.precisao, "EXATO");

    // Quantidade, valor e data atravessaram as duas edições intactos.
    const relido = await prisma.saldoHistorico.findUniqueOrThrow({ where: { id: criado.id } });
    assert.equal(relido.quantidade, 500);
    assert.equal(relido.valorTotal.toFixed(2), "800000000.00");
    assert.equal(relido.dataCorte.toISOString().slice(0, 10), "2026-07-31");

    await prisma.saldoHistorico.delete({ where: { id: criado.id } });
  });

  it("aceita criação já como MINIMO_CONHECIDO", async () => {
    // Tipo PROPOSTA: o DDL de saldo aceita qualquer tipo do enum, e nenhuma
    // outra suíte cria saldo desse tipo.
    await prisma.saldoHistorico.deleteMany({
      where: { tipo: "PROPOSTA", descricao: { startsWith: PREFIXO } },
    });

    const criado = await prisma.saldoHistorico.create({
      data: {
        tipo: "PROPOSTA",
        quantidade: 30,
        valorTotal: "0.00",
        precisao: "MINIMO_CONHECIDO",
        dataCorte: paraDataCivil("2026-06-30"),
        descricao: nome("minimo direto"),
      },
    });
    assert.equal(criado.precisao, "MINIMO_CONHECIDO");

    await prisma.saldoHistorico.delete({ where: { id: criado.id } });
  });
});
