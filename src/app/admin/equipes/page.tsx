import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import { alterarEstadoEquipe } from "./acoes";

export const metadata: Metadata = {
  title: "Equipes — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEquipes() {
  // Autorização junto da leitura. O layout já chamou a guarda, mas layouts são
  // reaproveitados entre navegações — quem lê é quem exige.
  await exigirAdministradorAtivo();

  const equipes = await prisma.equipe.findMany({
    // Ordem do painel; nome desempata para a listagem não dançar quando duas
    // equipes dividem a mesma posição.
    orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    // Uma consulta só: contar em laço traria um N+1.
    include: { _count: { select: { corretores: true, lancamentos: true } } },
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">Equipes</h2>
          <p className="text-sm text-texto-secundario">
            {equipes.length} {equipes.length === 1 ? "equipe cadastrada" : "equipes cadastradas"}
          </p>
        </div>
        <Link
          href="/admin/equipes/novo"
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
        >
          Nova equipe
        </Link>
      </div>

      {equipes.length === 0 ? (
        <p className="text-sm text-texto-secundario">Nenhuma equipe cadastrada ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-texto-secundario">
                <th className="py-2 pr-4 font-medium">Ordem</th>
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Gerente</th>
                <th className="py-2 pr-4 font-medium">Corretores</th>
                <th className="py-2 pr-4 font-medium">Lançamentos</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {equipes.map((equipe) => (
                <tr key={equipe.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-texto-secundario">{equipe.ordemExibicao}</td>
                  <td className="py-3 pr-4 text-texto">{equipe.nome}</td>
                  <td className="py-3 pr-4 text-texto-secundario">{equipe.gerenteNome}</td>
                  <td className="py-3 pr-4 text-texto-secundario">{equipe._count.corretores}</td>
                  <td className="py-3 pr-4 text-texto-secundario">{equipe._count.lancamentos}</td>
                  <td className="py-3 pr-4">
                    <span className={equipe.ativa ? "text-positivo" : "text-texto-secundario"}>
                      {equipe.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/equipes/${equipe.id}/editar`}
                        className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                      >
                        Editar
                      </Link>
                      {/* Só id e estado desejado: a action reconsulta o resto. */}
                      <form action={alterarEstadoEquipe}>
                        <input type="hidden" name="id" value={equipe.id} />
                        <input type="hidden" name="ativa" value={equipe.ativa ? "false" : "true"} />
                        <button
                          type="submit"
                          className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                        >
                          {equipe.ativa ? "Desativar" : "Reativar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-texto-secundario">
        Equipes não são excluídas: corretores e lançamentos guardam a equipe do momento do
        registro. Encerrar uma equipe é desativá-la.
      </p>
    </section>
  );
}
