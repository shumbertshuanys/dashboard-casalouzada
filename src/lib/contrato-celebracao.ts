import type { CelebracaoApresentavel } from "@/lib/celebracao";

/**
 * O contrato entre o servidor e a aba aberta na TV, para a celebração.
 *
 * Irmão de `src/lib/contrato-atualizacao-painel.ts`, e pelo mesmo motivo: o
 * payload atravessa a rede, então a forma dele precisa morar num lugar que os
 * dois lados possam nomear. Não é `server-only` — o C3 vai importar estes tipos
 * no cliente. `CelebracaoApresentavel` entra só como `import type`, que o
 * compilador apaga: nenhuma linha de `@/lib/celebracao`, que é `server-only`,
 * chega ao bundle do navegador por aqui.
 *
 * **A superfície é menor que a do núcleo, de propósito.** `lancamentoId` fica de
 * fora: o cliente não tem uso para o identificador do fato comercial, e o que
 * não atravessa não vaza nem precisa ser mantido compatível. O que sobra é o que
 * a TV desenha — quando foi, quanto foi, e quem vendeu.
 */

export type ParticipanteCelebracaoTV = {
  ordem: number;
  corretorNome: string;
  equipeNome: string;
};

export type CelebracaoTV = {
  id: string;
  /**
   * ISO-8601 em UTC, como `Date#toISOString` produz.
   *
   * `Date` não sobrevive a `JSON.stringify` como `Date` — vira string de
   * qualquer jeito. Convertendo aqui, a string é sempre a mesma forma
   * determinística, e não o que o serializador resolver fazer.
   */
  criadoEm: string;
  /** String decimal canônica (`"900000.00"`), nunca `number`. */
  valor: string | null;
  participantes: ParticipanteCelebracaoTV[];
};

export type RespostaCelebracoes = {
  celebracoes: CelebracaoTV[];
};

/**
 * Recorta a leitura do núcleo para o que viaja.
 *
 * Só projeta: não ordena, não filtra, não corta e não recalcula nada. A janela
 * de frescor, o teto, a ordem de exibição e a exigência de VENDA com
 * participação são todas do núcleo (C1), e duplicar qualquer uma delas aqui
 * criaria uma segunda versão da regra para divergir da primeira.
 */
export function paraRespostaCelebracoes(
  celebracoes: readonly CelebracaoApresentavel[],
): RespostaCelebracoes {
  return {
    celebracoes: celebracoes.map((celebracao) => ({
      id: celebracao.id,
      criadoEm: celebracao.criadoEm.toISOString(),
      valor: celebracao.valor,
      participantes: celebracao.participantes.map((participante) => ({
        ordem: participante.ordem,
        corretorNome: participante.corretorNome,
        equipeNome: participante.equipeNome,
      })),
    })),
  };
}
