import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { deDataCivil, formatarDataBR } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { ehIdReservaLocacaoValido } from "@/lib/validacao/reserva-locacao";
import { editarReserva, type EstadoReserva } from "../../acoes";
import { FormularioEdicaoReserva } from "../../formulario";

export const metadata: Metadata = {
  title: "Editar reserva de locação — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEditarReserva({
  params,
}: PageProps<"/admin/reservas-locacao/[id]/editar">) {
  await exigirAdministradorAtivo();

  const { id } = await params;

  // Segmento da URL é entrada externa: sem UUID válido não há consulta.
  if (!ehIdReservaLocacaoValido(id)) notFound();

  const reserva = await prisma.reservaLocacao.findUnique({
    where: { id },
    select: {
      id: true,
      imovelRef: true,
      status: true,
      dataReferencia: true,
      observacao: true,
      // Estado atual do corretor só para informar na tela — a edição não é
      // bloqueada por corretor ou equipe hoje inativos.
      corretor: { select: { nomeExibicao: true, ativo: true } },
      equipe: { select: { nome: true, ativa: true } },
    },
  });
  if (!reserva) notFound();

  async function salvar(anterior: EstadoReserva, form: FormData): Promise<EstadoReserva> {
    "use server";
    return editarReserva(reserva!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar reserva de locação</h2>
        <p className="text-sm text-texto-secundario">
          {reserva.imovelRef} · {reserva.corretor.nomeExibicao} ·{" "}
          {formatarDataBR(reserva.dataReferencia)}
        </p>
      </div>

      <FormularioEdicaoReserva
        acao={salvar}
        valoresIniciais={{
          corretorId: "",
          status: reserva.status,
          imovelRef: reserva.imovelRef,
          dataReferencia: deDataCivil(reserva.dataReferencia),
          observacao: reserva.observacao ?? "",
        }}
        resumo={{
          corretorNome: reserva.corretor.nomeExibicao,
          corretorAtivo: reserva.corretor.ativo,
          equipeNome: reserva.equipe.nome,
          equipeAtiva: reserva.equipe.ativa,
        }}
      />
    </section>
  );
}
