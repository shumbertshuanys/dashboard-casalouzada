import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, verificarSessao } from "@/lib/sessao";

/**
 * Middleware da aplicação — a partir do Next 16 o arquivo se chama `proxy`.
 * Só confere a assinatura do cookie; a checagem no banco fica nas páginas.
 */
export default async function proxy(request: NextRequest) {
  const sessao = await verificarSessao(request.cookies.get(COOKIE_SESSAO)?.value);
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (sessao) return NextResponse.next();
    const login = new URL("/login", request.url);
    // Guarda o destino para devolver a pessoa ao lugar certo depois do login.
    login.searchParams.set("proximo", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (pathname === "/login" && sessao) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
