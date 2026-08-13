import { prisma } from "@/lib/db";
import { lerPainel } from "@/lib/leitura-painel";
import { tokenPainelConfere } from "@/lib/token-painel";

/**
 * A origem da atualização automática: uma leitura por requisição, em JSON.
 *
 * A aba aberta na TV chama esta rota a cada minuto. Ela não sabe nada de banco —
 * pede, valida o que voltou e decide se substitui ou retém (F3.6).
 *
 * A ordem das linhas é a mesma da página, e pelo mesmo motivo: **o token vem
 * antes de qualquer leitura**. O `prisma` importado no topo é o Proxy preguiçoso
 * de `src/lib/db.ts`, que só abre conexão quando alguém o usa — então um token
 * errado sai daqui sem ter tocado no banco.
 *
 * O 404 é devolvido como resposta, e não por `notFound()`: aqui o consumidor é um
 * `fetch`, que precisa de um status para decidir, não da página de erro que o
 * `notFound()` renderiza. A página `/painel/[token]` continua usando `notFound()`,
 * que é o certo para ela.
 *
 * `Cache-Control: no-store` porque a resposta é o estado do momento: um
 * intermediário que a guardasse faria a TV repetir número velho achando que
 * atualizou. Não há `try`/`catch` — os estados conhecidos vêm como dados, e
 * exceção continua sendo exceção.
 */
export async function GET(
  _requisicao: Request,
  { params }: RouteContext<"/painel/[token]/dados">,
) {
  const { token } = await params;

  if (!tokenPainelConfere(token)) {
    return new Response(null, { status: 404 });
  }

  const agora = new Date();
  const leitura = await lerPainel(prisma, agora);

  return Response.json(leitura, { headers: { "Cache-Control": "no-store" } });
}
