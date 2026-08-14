/**
 * A regra de rotação da faixa superior (DEC-056), sem JSX e sem CSS.
 *
 * Mora num módulo próprio para poder ser testada: o componente importa o módulo
 * de estilos, e o runner do Node não sabe parsear CSS. Aqui não há React, DOM
 * nem timer — só o contrato de que existem **duas** telas e qual sucede qual.
 */

/** 20s por tela. Uma volta completa leva 40s. */
export const DURACAO_TELA = 20_000;

/** Igual à transição de opacidade do CSS. Acontece dentro dos 20s, não depois. */
export const DURACAO_FADE = 450;

/** As duas telas, e só elas: não existe terceira. */
export const TELAS = ["A", "B"] as const;

export type Tela = (typeof TELAS)[number];

/**
 * Qual tela vem depois. Total e cíclica: de A vem B, de B vem A.
 *
 * Escrita como função, e não como índice num array, para não haver estado
 * intermediário possível — qualquer entrada válida produz uma saída válida.
 */
export function proximaTela(atual: Tela): Tela {
  return atual === "A" ? "B" : "A";
}
