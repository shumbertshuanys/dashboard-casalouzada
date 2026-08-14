import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { hojeEmSaoPaulo } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { criarReserva } from "../acoes";
import { FormularioNovaReserva, type OpcaoCorretorReserva } from "../formulario";

export const metadata: Metadata = {
  title: "Nova reserva de locação — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaNovaReserva() {
  await exigirAdministradorAtivo();

  // Só corretor ativo de equipe ativa recebe reserva nova. A action reconsulta:
  // este filtro é conveniência da tela, não fronteira de segurança.
  const corretores = await prisma.corretor.findMany({
    where: { ativo: true, equipe: { ativa: true } },
    orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
    select: {
      id: true,
      nomeExibicao: true,
      nomeCompleto: true,
      equipe: { select: { nome: true } },
    },
  });

  const opcoes: OpcaoCorretorReserva[] = corretores.map((corretor) => ({
    id: corretor.id,
    nomeExibicao: corretor.nomeExibicao,
    nomeCompleto: corretor.nomeCompleto,
    equipeNome: corretor.equipe.nome,
  }));

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-texto">Nova reserva de locação</h2>
        <Link
          href="/admin/reservas-locacao"
          className="text-sm text-texto-secundario hover:text-texto"
        >
          Ver reservas
        </Link>
      </div>

      {opcoes.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Não há corretor ativo em equipe ativa.{" "}
          <Link href="/admin/corretores" className="underline">
            Cadastre ou reative um corretor
          </Link>{" "}
          antes de reservar.
        </p>
      ) : (
        <FormularioNovaReserva
          acao={criarReserva}
          corretores={opcoes}
          valoresIniciais={{
            corretorId: "",
            // A criação não tem campo de status: toda reserva nasce ATIVA.
            status: "",
            imovelRef: "",
            // O dia nasce no servidor, no fuso do escritório: o relógio do
            // navegador pode estar em outro fuso e gravaria o dia errado.
            dataReferencia: hojeEmSaoPaulo(),
            observacao: "",
          }}
        />
      )}
    </section>
  );
}
