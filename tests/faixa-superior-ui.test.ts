import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A fiação da faixa superior com a rotação paginada (DEC-056).
 *
 * **Por que estrutural.** `FaixaSuperior` carrega `"use client"` e importa um
 * módulo CSS; o runner do Node não parseia CSS e o projeto não tem jsdom nem
 * testing-library — o mesmo obstáculo já documentado em
 * `tests/celebracao-ui.test.ts`. Tudo o que é lógica de verdade mora em
 * `src/components/painel/rotacao-faixa.ts` e é provado a sério em
 * `tests/destaques-operacionais.test.ts`.
 *
 * O que sobra para cá são as decisões que só existem na casca: qual estado
 * inicial o componente usa, de que o timer depende e de que ele **não** depende.
 * São asserções frágeis de propósito reconhecido — mexer numa delas quebra o
 * teste e pede revisão em vez de passar despercebido.
 */

/**
 * A fonte, com as quebras normalizadas.
 *
 * O repositório guarda LF e o checkout no Windows entrega CRLF: sem normalizar,
 * uma asserção estrutural passaria numa máquina e falharia na outra por causa de
 * um `\r` invisível.
 */
const lerFonte = (caminho: string) => readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");

/** Asserções de **ausência** rodam sobre isto: os comentários falam do que não se faz. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const FAIXA_SUPERIOR = "src/components/painel/faixa-superior.tsx";
const FAIXA_OPERACIONAL = "src/components/painel/faixa-operacional.tsx";

describe("faixa superior — rotação paginada", () => {
  const fonte = lerFonte(FAIXA_SUPERIOR);
  const codigo = semComentarios(fonte);

  it("começa na Tela A, pelo estado inicial do módulo de rotação", () => {
    assert.match(fonte, /useState\(ROTACAO_INICIAL\)/);
  });

  it("avança tela e páginas juntas, pela função pura", () => {
    assert.match(fonte, /setRotacao\(avancarRotacao\)/);
  });

  it("o timer depende só de qual tela está no ar", () => {
    const dependencias = [...codigo.matchAll(/\}, (\[[^\]]*\])\);/g)].map((achado) => achado[1]);

    assert.deepEqual(dependencias, ["[rotacao.tela]"], "há um efeito, e ele observa só a tela");
  });

  it("o refresh dos dados não reinicia o ciclo", () => {
    // `operacionais` é prop e nada mais: se entrasse numa lista de dependências
    // ou num `setRotacao`, cada leitura de 60 s remontaria o timer e a Tela B
    // apareceria em intervalos irregulares.
    assert.equal(/\}, \[[^\]]*operacionais/.test(codigo), false);
    assert.equal(/setRotacao\([^)]*operacionais/.test(codigo), false);
  });

  it("entrega à Tela B só a janela da página corrente", () => {
    assert.match(fonte, /propostas=\{janelaOperacional\(operacionais\.propostas, rotacao\.paginaPropostas\)\}/);
    assert.match(fonte, /reservas=\{janelaOperacional\(operacionais\.reservas, rotacao\.paginaReservas\)\}/);
  });

  it("não filtra status nem ordena — isso é do núcleo (DEC-013)", () => {
    for (const proibido of ["AGUARDANDO", "ATIVA", ".sort(", ".filter("]) {
      assert.equal(codigo.includes(proibido), false, `a faixa não faz ${proibido}`);
    }
  });
});

describe("Tela B — o que ela desenha continua sendo lista pronta", () => {
  const fonte = lerFonte(FAIXA_OPERACIONAL);
  const codigo = semComentarios(fonte);

  it("os textos de lista vazia e de indisponível seguem os mesmos", () => {
    assert.match(fonte, /const VAZIO_PROPOSTAS = "Nenhuma proposta em andamento";/);
    assert.match(fonte, /const VAZIO_RESERVAS = "Nenhuma reserva ativa";/);
    assert.match(fonte, /const INDISPONIVEL = "Dados indisponíveis";/);
  });

  it("não pagina nem corta: recebe a janela já recortada", () => {
    for (const proibido of [".slice(", "paginaCircular", "ITENS_POR_PAGINA"]) {
      assert.equal(codigo.includes(proibido), false, `a coluna não faz ${proibido}`);
    }
  });
});
