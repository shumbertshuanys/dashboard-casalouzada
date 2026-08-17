import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { deDataCivil } from "@/lib/datas";
import {
  ehCompetenciaDuplicada,
  ehIdVgvHistoricoValido,
  interpretarCompetencia,
  MENSAGEM_COMPETENCIA_DUPLICADA,
  validarVgvHistoricoMensal,
} from "@/lib/validacao/vgv-historico-mensal";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarPrismaTeste } from "../helpers/banco-teste";

/**
 * O Admin de VGV histórico mensal contra o PostgreSQL **local**.
 *
 * Como nas outras suítes administrativas, as Server Actions não são importáveis
 * neste harness — `"use server"` puxa o runtime de requisição. O que se prova
 * aqui é o que dá para provar de verdade: a regra de domínio aplicada contra o
 * banco real, a unicidade que é dele, o isolamento em relação às tabelas
 * comerciais, e — por leitura da fonte — que nenhuma action escreve antes da
 * guarda administrativa.
 *
 * A tabela é exclusiva desta suíte dentro de `tests/integracao/`, então a
 * limpeza global é segura aqui.
 */

const prisma = criarPrismaTeste();

/** Instante que cai em 15 de agosto de 2026 em São Paulo. */
const AGORA = new Date("2026-08-15T15:00:00.000Z");

const RAIZ = "src/app/admin/vgv-historico";
const FONTE_ACOES = `${RAIZ}/acoes.ts`;

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

const lerFonte = (caminho: string) => readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");

async function limpar(cliente: PrismaClient): Promise<void> {
  await cliente.vgvHistoricoMensal.deleteMany({});
}

/** As contagens das tabelas que este módulo nunca pode tocar. */
async function contagensComerciais() {
  return {
    lancamentos: await prisma.lancamento.count(),
    participacoes: await prisma.participacaoVenda.count(),
    saldos: await prisma.saldoHistorico.count(),
  };
}

before(async () => {
  await limpar(prisma);
});

after(async () => {
  await limpar(prisma);
  const restantes = await prisma.vgvHistoricoMensal.count();
  console.log(`  vgv historico mensal restantes: ${restantes}`);
  await prisma.$disconnect();
});

describe("cadastro de competência", () => {
  it("1. competência passada válida é gravada", async () => {
    await limpar(prisma);

    const validado = validarVgvHistoricoMensal(
      formulario({ competencia: "2026-07", valorTotal: "8.000.000,00" }),
      AGORA,
    );
    assert.equal(validado.ok, true);
    if (!validado.ok) return;

    const criado = await prisma.vgvHistoricoMensal.create({
      data: validado.dados,
      select: { id: true, competencia: true, valorTotal: true, observacao: true },
    });

    assert.equal(deDataCivil(criado.competencia), "2026-07-01");
    assert.equal(criado.valorTotal.toFixed(2), "8000000.00");
    assert.equal(criado.observacao, null);
  });

  it("2. competência do mês corrente é rejeitada antes do banco", async () => {
    const validado = validarVgvHistoricoMensal(
      formulario({ competencia: "2026-08", valorTotal: "1.000,00" }),
      AGORA,
    );

    assert.equal(validado.ok, false);
    if (validado.ok) return;
    assert.match(validado.erros.competencia ?? "", /encerrad/i);
  });

  it("3. competência duplicada é recusada pelo banco e reconhecida", async () => {
    await limpar(prisma);
    const competencia = interpretarCompetencia("2026-06") as Date;

    await prisma.vgvHistoricoMensal.create({
      data: { competencia, valorTotal: "7000000.00" },
    });

    // Sem SELECT prévio: a unicidade é do índice, e entre a consulta e o insert
    // caberia outra submissão.
    await assert.rejects(
      () => prisma.vgvHistoricoMensal.create({ data: { competencia, valorTotal: "1.00" } }),
      (erro: unknown) => {
        assert.equal(ehCompetenciaDuplicada(erro), true, "o P2002 da competência é reconhecido");
        return true;
      },
    );

    assert.equal(await prisma.vgvHistoricoMensal.count(), 1, "a segunda tentativa não gravou");
    assert.match(MENSAGEM_COMPETENCIA_DUPLICADA, /compet/i);
  });

  it("4. valor inválido é rejeitado antes do banco", async () => {
    for (const ruim of ["", "0", "-1", "abc"]) {
      const validado = validarVgvHistoricoMensal(
        formulario({ competencia: "2026-05", valorTotal: ruim }),
        AGORA,
      );
      assert.equal(validado.ok, false, ruim);
    }
  });
});

