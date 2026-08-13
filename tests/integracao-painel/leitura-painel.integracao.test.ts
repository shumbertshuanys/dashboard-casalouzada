import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { criarPrismaTeste } from "../helpers/banco-teste";
import { paraDataCivil } from "@/lib/datas";
import { ehLeituraPainel, type LeituraPainel } from "@/lib/contrato-atualizacao-painel";
import { lerPainel } from "@/lib/leitura-painel";
import { comporApresentacao, estadoInicial } from "@/lib/retencao-painel";

/**
 * A leitura única da F3.6 contra o PostgreSQL **local**.
 *
 * O que se prova é o empacotamento: `lerPainel` carimba a hora, fatia o resultado
 * nos três blocos e devolve algo que o validador do cliente aceita e que
 * sobrevive à ida e volta por JSON — o caminho real entre o servidor e a aba
 * aberta na TV.
 *
 * **Nada aqui depende do conteúdo do banco.** É deliberado: esta suíte divide o
 * diretório — e portanto o runner — com `painel.integracao.test.ts`, que cria e
 * apaga fixtures. Uma asserção sobre valores, ou uma exigência de banco em
 * repouso, ficaria à mercê de quando a vizinha estivesse no meio do seu ciclo.
 * Quanto dá cada número já é provado lá e nas suítes unitárias; o que falta
 * provar é a embalagem, e a embalagem não muda com as linhas da tabela.
 *
 * Pelo mesmo motivo não há um segundo `obterMetricasPainel` para comparar valor a
 * valor: duas leituras separadas poderiam legitimamente discordar. A fidelidade é
 * provada por dentro — a apresentação recomposta a partir da leitura é
 * exatamente a que a leitura carrega.
 */

const prisma = criarPrismaTeste();

/** Instante fixo: 15 de agosto de 2026, 14:32 em São Paulo. */
const AGORA = new Date("2026-08-15T17:32:00.000Z");

let leitura: LeituraPainel;

before(async () => {
  leitura = await lerPainel(prisma, AGORA);
});

after(async () => {
  await prisma.$disconnect();
});

describe("banco de teste", () => {
  it("continua em casalouzada_test", async () => {
    const [linha] = await prisma.$queryRaw<
      { db: string; usuario: string }[]
    >`SELECT current_database() AS db, current_user AS usuario`;
    assert.equal(linha.db, "casalouzada_test");
    assert.equal(linha.usuario, "casalouzada_test");
  });
});

describe("carimbo da leitura", () => {
  it("a competência é o primeiro dia do mês civil corrente", () => {
    assert.equal(leitura.competencia, "2026-08-01");
    // E é uma data civil de verdade, não só uma string que parece uma.
    assert.equal(paraDataCivil(leitura.competencia).toISOString(), "2026-08-01T00:00:00.000Z");
  });

  it("lidoEmMs é exatamente o instante recebido", () => {
    // Sem relógio próprio: quem chama congela o instante e ele desce inteiro.
    assert.equal(leitura.lidoEmMs, AGORA.getTime());
  });

  it("a hora é a do escritório, não a do servidor", () => {
    // 17:32Z é 14:32 em São Paulo.
    assert.equal(leitura.horaLeitura, "14:32");
  });

  it("o período sai do mesmo instante das métricas", () => {
    assert.equal(leitura.periodo, "agosto de 2026");
  });
});

