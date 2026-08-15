/**
 * Para onde mandar a pessoa depois do login.
 *
 * O destino vem de `?proximo=` — parâmetro de URL, portanto entrada de terceiro:
 * qualquer um monta o link e manda para o administrador. O que se decide aqui é
 * apenas se aquele texto pode virar um `redirect()`.
 *
 * A regra é **alistamento**, não proibição: só passa o que comprovadamente cai
 * dentro de `/admin`. A tentação é a lista de proibidos — barrar `//`, barrar
 * `\`, barrar `://` — e ela falha sempre pelo mesmo motivo: é preciso adivinhar
 * de antemão toda forma de escrever um endereço externo. Foi assim que
 * `/\evil.example` passou pela versão anterior, que exigia começar com `/` e não
 * começar com `//`. Ele cumpre as duas condições, e ainda assim a especificação
 * de URL trata a contrabarra como barra em esquemas web: o destino resolvia para
 * outra origem, e o administrador recém-autenticado caía num site de terceiro
 * pronto para pedir a senha de novo.
 *
 * Em vez de tentar prever a próxima grafia, aqui se pergunta o que o navegador
 * vai de fato fazer com aquele texto. O candidato é resolvido pelo mesmo parser
 * que o navegador usa, contra uma **origem sentinela** — um domínio reservado que
 * não existe e não é o desta aplicação. Ele não representa o site: é um sensor.
 * Se depois da resolução a origem ainda for a sentinela, o texto era mesmo
 * relativo; se virou outra coisa, era um endereço externo disfarçado, qualquer
 * que tenha sido o truque.
 *
 * Resolver também canonicaliza, e é isso que fecha a segunda porta: `..` e suas
 * formas codificadas são consumidas antes da comparação, então `/admin/../login`
 * é julgado como `/login` — que é o que ele realmente é — em vez de ser aprovado
 * por começar com o texto `/admin`.
 *
 * O que volta é sempre a forma canonicalizada, nunca o texto recebido. Aprovar
 * uma string e depois usar outra seria validar uma coisa e executar outra.
 */

/**
 * Origem só para medir. Domínio sob `.invalid`, que a RFC 2606 reserva
 * justamente para nunca ser resolvível — não há registro, não há DNS, não há
 * requisição possível. Deliberadamente não é o domínio da aplicação: o que
 * importa não é qual origem é, e sim que ela não mude durante a resolução.
 */
const ORIGEM_SENTINELA = "https://interno.invalid";

/** O único destino pós-login, e também o destino de tudo que for recusado. */
export const DESTINO_PADRAO = "/admin";

/**
 * Devolve um caminho interno seguro para o `redirect()` do login.
 *
 * Vale `/admin` e o que estiver abaixo dele; qualquer outra coisa — inclusive
 * caminho interno legítimo como `/login`, que só criaria um laço — vira
 * `/admin`. Nunca lança: entrada esquisita é resposta padrão, não exceção.
 */
export function destinoAposLogin(valor: unknown): string {
  if (typeof valor !== "string") return DESTINO_PADRAO;

  // Caminho relativo, e nada mais. Corta de saída `javascript:`, `data:` e
  // qualquer coisa com esquema próprio, antes de chegar ao parser.
  if (!valor.startsWith("/")) return DESTINO_PADRAO;

  let alvo: URL;
  try {
    alvo = new URL(valor, ORIGEM_SENTINELA);
  } catch {
    // Texto que nem URL é. Não há o que aproveitar.
    return DESTINO_PADRAO;
  }

  // O sensor: se a origem mudou, o "caminho relativo" apontava para fora.
  if (alvo.origin !== ORIGEM_SENTINELA) return DESTINO_PADRAO;

  // Fronteira sobre o caminho **canonicalizado**. `/admin` exato passa; o que
  // está abaixo passa pelo separador explícito — que é o que separa
  // `/admin/corretores` de `/administrator`.
  const caminho = alvo.pathname;
  if (caminho !== DESTINO_PADRAO && !caminho.startsWith(`${DESTINO_PADRAO}/`)) {
    return DESTINO_PADRAO;
  }

  // A forma canonicalizada, nunca a recebida. `search` e `hash` acompanham
  // porque o `proxy.ts` preserva a query ao mandar para o login, e voltar sem
  // ela devolveria a pessoa a uma listagem sem os filtros que ela tinha.
  return `${caminho}${alvo.search}${alvo.hash}`;
}
