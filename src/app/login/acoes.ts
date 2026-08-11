"use server";

import { redirect } from "next/navigation";
import { autenticar } from "@/lib/auth";
import { criarSessao, encerrarSessao } from "@/lib/sessao-servidor";

export type EstadoLogin = { erro?: string };

/** Só aceita caminhos internos, para o parâmetro `proximo` não virar open redirect. */
function destinoSeguro(valor: FormDataEntryValue | null): string {
  const caminho = typeof valor === "string" ? valor : "";
  return caminho.startsWith("/") && !caminho.startsWith("//") ? caminho : "/admin";
}

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  const proximo = destinoSeguro(formData.get("proximo"));

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
