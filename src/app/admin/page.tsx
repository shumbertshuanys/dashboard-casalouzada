import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao-servidor";
import { sair } from "@/app/login/acoes";

export const metadata: Metadata = {
  title: "Administração — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaAdmin() {
  // O middleware já barra quem não tem sessão; aqui a leitura serve para exibir
  // o usuário e como segunda barreira caso a rota mude de matcher.
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  return (
    <main className="min-h-full bg-fundo p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-texto">Área administrativa</h1>
          <p className="text-sm text-texto-secundario">{sessao.nome}</p>
        </div>
        <form action={sair}>
          <button
            type="submit"
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-texto-secundario hover:text-texto"
          >
            Sair
          </button>
        </form>
      </header>

      <p className="mt-8 text-sm text-texto-secundario">
        Cadastros e lançamentos entram na Fase 2.
      </p>
    </main>
  );
}
