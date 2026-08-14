import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarDataBR } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { ROTULOS_STATUS_RESERVA } from "@/lib/validacao/reserva-locacao";

export const metadata: Metadata = {
  title: "Reservas de locação — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * Listagem de reservas de locação.
 *
 * Sem totalizador e sem métrica: reserva é operação, não produção (DEC-055) —
 * nenhum status conta em Locados, VGV ou ranking. Sem filtros nesta fatia: a
 * lista completa basta para o volume operacional atual, e filtro é refino
 * posterior se o volume crescer.
 */
export default async function PaginaReservasLocacao() {
  await exigirAdministradorAtivo();

  const reservas = await prisma.reservaLocacao.findMany({
    orderBy: [{ dataReferencia: "desc" }, { criadoEm: "desc" }],
    select: {
      id: true,
      imovelRef: true,
      status: true,
      dataReferencia: true,
      observacao: true,
      corretor: { select: { nomeExibicao: true } },
      // A equipe do snapshot, por `ReservaLocacao.equipeId`. Nunca
      // `corretor.equipe`, que é a lotação de hoje.
      equipe: { select: { nome: true, ativa: true } },
    },
  });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">Reservas de locação</h2>
          <p className="text-sm text-texto-secundario">
            {reservas.length} {reservas.length === 1 ? "reserva" : "reservas"}
          </p>
        </div>
        <Link
          href="/admin/reservas-locacao/novo"
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
        >
          Nova reserva
        </Link>
      </div>

      {reservas.length === 0 ? (
        <p className="text-sm text-texto-secundario">Nenhuma reserva de locação cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-texto-secundario">
                <th className="py-2 pr-4 font-medium">Data</th>
                <th className="py-2 pr-4 font-medium">Imóvel</th>
                <th className="py-2 pr-4 font-medium">Corretor</th>
                <th className="py-2 pr-4 font-medium">Equipe</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Observação</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {reservas.map((reserva) => (
                <tr key={reserva.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {formatarDataBR(reserva.dataReferencia)}
                  </td>
                  <td className="py-3 pr-4 text-texto">{reserva.imovelRef}</td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {reserva.corretor.nomeExibicao}
                  </td>
                  <td className="py-3 pr-4 text-texto-secundario">
                    {reserva.equipe.nome}
                    {!reserva.equipe.ativa && " (inativa)"}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {ROTULOS_STATUS_RESERVA[reserva.status]}
                  </td>
                  <td className="py-3 pr-4 max-w-xs truncate text-texto-secundario">
                    {reserva.observacao ?? "—"}
                  </td>
                  <td className="py-3">
                    {/* Só editar. Não existe excluir: uma reserva que deixou de
                        valer vira CANCELADA e o registro fica. */}
                    <Link
                      href={`/admin/reservas-locacao/${reserva.id}/editar`}
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

      <p className="mt-6 text-xs text-texto-secundario">
        A equipe mostrada é a do momento da reserva. Reserva não conta como produção: quando o
        negócio fechar, lance a locação e marque a reserva como finalizada.
      </p>
    </section>
  );
}
