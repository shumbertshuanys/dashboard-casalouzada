import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import { ehIdVgvHistoricoValido } from "@/lib/validacao/vgv-historico-mensal";
import { editarVgvHistorico, type EstadoVgvHistorico } from "../../acoes";
import { competenciaBR, competenciaISO } from "../../competencia";
import { FormularioVgvHistorico } from "../../formulario";

export const metadata: Metadata = {
  title: "Editar competência — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * Edição de uma competência cadastrada.
 *
 * A competência aparece, mas não é editável: ela vem do banco e a action a
 * reusa. O que muda é o que a fonte consolidada pode ter revisado — o valor e a
 * observação.
 */
export default async function PaginaEditarVgvHistorico({
  params,
}: PageProps<"/admin/vgv-historico/[id]/editar">) {
  await exigirAdministradorAtivo();

  const { id } = await params;
  if (!ehIdVgvHistoricoValido(id)) notFound();

  const registro = await prisma.vgvHistoricoMensal.findUnique({
    where: { id },
    select: { id: true, competencia: true, valorTotal: true, observacao: true },
  });
  if (!registro) notFound();

  // `toFixed(2)`: o Decimal do Prisma corta zeros à direita.
  const valorCanonico = registro.valorTotal.toFixed(2);
  const rotulo = competenciaBR(registro.competencia);

  // Quantas VENDA reais existem no mês — informação, nunca bloqueio.
  const vendasNaCompetencia = (
    await prisma.lancamento.findMany({
      where: { tipo: "VENDA" },
      select: { dataReferencia: true },
    })
  ).filter((venda) => competenciaISO(venda.dataReferencia) === competenciaISO(registro.competencia))
    .length;

  async function salvar(anterior: EstadoVgvHistorico, form: FormData): Promise<EstadoVgvHistorico> {
    "use server";
    return editarVgvHistorico(registro!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar competência</h2>
        <p className="text-sm text-texto-secundario">{rotulo}</p>
      </div>

      <FormularioVgvHistorico
        acao={salvar}
        competenciaFixa={rotulo}
        rotuloEnvio="Salvar alterações"
        vendasNaCompetencia={vendasNaCompetencia}
        valoresIniciais={{
          competencia: competenciaISO(registro.competencia),
          valorTotal: valorCanonico,
          observacao: registro.observacao ?? "",
        }}
        resumo={{
          id: registro.id,
          competenciaRotulo: rotulo,
          valorFormatado: formatarBRL(valorCanonico),
        }}
      />
    </section>
  );
}
