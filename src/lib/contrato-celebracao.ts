import type { CelebracaoApresentavel } from "@/lib/celebracao";
import { CASAS_DECIMAIS, MAX_DIGITOS_INTEIROS } from "@/lib/dinheiro";

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

/* ------------------------------------------------------------------ */
/* Validação do que chega pela rede                                    */
/* ------------------------------------------------------------------ */

/**
 * A outra ponta do contrato: o que o cliente aceita como resposta.
 *
 * A validação é manual e verbosa de propósito, como em
 * `contrato-atualizacao-painel.ts`: um schema de terceiros seria dependência
 * nova, e o que se verifica aqui não é forma genérica — é que **cada campo pode
 * ser desenhado numa TV** sem virar `undefined` no meio de uma animação de dez
 * segundos que ninguém pode interromper.
 *
 * O tipo vindo de `resposta.json()` é `any`. Sem esta porta, um payload
 * malformado atravessaria a tipagem intacto e só apareceria como `R$ NaN` na
 * parede do escritório.
 */

/** `2026-08-16T14:05:09.123Z` — exatamente o que `toISOString` produz. */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * A string decimal canônica de `src/lib/dinheiro.ts`, com os limites de
 * `Decimal(14, 2)`. Os dois números vêm de lá, não de literais repetidos aqui:
 * é o mesmo contrato de dinheiro, e ele tem um dono só.
 */
const DECIMAL_CANONICO = new RegExp(
  `^(0|[1-9]\\d{0,${MAX_DIGITOS_INTEIROS - 1}})\\.\\d{${CASAS_DECIMAIS}}$`,
);

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehTextoNaoVazio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

/**
 * Forma **e** significado: o shape sozinho aceitaria `2026-13-45T99:99:99.999Z`.
 * `Date.parse` é quem recusa o mês 13, e é dele que a TV dependeria para
 * ordenar ou exibir qualquer coisa derivada do instante.
 */
function ehInstanteIso(valor: unknown): valor is string {
  return (
    typeof valor === "string" && INSTANTE_ISO.test(valor) && Number.isFinite(Date.parse(valor))
  );
}

/** `null` é ausência legítima de valor; string tem de ser canônica. */
function ehValorDaVenda(valor: unknown): valor is string | null {
  if (valor === null) return true;
  return typeof valor === "string" && DECIMAL_CANONICO.test(valor);
}

function ehParticipante(valor: unknown): valor is ParticipanteCelebracaoTV {
  if (!ehObjeto(valor)) return false;
  // `ordem` começa em 1 e é inteira: é a posição na venda, não um índice.
  if (typeof valor.ordem !== "number" || !Number.isInteger(valor.ordem) || valor.ordem < 1) {
    return false;
  }
  return ehTextoNaoVazio(valor.corretorNome) && ehTextoNaoVazio(valor.equipeNome);
}

function ehCelebracao(valor: unknown): valor is CelebracaoTV {
  if (!ehObjeto(valor)) return false;
  if (!ehTextoNaoVazio(valor.id)) return false;
  if (!ehInstanteIso(valor.criadoEm)) return false;
  if (!ehValorDaVenda(valor.valor)) return false;

  // Elenco vazio não é celebração exibível: o servidor só publica celebração
  // cujo lançamento tem participação, e uma tela com "É VENDA!" e ninguém
  // embaixo seria pior do que não comemorar.
  if (!Array.isArray(valor.participantes) || valor.participantes.length === 0) return false;
  return valor.participantes.every(ehParticipante);
}

/**
 * Aceita, ou não, o corpo devolvido pelo endpoint da TV.
 *
 * Lista vazia é resposta **válida**: significa "nada a comemorar agora", que é o
 * estado normal na maior parte do dia.
 *
 * `id` repetido derruba o payload inteiro. O banco não tem como produzir isso —
 * é chave primária —, mas o cliente usa o `id` para saber o que já comemorou e
 * como chave de lista no React; duas linhas com o mesmo id fariam uma
 * celebração sumir da fila em silêncio. Mesma razão pela qual o contrato do
 * painel recusa `chave` repetida nas métricas.
 */
export function ehRespostaCelebracoes(valor: unknown): valor is RespostaCelebracoes {
  if (!ehObjeto(valor)) return false;
  if (!Array.isArray(valor.celebracoes)) return false;
  if (!valor.celebracoes.every(ehCelebracao)) return false;

  const ids = new Set(valor.celebracoes.map((celebracao) => celebracao.id));
  return ids.size === valor.celebracoes.length;
}
