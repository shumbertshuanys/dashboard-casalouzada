import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import { ehIdCorretorValido, paraCampoData } from "@/lib/validacao/corretor";
import { editarCorretor, type EstadoCorretor } from "../../acoes";
import { FormularioCorretor, type OpcaoEquipe } from "../../formulario";

export const metadata: Metadata = {
  title: "Editar corretor — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEditarCorretor({
  params,
}: PageProps<"/admin/corretores/[id]/editar">) {
  await exigirAdministradorAtivo();

  const { id } = await params;

  // Segmento da URL é entrada externa: sem UUID válido não há consulta, senão
  // a coluna `uuid` devolveria erro de conversão em vez de 404.
  if (!ehIdCorretorValido(id)) notFound();

  const corretor = await prisma.corretor.findUnique({
    where: { id },
    select: {
      id: true,
      nomeCompleto: true,
      nomeExibicao: true,
      creci: true,
      fotoUrl: true,
      equipeId: true,
      dataEntrada: true,
      ativo: true,
      equipe: { select: { id: true, nome: true, ativa: true } },
    },
  });
  if (!corretor) notFound();

  const ativas = await prisma.equipe.findMany({
    where: { ativa: true },
    orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, ativa: true },
  });

  // A equipe atual entra na lista mesmo desativada — senão o `<select>` não
  // teria como representar onde o corretor está, e salvar qualquer edição o
  // transferiria sem querer. As demais inativas continuam fora: elas não são
  // destino válido.
  const equipes: OpcaoEquipe[] = ativas.some((equipe) => equipe.id === corretor.equipeId)
    ? ativas
    : [...ativas, corretor.equipe];

  async function salvar(anterior: EstadoCorretor, form: FormData): Promise<EstadoCorretor> {
    "use server";
    return editarCorretor(corretor!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar corretor</h2>
        <p className="text-sm text-texto-secundario">
          {corretor.nomeExibicao} · {corretor.ativo ? "ativo" : "inativo"}
        </p>
      </div>

      <FormularioCorretor
        acao={salvar}
        equipes={equipes}
        equipeOriginalId={corretor.equipeId}
        valores={{
          nomeCompleto: corretor.nomeCompleto,
          nomeExibicao: corretor.nomeExibicao,
          creci: corretor.creci ?? "",
          fotoUrl: corretor.fotoUrl ?? "",
          equipeId: corretor.equipeId,
          dataEntrada: paraCampoData(corretor.dataEntrada),
        }}
        rotuloEnvio="Salvar alterações"
      />
    </section>
  );
}
