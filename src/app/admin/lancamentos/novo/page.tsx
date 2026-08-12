import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { hojeEmSaoPaulo } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { criarLancamento } from "../acoes";
import { FormularioLancamento, type OpcaoCorretor } from "../formulario";

export const metadata: Metadata = {
  title: "Novo lançamento — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaNovoLancamento() {
  await exigirAdministradorAtivo();

  // Só corretores ativos podem receber lançamento novo. A action reconsulta.
  const corretores = await prisma.corretor.findMany({
    where: { ativo: true },
    orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
    select: {
      id: true,
      nomeExibicao: true,
      nomeCompleto: true,
      equipeId: true,
      equipe: { select: { nome: true, ativa: true } },
    },
  });

  const opcoes: OpcaoCorretor[] = corretores.map((corretor) => ({
    id: corretor.id,
    nomeExibicao: corretor.nomeExibicao,
    nomeCompleto: corretor.nomeCompleto,
    equipeNome: corretor.equipe.nome,
    equipeAtiva: corretor.equipe.ativa,
  }));

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium text-texto">Novo lançamento</h2>
        <Link href="/admin/lancamentos" className="text-sm text-texto-secundario hover:text-texto">
          Ver lançamentos
        </Link>
      </div>

      {opcoes.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Não há corretor ativo.{" "}
          <Link href="/admin/corretores" className="underline">
            Cadastre ou reative um corretor
          </Link>{" "}
          antes de lançar.
        </p>
      ) : (
        <FormularioLancamento
          acao={criarLancamento}
          corretores={opcoes}
          valoresIniciais={{
            tipo: "",
            corretorId: "",
            // O dia nasce no servidor, no fuso do escritório: o relógio do
            // navegador pode estar em outro fuso e gravaria o dia errado.
            dataReferencia: hojeEmSaoPaulo(),
            valor: "",
            imovelRef: "",
            observacao: "",
          }}
        />
      )}
    </section>
  );
}
