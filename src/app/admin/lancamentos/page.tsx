import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import {
  POR_PAGINA,
  ROTULOS,
  interpretarFiltrosLancamentos,
  interpretarPagina,
} from "@/lib/validacao/lancamento";
import { FiltrosLancamento, type OpcaoFiltro } from "./filtros";

export const metadata: Metadata = {
  title: "Lançamentos — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * Listagem de lançamentos.
 *
 * Sem totalizador, sem VGV, sem soma: agregação é da Fase 3, em
 * `src/lib/metricas.ts`. Aqui a tela só mostra os eventos como foram gravados.
 */
export default async function PaginaLancamentos({
  searchParams,
}: PageProps<"/admin/lancamentos">) {
  await exigirAdministradorAtivo();

  const params = await searchParams;
  const filtros = interpretarFiltrosLancamentos(params);
  const pagina = interpretarPagina(
    Array.isArray(params.pagina) ? params.pagina[0] : params.pagina,
  );

  // Todos os filtros são por coluna do próprio lançamento. `equipeId` é o do
  // evento, não a equipe atual do corretor.
  const where = {
    ...(filtros.corretorId ? { corretorId: filtros.corretorId } : {}),
    ...(filtros.equipeId ? { equipeId: filtros.equipeId } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.de || filtros.ate
      ? {
          dataReferencia: {
            ...(filtros.de ? { gte: filtros.de } : {}),
            ...(filtros.ate ? { lte: filtros.ate } : {}),
          },
        }
      : {}),
  };

  const [total, lancamentos, corretores, equipes] = await Promise.all([
    prisma.lancamento.count({ where }),
    prisma.lancamento.findMany({
      where,
      orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        tipo: true,
        dataReferencia: true,
        valor: true,
        imovelRef: true,
        observacao: true,
        corretor: { select: { nomeExibicao: true } },
        // A equipe do evento, por `Lancamento.equipeId`. Nunca
        // `corretor.equipe`, que é a lotação de hoje.
        equipe: { select: { nome: true, ativa: true } },
      },
    }),
    prisma.corretor.findMany({
      orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
      select: { id: true, nomeExibicao: true, ativo: true },
    }),
    prisma.equipe.findMany({
      orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, ativa: true },
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const opcoesCorretor: OpcaoFiltro[] = corretores.map((corretor) => ({
    id: corretor.id,
    rotulo: corretor.ativo ? corretor.nomeExibicao : `${corretor.nomeExibicao} (inativo)`,
  }));
  const opcoesEquipe: OpcaoFiltro[] = equipes.map((equipe) => ({
    id: equipe.id,
    rotulo: equipe.ativa ? equipe.nome : `${equipe.nome} (inativa)`,
  }));

  /** Mantém os filtros ao trocar de página. */
  function linkPagina(destino: number): string {
    const busca = new URLSearchParams();
    for (const [chave, valor] of Object.entries(params)) {
      if (chave === "pagina") continue;
      const primeiro = Array.isArray(valor) ? valor[0] : valor;
      if (typeof primeiro === "string" && primeiro !== "") busca.set(chave, primeiro);
    }
    busca.set("pagina", String(destino));
    return `/admin/lancamentos?${busca.toString()}`;
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">Lançamentos</h2>
          <p className="text-sm text-texto-secundario">
            {total} {total === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
        <Link
          href="/admin/lancamentos/novo"
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
        >
          Novo lançamento
        </Link>
      </div>

      <FiltrosLancamento filtros={filtros} corretores={opcoesCorretor} equipes={opcoesEquipe} />

      {lancamentos.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Nenhum lançamento encontrado com esses filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-texto-secundario">
                <th className="py-2 pr-4 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Corretor</th>
                <th className="py-2 pr-4 font-medium">Equipe</th>
                <th className="py-2 pr-4 font-medium">Valor</th>
                <th className="py-2 pr-4 font-medium">Imóvel</th>
                <th className="py-2 pr-4 font-medium">Observação</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((lancamento) => (
                <tr key={lancamento.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {formatarDataBR(lancamento.dataReferencia)}
                  </td>
                  <td className="py-3 pr-4 text-texto">{ROTULOS[lancamento.tipo]}</td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {lancamento.corretor.nomeExibicao}
                  </td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {lancamento.equipe.nome}
                    {!lancamento.equipe.ativa && " (inativa)"}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {/* `toFixed(2)`, não `toString()`: o Decimal do Prisma corta
                        zeros à direita, e "1250000" sem casas quebraria o
                        formatador. Também não é `Number` — um valor no topo de
                        Decimal(14,2) não cabe exato num double. */}
                    {lancamento.valor === null ? "—" : formatarBRL(lancamento.valor.toFixed(2))}
                  </td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {lancamento.imovelRef ?? "—"}
                  </td>
                  <td className="py-3 pr-4 max-w-xs truncate text-texto-secundario">
                    {lancamento.observacao ?? "—"}
                  </td>
                  <td className="py-3">
                    {/* Só editar. Excluir vive na tela de edição: apagar um
                        evento não pode ser um clique de passagem na lista. */}
                    <Link
                      href={`/admin/lancamentos/${lancamento.id}/editar`}
                      className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {pagina > 1 ? (
            <Link href={linkPagina(pagina - 1)} className="text-texto-secundario hover:text-texto">
              ← Anterior
            </Link>
          ) : (
            <span className="text-texto-secundario/40">← Anterior</span>
          )}
          <span className="text-texto-secundario">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={linkPagina(pagina + 1)} className="text-texto-secundario hover:text-texto">
              Próxima →
            </Link>
          ) : (
            <span className="text-texto-secundario/40">Próxima →</span>
          )}
        </nav>
      )}

      <p className="mt-6 text-xs text-texto-secundario">
        A equipe mostrada é a do momento do lançamento. Trocar o corretor de equipe depois não
        muda o que já foi registrado.
      </p>
    </section>
  );
}
