import Link from "next/link";
import { redirect } from "next/navigation";
import { NaoAutorizadoError, exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { sair } from "@/app/login/acoes";

/**
 * Shell da área administrativa.
 *
 * A guarda aqui é conveniência de UX — evita desenhar a casca para quem não tem
 * acesso e dá o nome de quem está logado. **Não é fronteira de autorização:**
 * layouts do App Router são reaproveitados entre navegações e não reexecutam a
 * cada leitura. Cada página que consultar dado administrativo e cada Server
 * Action tem de chamar `exigirAdministradorAtivo()` por conta própria.
 */
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  let administrador;
  try {
    administrador = await exigirAdministradorAtivo();
  } catch (erro) {
    // Só a negação vira redirecionamento. Erro de banco ou defeito de código
    // continua estourando, senão uma falha de infraestrutura viraria uma tela de
    // login silenciosa e enganosa.
    if (erro instanceof NaoAutorizadoError) redirect("/login");
    throw erro;
  }

  return (
    <div className="flex min-h-full flex-col bg-fundo">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold text-texto">Área administrativa</h1>
          <p className="text-sm text-texto-secundario">{administrador.nome}</p>
        </div>
        <div className="flex items-center gap-6">
          {/* Só entra link de rota que existe. */}
          <nav className="flex items-center gap-4">
            <Link
              href="/admin/equipes"
              className="text-sm text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
            >
              Equipes
            </Link>
            <Link
              href="/admin/corretores"
              className="text-sm text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
            >
              Corretores
            </Link>
            <Link
              href="/admin/lancamentos"
              className="text-sm text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
            >
              Lançamentos
            </Link>
            <Link
              href="/admin/reservas-locacao"
              className="text-sm text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
            >
              Reservas
            </Link>
            <Link
              href="/admin/saldo-historico"
              className="text-sm text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
            >
              Saldo histórico
            </Link>
          </nav>
          <form action={sair}>
            <button
              type="submit"
              className="rounded-md border border-white/15 px-3 py-2 text-sm text-texto-secundario hover:text-texto"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
