"use server";

import { redirect } from "next/navigation";
import { autenticar } from "@/lib/auth";
import { destinoAposLogin } from "@/lib/destino-login";
import { criarSessao, encerrarSessao } from "@/lib/sessao-servidor";

export type EstadoLogin = { erro?: string };

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const proximo = destinoAposLogin(formData.get("proximo"));

  if (!email || !senha) {
    return { erro: "Preencha e-mail e senha." };
  }

  const sessao = await autenticar(email, senha);
  if (!sessao) {
    return { erro: "E-mail ou senha inválidos." };
  }

  await criarSessao(sessao);
  redirect(proximo);
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect("/login");
}
