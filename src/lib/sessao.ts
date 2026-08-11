import { SignJWT, jwtVerify } from "jose";

/**
 * Sessão em cookie assinado. Este módulo é propositalmente livre de
 * dependências de Node e do Prisma para poder rodar também no middleware.
 */

export const COOKIE_SESSAO = "casalouzada_sessao";

/** 7 dias, em segundos. */
export const DURACAO_SESSAO = 60 * 60 * 24 * 7;

export type Sessao = {
  usuarioId: string;
  nome: string;
  email: string;
};

function chave() {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 32) {
    throw new Error(
      "AUTH_SECRET não definida ou curta demais (mínimo 32 caracteres) — veja o .env.example",
    );
  }
  return new TextEncoder().encode(segredo);
}

export async function assinarSessao(sessao: Sessao): Promise<string> {
  return new SignJWT({ nome: sessao.nome, email: sessao.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sessao.usuarioId)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO}s`)
    .sign(chave());
}

/** Retorna a sessão quando o token é válido e não expirou, senão `null`. */
export async function verificarSessao(token: string | undefined): Promise<Sessao | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.nome !== "string") {
      return null;
    }
    return { usuarioId: payload.sub, nome: payload.nome, email: payload.email };
  } catch {
    return null;
  }
}
