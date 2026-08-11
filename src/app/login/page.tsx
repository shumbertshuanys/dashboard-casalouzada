import type { Metadata } from "next";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = {
  title: "Entrar — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  const { proximo } = await searchParams;
  const destino = typeof proximo === "string" ? proximo : "/admin";

  return (
    <main className="flex min-h-full items-center justify-center bg-fundo p-6">
      <div className="w-full max-w-sm rounded-xl bg-superficie p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-texto">Casa Louzada</h1>
        <p className="mt-1 mb-6 text-sm text-texto-secundario">Área administrativa</p>
        <FormularioLogin proximo={destino} />
      </div>
    </main>
  );
}