describe("estrutura da leitura", () => {
  it("traz as oito métricas do ciclo, sem repetir chave", () => {
    assert.equal(leitura.metricas.length, 8);
    assert.equal(new Set(leitura.metricas.map((metrica) => metrica.chave)).size, 8);
  });

  it("traz os três blocos, cada um com o próprio estado de leitura", () => {
    assert.deepEqual(Object.keys(leitura.blocos).sort(), ["acumulados", "equipes", "periodos"]);

    for (const bloco of Object.values(leitura.blocos)) {
      assert.ok(
        bloco.estadoLeitura === "OK" || bloco.estadoLeitura === "INDISPONIVEL",
        "cada bloco declara o próprio estado de leitura",
      );
    }
  });

  it("as quantidades da apresentação estão completas", () => {
    assert.equal(leitura.blocos.periodos.vgvPeriodos.length, 3);
    assert.equal(leitura.blocos.periodos.quadroMensal.linhas.length, 7);
    assert.equal(leitura.blocos.acumulados.bigNumbers.length, 3);
  });

  it("os rótulos são os do painel", () => {
    assert.deepEqual(
      leitura.blocos.periodos.vgvPeriodos.map((item) => item.rotulo),
      ["Anual", "Trimestral", "Mensal"],
    );
    assert.deepEqual(
      leitura.blocos.acumulados.bigNumbers.map((item) => item.rotulo),
      ["Imóveis vendidos", "VGV acumulado", "Avaliações Google"],
    );
  });
});

describe("o contrato aceita a própria leitura", () => {
  it("ehLeituraPainel reconhece o que lerPainel produz", () => {
    // O validador do cliente e o produtor do servidor precisam concordar. Se
    // divergirem, toda atualização seria descartada em silêncio e a TV
    // congelaria na primeira leitura sem ninguém perceber.
    assert.equal(ehLeituraPainel(leitura), true);
  });

  it("sobrevive à ida e volta por JSON", () => {
    const pelaRede = JSON.parse(JSON.stringify(leitura));

    assert.deepEqual(pelaRede, leitura, "nada se perde na serialização");
    assert.equal(ehLeituraPainel(pelaRede), true);
  });

  it("a coerência entre estado de leitura e conteúdo se sustenta", () => {
    // `ehLeituraPainel` já cobre isto, mas vale explicitar num payload real: um
    // bloco caído não traz número, e um bloco bom não traz `—`.
    const { periodos, acumulados, equipes } = leitura.blocos;

    if (periodos.estadoLeitura === "INDISPONIVEL") {
      assert.equal(periodos.quadroMensal.estado, "INDISPONIVEL");
      assert.ok(periodos.vgvPeriodos.every((item) => item.estado === "INDISPONIVEL"));
    } else {
      assert.notEqual(periodos.quadroMensal.estado, "INDISPONIVEL");
    }

    if (acumulados.estadoLeitura === "INDISPONIVEL") {
      assert.ok(acumulados.bigNumbers.every((item) => item.estado === "INDISPONIVEL"));
    } else {
      assert.ok(acumulados.bigNumbers.every((item) => item.estado !== "INDISPONIVEL"));
    }

    if (equipes.estadoLeitura === "INDISPONIVEL") {
      assert.equal(equipes.area.estado, "INDISPONIVEL");
    } else {
      assert.notEqual(equipes.area.estado, "INDISPONIVEL");
    }
  });
});

describe("a leitura recompõe exatamente a apresentação que carrega", () => {
  it("comporApresentacao devolve os mesmos campos display-ready", () => {
    // O caminho completo da F3.6: leitura → estado → apresentação. Se a
    // recomposição perdesse ou trocasse um campo, a primeira atualização
    // redesenharia a tela com outra coisa.
    assert.deepEqual(comporApresentacao(estadoInicial(leitura)), {
      periodo: leitura.periodo,
      bigNumbers: leitura.blocos.acumulados.bigNumbers,
      vgvPeriodos: leitura.blocos.periodos.vgvPeriodos,
      quadroMensal: leitura.blocos.periodos.quadroMensal,
      metricas: leitura.metricas,
      equipes: leitura.blocos.equipes.area,
    });
  });

  it("e sobrevive à serialização no meio do caminho", () => {
    const pelaRede = JSON.parse(JSON.stringify(leitura)) as LeituraPainel;

    assert.deepEqual(
      comporApresentacao(estadoInicial(pelaRede)),
      comporApresentacao(estadoInicial(leitura)),
    );
  });
});
