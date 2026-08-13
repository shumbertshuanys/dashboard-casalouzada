import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * O guard do token do painel, num lugar só.
 *
 * Duas entradas passam por aqui — a página `/painel/[token]` e a rota de dados
 * `/painel/[token]/dados` —, e a comparação precisa ser idêntica nas duas. Duas
 * cópias divergiriam em silêncio, e a que ficasse mais frouxa viraria a porta de
 * entrada.
 *
 * `server-only`: `PAINEL_TOKEN` nunca deve alcançar o bundle do cliente.
 */
export function tokenPainelConfere(recebido: string): boolean {
  const esperado = process.env.PAINEL_TOKEN;
  if (!esperado) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige o mesmo tamanho; o comprimento em si não é segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}
