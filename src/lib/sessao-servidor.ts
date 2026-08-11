import "server-only";
import { cookies } from "next/headers";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO,
  assinarSessao,
  verificarSessao,
  type Sessao,
} from "@/lib/sessao";

/** Leitura e escrita do cookie de sessão. Só roda no servidor (Node). */

export async function criarSessao(sessao: Sessao): Promise<void> {
  const token = await assinarSessao(sessao);
  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_SESSAO,
  });
}

export async function lerSessao(): Promise<Sessao | null> {
  const jar = await cookies();
  return verificarSessao(jar.get(COOKIE_SESSAO)?.value);
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_SESSAO);
}
