import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AreaEquipes, Equipe } from "@/lib/apresentacao-painel";
import { decidirAreaEquipes } from "@/components/painel/decidir-area-equipes";

/**
 * A decisão da área de equipes, sem renderizar nada.
 *
 * São quatro estados e duas saídas possíveis. O que se prova aqui é o
 * mapeamento — inclusive que `SEM_DADOS` **não** esconde as equipes, que é o
 * ponto onde seria fácil errar e apagar informação verdadeira.
 */

const EQUIPES: Equipe[] = [
  {
    nome: "Equipe Suellen",
    gerente: "Suellen Martins",
    totalCorretores: 7,
    rankings: {
      vendidos: [{ rotulo: "Rafael Nunes", valor: "3" }],
      vgv: [{ rotulo: "Rafael Nunes", valor: "R$ 4,2 mi" }],
      locados: [{ rotulo: "Rafael Nunes", valor: "2" }],
      capVenda: [{ rotulo: "Rafael Nunes", valor: "5" }],
      exclusivas: [{ rotulo: "Rafael Nunes", valor: "2" }],
      capLocacao: [{ rotulo: "Rafael Nunes", valor: "3" }],
      propostas: [{ rotulo: "Rafael Nunes", valor: "6" }],
      avaliacoes: [{ rotulo: "Rafael Nunes", valor: "3" }],
    },
  },
];

describe("área de equipes — há quadros a mostrar", () => {
  it("OK devolve os quadros com as mesmas equipes", () => {
    const area: AreaEquipes = { estado: "OK", equipes: EQUIPES };

    assert.deepEqual(decidirAreaEquipes(area), { tipo: "quadros", equipes: EQUIPES });
  });

  it("SEM_DADOS também devolve os quadros, com o elenco preservado", () => {
    // O mês não teve produção, mas quem está na equipe é conhecido: os valores
    // já chegaram como `—` e esconder os quadros apagaria dado verdadeiro.
    const area: AreaEquipes = { estado: "SEM_DADOS", equipes: EQUIPES };
    const decisao = decidirAreaEquipes(area);

    assert.equal(decisao.tipo, "quadros");
    if (decisao.tipo !== "quadros") return;
    assert.deepEqual(decisao.equipes, EQUIPES);
  });

  it("a lista não é recriada nem reordenada", () => {
    const area: AreaEquipes = { estado: "OK", equipes: EQUIPES };
    const decisao = decidirAreaEquipes(area);

    if (decisao.tipo !== "quadros") return;
    assert.equal(decisao.equipes, EQUIPES, "a mesma referência atravessa a decisão");
  });
});

describe("área de equipes — estados sem quadros", () => {
  it("INDISPONIVEL vira o título de leitura indisponível", () => {
    const area: AreaEquipes = { estado: "INDISPONIVEL" };

    assert.deepEqual(decidirAreaEquipes(area), {
      tipo: "estado",
      titulo: "Dados das equipes indisponíveis",
    });
  });

  it("CONFIGURACAO_INVALIDA vira o título de configuração", () => {
    const area: AreaEquipes = { estado: "CONFIGURACAO_INVALIDA" };

    assert.deepEqual(decidirAreaEquipes(area), {
      tipo: "estado",
      titulo: "Configuração de equipes inválida",
    });
  });

  it("os dois estados são distinguíveis na tela", () => {
    // Falha de leitura e cadastro errado pedem providências diferentes; sair
    // com o mesmo texto esconderia qual dos dois aconteceu.
    const indisponivel = decidirAreaEquipes({ estado: "INDISPONIVEL" });
    const configuracao = decidirAreaEquipes({ estado: "CONFIGURACAO_INVALIDA" });

    assert.notDeepEqual(indisponivel, configuracao);
  });

  it("nenhum dos dois carrega equipes", () => {
    for (const area of [
      { estado: "INDISPONIVEL" },
      { estado: "CONFIGURACAO_INVALIDA" },
    ] as AreaEquipes[]) {
      const decisao = decidirAreaEquipes(area);
      assert.equal(decisao.tipo, "estado");
      assert.equal("equipes" in decisao, false, "não se inventa equipe para preencher a grade");
    }
  });
});
