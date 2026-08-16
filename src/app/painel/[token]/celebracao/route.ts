import { listarCelebracoesRecentes } from "@/lib/celebracao";
import { paraRespostaCelebracoes } from "@/lib/contrato-celebracao";
import { prisma } from "@/lib/db";
import { tokenPainelConfere } from "@/lib/token-painel";

/**
 * As celebrações recentes, para a TV.
 *
 * **Irmã de `/painel/[token]/dados`, não parte dela.** As duas rotas respondem a
 * ritmos diferentes — as métricas mudam por minuto, uma comemoração é para
 * agora — e falham por motivos diferentes. Juntá-las no mesmo payload faria a
 * atualização das métricas carregar um evento efêmero, e uma falha de qualquer
 * das duas derrubaria a outra. `/dados` continua exatamente como estava.
 *
 * A ordem das linhas é a mesma da rota irmã, e pelo mesmo motivo: **o token vem
 * antes de qualquer leitura**. O `prisma` importado no topo é o Proxy preguiçoso
 * de `src/lib/db.ts`, que só abre conexão quando alguém o usa — então um token
 * errado sai daqui sem ter tocado no banco.
 *
 * O 404 é resposta, não `notFound()`: o consumidor é um `fetch`, que precisa de
 * status para decidir, não da página de erro que o `notFound()` renderiza.
 *
 * `agora` é criado uma vez e passa adiante: quem congela o instante é esta
 * camada, e o núcleo não tem relógio próprio. Dois `new Date()` no mesmo request
 * poderiam cair em lados opostos da janela de frescor.
 *
 * `Cache-Control: no-store` é mais importante aqui do que na rota irmã. Uma
 * métrica repetida por um intermediário mostra número velho; uma celebração
 * repetida faz a TV comemorar de novo uma venda que já foi comemorada, ou
 * ressuscitar uma que já saiu da janela. Nada disso pode ser servido de cache.
 *
 * Sem `try`/`catch`: exceção continua sendo exceção. A tolerância a falha da
 * celebração vive no cadastro da venda, onde a venda precisa sobreviver ao
 * evento de UX — aqui não há nada a proteger, e engolir erro esconderia da TV
 * que a leitura não aconteceu.
 */
export async function GET(
  _requisicao: Request,
  { params }: RouteContext<"/painel/[token]/celebracao">,
) {
  const { token } = await params;

  if (!tokenPainelConfere(token)) {
    return new Response(null, { status: 404 });
  }

  const agora = new Date();
  const celebracoes = await listarCelebracoesRecentes(prisma, agora);

  return Response.json(paraRespostaCelebracoes(celebracoes), {
    headers: { "Cache-Control": "no-store" },
  });
}
