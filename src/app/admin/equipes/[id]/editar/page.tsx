import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import { ehIdEquipeValido } from "@/lib/validacao/equipe";
import { editarEquipe, type EstadoEquipe } from "../../acoes";
import { FormularioEquipe } from "../../formulario";

export const metadata: Metadata = {
  title: "Editar equipe — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEditarEquipe({ params }: PageProps<"/admin/equipes/[id]/editar">) {
  // Autorização antes da leitura, na própria página.
  await exigirAdministradorAtivo();

  const { id } = await params;

  // O segmento da URL é entrada externa. Sem UUID válido não há consulta: a
  // coluna é `uuid` e um texto qualquer viraria erro de conversão — 500 no
  // lugar do 404 que a rota deve dar.
  if (!ehIdEquipeValido(id)) notFound();

  const equipe = await prisma.equipe.findUnique({
    where: { id },
    select: { id: true, nome: true, gerenteNome: true, ordemExibicao: true, ativa: true },
  });
  if (!equipe) notFound();

  // O id vai por closure no servidor, não por campo do formulário: assim não há
  // como trocar de alvo mexendo no HTML.
  async function salvar(anterior: EstadoEquipe, form: FormData): Promise<EstadoEquipe> {
    "use server";
    return editarEquipe(equipe!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar equipe</h2>
        <p className="text-sm text-texto-secundario">
          {equipe.nome} · {equipe.ativa ? "ativa" : "inativa"}
        </p>
      </div>

      <FormularioEquipe
        acao={salvar}
        valores={{
          nome: equipe.nome,
          gerenteNome: equipe.gerenteNome,
          ordemExibicao: equipe.ordemExibicao,
        }}
        rotuloEnvio="Salvar alterações"
      />
    </section>
  );
}