describe("edição", () => {
  it("5/7. valor e observação mudam", async () => {
    await limpar(prisma);
    const criado = await prisma.vgvHistoricoMensal.create({
      data: { competencia: interpretarCompetencia("2026-04") as Date, valorTotal: "5000000.00" },
      select: { id: true, competencia: true },
    });

    const validado = validarVgvHistoricoMensal(
      formulario({ valorTotal: "5.500.000,00", observacao: "  relatório revisado  " }),
      AGORA,
      criado.competencia,
    );
    assert.equal(validado.ok, true);
    if (!validado.ok) return;

    const atualizado = await prisma.vgvHistoricoMensal.update({
      where: { id: criado.id },
      data: { valorTotal: validado.dados.valorTotal, observacao: validado.dados.observacao },
      select: { competencia: true, valorTotal: true, observacao: true },
    });

    assert.equal(atualizado.valorTotal.toFixed(2), "5500000.00");
    assert.equal(atualizado.observacao, "relatório revisado");
  });

  it("6. a competência é imutável: o formulário não a troca", async () => {
    await limpar(prisma);
    const criado = await prisma.vgvHistoricoMensal.create({
      data: { competencia: interpretarCompetencia("2026-03") as Date, valorTotal: "4000000.00" },
      select: { id: true, competencia: true },
    });

    // O formulário tenta enviar outro mês; a competência fixa do registro vence.
    const validado = validarVgvHistoricoMensal(
      formulario({ competencia: "2026-01", valorTotal: "4.000.000,00" }),
      AGORA,
      criado.competencia,
    );
    assert.equal(validado.ok, true);
    if (!validado.ok) return;
    assert.equal(deDataCivil(validado.dados.competencia), "2026-03-01");

    const relido = await prisma.vgvHistoricoMensal.findUniqueOrThrow({
      where: { id: criado.id },
      select: { competencia: true },
    });
    assert.equal(deDataCivil(relido.competencia), "2026-03-01");
  });

  it("a action de edição não escreve `competencia`", () => {
    const fonte = lerFonte(FONTE_ACOES);
    const editar = fonte.slice(fonte.indexOf("export async function editarVgvHistorico("));
    const update = editar.slice(editar.indexOf("update({"), editar.indexOf("revalidatePath"));

    assert.ok(update.length > 0, "a edição faz update");
    assert.equal(
      /competencia\s*:/.test(update),
      false,
      "a competência de um registro cadastrado não muda",
    );
  });
});

