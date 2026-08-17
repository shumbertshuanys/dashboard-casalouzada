import type { ListaOperacional } from "@/lib/apresentacao-painel";

/**
 * A regra de rotação da faixa superior (DEC-056), sem JSX e sem CSS.
 *
 * Mora num módulo próprio para poder ser testada: o componente importa o módulo
 * de estilos, e o runner do Node não sabe parsear CSS. Aqui não há React, DOM
 * nem timer — só o contrato de que existem **duas** telas, qual sucede qual e
 * qual janela de cada lista operacional está visível agora.
 *
 * A divisão de trabalho com o núcleo é a de sempre (DEC-013): quem entra em cada
 * lista e em que ordem é regra de produto e mora em `src/lib/metricas.ts`;
 * **quantos cabem por vez** é regra de tela e mora aqui. Nada neste arquivo
 * conhece status, data ou valor.
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

/**
 * Quantos itens de cada lista cabem numa aparição da Tela B.
 *
 * É o **único** lugar onde este número existe. O núcleo já não corta em três, e
 * o contrato de rede também não: cortar antes daqui apagaria candidatos que a
 * próxima aparição ainda vai mostrar.
 */
export const ITENS_POR_PAGINA = 3;

/**
 * A janela de até `tamanho` itens correspondente a `pagina`, em ciclo.
 *
 * A última página **não** se completa com o começo da lista: repetir ali faria a
 * mesma proposta aparecer duas vezes na mesma tela, como se fossem duas. Com
 * sete itens as voltas são 3/3/1, e não 3/3/3.
 *
 * O índice é normalizado pelo número de páginas, e não apenas usado: a lista
 * muda de tamanho entre uma aparição e outra, e um índice guardado de quando ela
 * era maior produziria uma janela vazia para sempre — a parede ficaria sem nada
 * a mostrar tendo o que mostrar.
 *
 * Não mexe na lista recebida.
 */
export function paginaCircular<T>(
  itens: readonly T[],
  pagina: number,
  tamanho: number = ITENS_POR_PAGINA,
): T[] {
  if (itens.length === 0 || tamanho <= 0) return [];

  const paginas = Math.ceil(itens.length / tamanho);
  const indice = ((Math.trunc(pagina) % paginas) + paginas) % paginas;
  const inicio = indice * tamanho;

  return itens.slice(inicio, inicio + tamanho);
}

/**
 * A mesma janela, aplicada a uma lista da Tela B inteira.
 *
 * Paginar não inventa estado: `INDISPONIVEL` continua indisponível — a leitura
 * não aconteceu, e nenhuma página muda isso —, e `OK` sem itens continua `OK`
 * sem itens, que é a frase "não há nada em aberto", nunca um `0` (DEC-014).
 */
export function janelaOperacional(lista: ListaOperacional, pagina: number): ListaOperacional {
  if (lista.estado !== "OK") return lista;

  return { estado: "OK", itens: paginaCircular(lista.itens, pagina) };
}

/**
 * O que a faixa precisa lembrar entre um tique e o outro.
 *
 * As duas páginas são independentes porque as duas listas têm tamanhos
 * diferentes: sete propostas fecham a volta em três aparições, cinco reservas em
 * duas, e cada uma anda no próprio ciclo.
 */
export type EstadoRotacao = {
  tela: Tela;
  paginaPropostas: number;
  paginaReservas: number;
};

/**
 * Começa na Tela A, e **antes** da primeira página.
 *
 * `-1` não é página nenhuma: é "a Tela B ainda não apareceu". Quem a cria é a
 * primeira entrada em B, que a leva a `0`. Guardar `0` aqui obrigaria a primeira
 * entrada a ser um caso especial — e caso especial em regra de rotação é
 * exatamente o que faz a segunda volta divergir da primeira.
 */
export const ROTACAO_INICIAL: EstadoRotacao = {
  tela: "A",
  paginaPropostas: -1,
  paginaReservas: -1,
};

/**
 * O tique da rotação: troca de tela e, quando a Tela B entra, vira a página.
 *
 * As páginas andam na **entrada** em B, nunca na saída e nunca por chegada de
 * dados novos. Dentro dos 20 s da Tela B nada se mexe: quem passa pelo
 * escritório precisa conseguir ler as três linhas até o fim.
 */
export function avancarRotacao(estado: EstadoRotacao): EstadoRotacao {
  const tela = proximaTela(estado.tela);

  if (tela !== "B") return { ...estado, tela };

  return {
    tela,
    paginaPropostas: estado.paginaPropostas + 1,
    paginaReservas: estado.paginaReservas + 1,
  };
}
