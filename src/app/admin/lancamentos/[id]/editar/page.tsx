import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { deDataCivil, formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import { ROTULOS, ehIdLancamentoValido } from "@/lib/validacao/lancamento";
import { editarLancamento, type EstadoEdicao } from "../../acoes";
import {
  FormularioEdicaoLancamento,
  type OpcaoCorretorEdicao,
} from "../../formulario-edicao";

export const metadata: Metadata = {
  title: "Editar lançamento — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEditarLancamento({
  params,
}: PageProps<"/admin/lancamentos/[id]/editar">) {
  await exigirAdministradorAtivo();

  const { id } = await params;

  // Segmento da URL é entrada externa: sem UUID válido não há consulta.
  if (!ehIdLancamentoValido(id)) notFound();

  const lancamento = await prisma.lancamento.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      corretorId: true,
      dataReferencia: true,
      valor: true,
      valorProposta: true,
      statusProposta: true,
      imovelRef: true,
      observacao: true,
      corretor: { select: { id: true, nomeExibicao: true, nomeCompleto: true, ativo: true } },
      equipe: { select: { nome: true } },
    },
  });
  if (!lancamento) notFound();

  const ativos = await prisma.corretor.findMany({
    where: { ativo: true },
    orderBy: [{ nomeExibicao: "asc" }, { nomeCompleto: "asc" }],
    select: { id: true, nomeExibicao: true, nomeCompleto: true, ativo: true },
  });

  // O corretor gravado entra na lista mesmo inativo — lançamento de
  // ex-corretor precisa continuar corrigível. Os demais inativos ficam de
  // fora: não são destino válido para uma troca.
  const corretores: OpcaoCorretorEdicao[] = ativos.some((c) => c.id === lancamento.corretorId)
    ? ativos
    : [lancamento.corretor, ...ativos];

  // `toFixed(2)`: o Decimal do Prisma corta zeros à direita.
  const valorCanonico = lancamento.valor === null ? null : lancamento.valor.toFixed(2);

  async function salvar(anterior: EstadoEdicao, form: FormData): Promise<EstadoEdicao> {
    "use server";
    return editarLancamento(lancamento!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar lançamento</h2>
        <p className="text-sm text-texto-secundario">
          {ROTULOS[lancamento.tipo]} · {lancamento.corretor.nomeExibicao} ·{" "}
          {formatarDataBR(lancamento.dataReferencia)}
        </p>
      </div>

      <FormularioEdicaoLancamento
        acao={salvar}
        corretores={corretores}
        equipeRegistradaNome={lancamento.equipe.nome}
        corretorOriginalId={lancamento.corretorId}
        valorOriginal={valorCanonico}
        tipoOriginal={lancamento.tipo}
        valoresIniciais={{
          tipo: lancamento.tipo,
          corretorId: lancamento.corretorId,
          dataReferencia: deDataCivil(lancamento.dataReferencia),
          valor: valorCanonico ?? "",
          valorProposta: lancamento.valorProposta?.toFixed(2) ?? "",
          // O status persistido; proposta legada da janela transitória sem
          // status abre com o padrão AGUARDANDO já selecionado.
          statusProposta:
            lancamento.statusProposta ??
            (lancamento.tipo === "PROPOSTA" ? "AGUARDANDO" : ""),
          imovelRef: lancamento.imovelRef ?? "",
          observacao: lancamento.observacao ?? "",
        }}
        resumo={{
          id: lancamento.id,
          tipoRotulo: ROTULOS[lancamento.tipo],
          corretorNome: lancamento.corretor.nomeExibicao,
          equipeNome: lancamento.equipe.nome,
          dataFormatada: formatarDataBR(lancamento.dataReferencia),
          valorFormatado: valorCanonico === null ? null : formatarBRL(valorCanonico),
        }}
      />
    </section>
  );
}