describe("exclusão", () => {
  it("8. remove a linha e nada mais", async () => {
    await limpar(prisma);
    const antes = await contagensComerciais();

    const criado = await prisma.vgvHistoricoMensal.create({
      data: { competencia: interpretarCompetencia("2026-02") as Date, valorTotal: "3000000.00" },
      select: { id: true },
    });
    await prisma.vgvHistoricoMensal.delete({ where: { id: criado.id } });

    assert.equal(await prisma.vgvHistoricoMensal.count(), 0);
    assert.deepEqual(await contagensComerciais(), antes);
  });

  it("9. id inválido não chega ao banco", () => {
    for (const ruim of ["", "não-é-uuid", "123", null, undefined]) {
      assert.equal(ehIdVgvHistoricoValido(ruim), false, JSON.stringify(ruim));
    }
    assert.equal(ehIdVgvHistoricoValido("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
  });
});

describe("isolamento", () => {
  it("10. criar, editar e excluir não mexem em lançamento, participação ou saldo", async () => {
    await limpar(prisma);
    const antes = await contagensComerciais();

    const criado = await prisma.vgvHistoricoMensal.create({
      data: { competencia: interpretarCompetencia("2026-01") as Date, valorTotal: "2000000.00" },
      select: { id: true },
    });
    assert.deepEqual(await contagensComerciais(), antes, "após criar");

    await prisma.vgvHistoricoMensal.update({
      where: { id: criado.id },
      data: { valorTotal: "2100000.00" },
    });
    assert.deepEqual(await contagensComerciais(), antes, "após editar");

    await prisma.vgvHistoricoMensal.delete({ where: { id: criado.id } });
    assert.deepEqual(await contagensComerciais(), antes, "após excluir");
  });

  it("as actions não nomeiam tabela comercial nenhuma", () => {
    const fonte = lerFonte(FONTE_ACOES);
    for (const proibido of [
      "prisma.lancamento",
      "prisma.participacaoVenda",
      "prisma.saldoHistorico",
      "prisma.corretor",
      "prisma.equipe",
    ]) {
      assert.equal(fonte.includes(proibido), false, proibido);
    }
  });
});

describe("listagem", () => {
  it("11. a ordem é por competência decrescente", async () => {
    await limpar(prisma);
    for (const mes of ["2026-01", "2026-07", "2026-04"]) {
      await prisma.vgvHistoricoMensal.create({
        data: { competencia: interpretarCompetencia(mes) as Date, valorTotal: "1000000.00" },
      });
    }

    const lista = await prisma.vgvHistoricoMensal.findMany({
      orderBy: { competencia: "desc" },
      select: { competencia: true },
    });

    assert.deepEqual(
      lista.map((linha) => deDataCivil(linha.competencia)),
      ["2026-07-01", "2026-04-01", "2026-01-01"],
    );
  });

  it("a página da lista pede a mesma ordem", () => {
    const fonte = lerFonte(`${RAIZ}/page.tsx`);
    assert.match(fonte, /orderBy:\s*\{\s*competencia:\s*"desc"\s*\}/);
  });
});

describe("guarda administrativa", () => {
  it("12. fora de um contexto autorizado a guarda lança", async () => {
    await assert.rejects(
      () => exigirAdministradorAtivo(),
      /request scope|Acesso administrativo negado/,
      "a guarda nunca devolve administrador sem sessão",
    );
  });

  it("12b. a guarda é a primeira linha de cada action", () => {
    const fonte = lerFonte(FONTE_ACOES);

    for (const acao of [
      "criarVgvHistorico",
      "editarVgvHistorico",
      "excluirVgvHistorico",
    ]) {
      const corpo = fonte.slice(fonte.indexOf(`export async function ${acao}(`));
      const guarda = corpo.indexOf("await exigirAdministradorAtivo();");
      const escrita = corpo.search(/prisma\.vgvHistoricoMensal\./);

      assert.ok(guarda > 0, `${acao}: a guarda está no corpo`);
      assert.ok(guarda < escrita, `${acao}: nada toca o banco antes da guarda`);
    }
  });

  it("12c. as páginas também exigem administrador", () => {
    for (const pagina of [
      `${RAIZ}/page.tsx`,
      `${RAIZ}/novo/page.tsx`,
      `${RAIZ}/[id]/editar/page.tsx`,
    ]) {
      assert.match(lerFonte(pagina), /await exigirAdministradorAtivo\(\);/, pagina);
    }
  });

  it("13. nenhuma rota pública nova foi criada", () => {
    // Tudo vive sob `/admin`, que o layout já protege — e nada foi acrescentado
    // fora dele.
    for (const arquivo of [
      `${RAIZ}/page.tsx`,
      `${RAIZ}/acoes.ts`,
      `${RAIZ}/formulario.tsx`,
      `${RAIZ}/novo/page.tsx`,
      `${RAIZ}/[id]/editar/page.tsx`,
    ]) {
      assert.ok(existsSync(arquivo), `${arquivo} existe`);
      assert.ok(arquivo.startsWith("src/app/admin/"), `${arquivo} está sob /admin`);
    }

    assert.equal(existsSync("src/app/vgv-historico"), false, "nada na raiz pública");
  });
});
