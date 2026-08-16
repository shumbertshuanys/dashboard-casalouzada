import type { CelebracaoTV, RespostaCelebracoes } from "@/lib/contrato-celebracao";

/**
 * A fila de celebrações da TV, como funções puras.
 *
 * Sem React, sem DOM, sem `fetch`: o componente cliente é uma casca fina em
 * volta disto, e a regra que decide **o que já foi comemorado** e **o que ainda
 * vai ser** é testável sem navegador nenhum. Mesmo arranjo de
 * `src/lib/retencao-painel.ts`, e pela mesma razão.
 *
 * O problema que este módulo existe para resolver: o endpoint devolve *todas* as
 * celebrações dos últimos cinco minutos, então a mesma celebração volta em poll
 * após poll. Guardar só o último id visto não basta — uma resposta `[A, B]`
 * seguida de `[A, B, C]` faria `A` e `B` voltarem à tela se a comparação fosse
 * com a última posição. O que separa o inédito do repetido é o **conjunto** de
 * ids já incorporados.
 *
 * Estado em memória, de propósito. Recarregar a página esquece o que já passou,
 * e uma celebração ainda dentro da janela pode ser comemorada de novo — decisão
 * aceita no MVP. Nada aqui escreve em `localStorage`, `sessionStorage`, cookie
 * ou servidor, e não existe campo `consumido` no banco.
 */

/** Quanto tempo cada celebração ocupa a TV, do início da entrada ao fim da saída. */
export const DURACAO_CELEBRACAO_MS = 10_000;

export type EstadoCelebracoes = {
  /** Ids já incorporados — a memória que impede o repeteco entre polls. */
  vistos: ReadonlySet<string>;
  /** As que ainda vão aparecer, da mais antiga para a mais nova. */
  fila: readonly CelebracaoTV[];
  /** A que está ocupando a TV agora, ou `null` quando o dashboard está livre. */
  atual: CelebracaoTV | null;
};

export const estadoInicialCelebracoes: EstadoCelebracoes = {
  vistos: new Set(),
  fila: [],
  atual: null,
};

/**
 * Promove o próximo da fila quando a TV está livre.
 *
 * Fica num lugar só porque as duas transições precisam dela: incorporar (chegou
 * algo e não havia nada em cena) e avançar (a de agora terminou).
 */
function promover(estado: EstadoCelebracoes): EstadoCelebracoes {
  if (estado.atual !== null || estado.fila.length === 0) return estado;
  const [proxima, ...resto] = estado.fila;
  return { ...estado, atual: proxima, fila: resto };
}

/**
 * Descarta da memória os ids que não podem mais voltar.
 *
 * `vistos` cresceria para sempre numa tela que fica meses ligada sem recarregar.
 * O corte é seguro porque a janela de frescor do servidor anda só para a frente:
 * uma celebração que saiu dela tem `criadoEm` fixo e nunca volta a ser
 * devolvida. Ficam os ids da resposta atual — que ainda podem repetir no próximo
 * poll — mais o que está na fila e em cena, que ainda não terminou de aparecer.
 */
function podar(
  vistos: ReadonlySet<string>,
  presentes: readonly string[],
  estado: EstadoCelebracoes,
): ReadonlySet<string> {
  const manter = new Set(presentes);
  for (const celebracao of estado.fila) manter.add(celebracao.id);
  if (estado.atual !== null) manter.add(estado.atual.id);

  const podados = new Set<string>();
  for (const id of manter) if (vistos.has(id)) podados.add(id);
  return podados;
}

/**
 * Incorpora uma resposta do endpoint.
 *
 * Três regras, e as três importam:
 *
 * 1. **Só entra o inédito.** O que já está em `vistos` é ignorado, tenha ele
 *    terminado de aparecer, esteja na fila ou esteja em cena agora.
 * 2. **O id é marcado ao entrar na fila, não ao terminar de aparecer.** Uma
 *    celebração leva dez segundos na tela e o poll acontece a cada cinco: se a
 *    marca esperasse o fim da animação, o poll do meio a enfileiraria de novo e
 *    ela apareceria duas vezes seguidas.
 * 3. **A ordem do servidor é preservada.** Ela já vem da mais antiga para a mais
 *    nova, que é a ordem em que os fatos aconteceram; reordenar aqui só criaria
 *    uma segunda opinião sobre o mesmo assunto.
 *
 * Nada é descartado por excesso: se três vendas forem cadastradas em sequência,
 * as três aparecem, uma depois da outra. Perder evento seria pior do que
 * demorar a mostrá-lo.
 */
export function incorporarCelebracoes(
  estado: EstadoCelebracoes,
  resposta: RespostaCelebracoes,
): EstadoCelebracoes {
  const ineditas = resposta.celebracoes.filter((celebracao) => !estado.vistos.has(celebracao.id));

  const comIneditas: EstadoCelebracoes =
    ineditas.length === 0
      ? estado
      : {
          ...estado,
          vistos: new Set([...estado.vistos, ...ineditas.map((c) => c.id)]),
          fila: [...estado.fila, ...ineditas],
        };

  const promovido = promover(comIneditas);

  return {
    ...promovido,
    vistos: podar(
      promovido.vistos,
      resposta.celebracoes.map((celebracao) => celebracao.id),
      promovido,
    ),
  };
}

/**
 * A celebração em cena terminou: sai ela, entra a próxima.
 *
 * O id **não** é esquecido — ele continua em `vistos`, senão o próximo poll a
 * traria de volta. Sem próxima, `atual` vira `null` e a TV volta ao dashboard,
 * que nunca foi desmontado.
 */
export function avancarCelebracao(estado: EstadoCelebracoes): EstadoCelebracoes {
  if (estado.atual === null) return estado;
  return promover({ ...estado, atual: null });
}
