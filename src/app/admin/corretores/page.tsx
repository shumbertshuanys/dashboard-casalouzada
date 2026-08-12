import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarDataBR } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { interpretarFiltroEquipe, interpretarSituacao } from "@/lib/validacao/corretor";
import { alterarEstadoCorretor } from "./acoes";

export const metadata: Metadata = {
  title: "Corretores — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaCorretores({
  searchParams,
}: PageProps<"/admin/corretores">) {
  // Autorização junto da leitura, na própria página.
  await exigirAdministradorAtivo();

  const filtros = await searchParams;

  // Query param é entrada externa: um UUID torto iria para uma coluna `uuid` e
  // viraria 500. Aqui vira "todas as equipes".
  const equipeId = interpretarFiltroEquipe(filtros.equipe);
  const situacao = interpretarSituacao(filtros.situacao);

  const [corretores, equipes] = await Promise.all([
    prisma.corretor.findMany({
      where: {
        ...(equipeId ? { equipeId } : {}),
        ...(situacao === "ativos" ? { ativo: true } : {}),
        ...(situacao === "inativos" ? { ativo: false } : {}),
      },
      orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
      // A equipe vem junto: buscar uma a uma seria N+1.
      include: { equipe: { select: { nome: true, ativa: true } } },
    }),
    prisma.equipe.findMany({
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true },
    }),
  ]);

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">Corretores</h2>
          <p className="text-sm text-texto-secundario">
            {corretores.length}{" "}
            {corretores.length === 1 ? "corretor listado" : "corretores listados"}
          </p>
        </div>
        <Link
          href="/admin/corretores/novo"
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
        >
          Novo corretor
        </Link>
      </div>

      {/* Filtros por GET: o estado fica na URL e o link é compartilhável. */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block text-xs text-texto-secundario">Equipe</span>
          <select
            name="equipe"
            defaultValue={equipeId ?? ""}
            className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
          >
            <option value="">Todas</option>
            {equipes.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-texto-secundario">Situação</span>
          <select
            name="situacao"
            defaultValue={situacao}
            className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
          >
            <option value="todos">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-md border border-white/15 px-3 py-2 text-sm text-texto-secundario hover:text-texto"
        >
          Filtrar
        </button>
        <Link href="/admin/corretores" className="text-sm text-texto-secundario hover:text-texto">
          Limpar
        </Link>
      </form>

      {corretores.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Nenhum corretor encontrado com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-texto-secundario">
                <th className="py-2 pr-4 font-medium">Exibição</th>
                <th className="py-2 pr-4 font-medium">Nome completo</th>
                <th className="py-2 pr-4 font-medium">Equipe</th>
                <th className="py-2 pr-4 font-medium">CRECI</th>
                <th className="py-2 pr-4 font-medium">Entrada</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {corretores.map((corretor) => (
                <tr key={corretor.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-texto">{corretor.nomeExibicao}</td>
                  <td className="py-3 pr-4 text-texto-secundario">{corretor.nomeCompleto}</td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {corretor.equipe.nome}
                    {!corretor.equipe.ativa && " (inativa)"}
                  </td>
                  <td className="py-3 pr-4 text-texto-secundario">{corretor.creci ?? "—"}</td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {corretor.dataEntrada ? formatarDataBR(corretor.dataEntrada) : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={corretor.ativo ? "text-positivo" : "text-texto-secundario"}>
                      {corretor.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/admin/corretores/${corretor.id}/editar`}
                        className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                      >
                        Editar
                      </Link>
                      {/* Só id e estado desejado: a action reconsulta o resto. */}
                      <form action={alterarEstadoCorretor}>
                        <input type="hidden" name="id" value={corretor.id} />
                        <input
                          type="hidden"
                          name="ativo"
                          value={corretor.ativo ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                        >
                          {corretor.ativo ? "Desativar" : "Reativar"}
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
        Corretores não são excluídos: os lançamentos guardam quem os registrou. Encerrar é
        desativar. Trocar de equipe não mexe no histórico já lançado.
      </p>
    </section>
  );
}
