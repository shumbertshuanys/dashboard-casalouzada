import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { deDataCivil, formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import {
  ROTULOS_SALDO,
  ehIdSaldoHistoricoValido,
  ehTipoComValor,
  interpretarTipoSaldo,
} from "@/lib/validacao/saldo-historico";
import { editarSaldoHistorico, type EstadoSaldo } from "../../acoes";
import { FormularioSaldo } from "../../formulario";

export const metadata: Metadata = {
  title: "Editar saldo histórico — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaEditarSaldo({
  params,
}: PageProps<"/admin/saldo-historico/[id]/editar">) {
  await exigirAdministradorAtivo();

  const { id } = await params;
  if (!ehIdSaldoHistoricoValido(id)) notFound();

  const saldo = await prisma.saldoHistorico.findUnique({
    where: { id },
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      valorTotal: true,
      dataCorte: true,
      descricao: true,
    },
  });
  if (!saldo) notFound();

  // Um saldo de tipo fora dos dois suportados não deveria existir; se
  // existisse, esta tela não saberia editá-lo com segurança.
  const tipo = interpretarTipoSaldo(saldo.tipo);
  if (tipo === null) notFound();

  // `toFixed(2)`: o Decimal do Prisma corta zeros à direita.
  const valorCanonico = saldo.valorTotal.toFixed(2);

  async function salvar(anterior: EstadoSaldo, form: FormData): Promise<EstadoSaldo> {
    "use server";
    return editarSaldoHistorico(saldo!.id, anterior, form);
  }

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Editar saldo histórico</h2>
        <p className="text-sm text-texto-secundario">{ROTULOS_SALDO[tipo]}</p>
      </div>

      <FormularioSaldo
        acao={salvar}
        tipoFixo={tipo}
        rotuloEnvio="Salvar alterações"
        valoresIniciais={{
          tipo,
          quantidade: String(saldo.quantidade),
          valorTotal: ehTipoComValor(tipo) ? valorCanonico : "",
          dataCorte: deDataCivil(saldo.dataCorte),
          descricao: saldo.descricao ?? "",
        }}
        resumo={{
          id: saldo.id,
          tipoRotulo: ROTULOS_SALDO[tipo],
          quantidade: saldo.quantidade,
          valorFormatado: ehTipoComValor(tipo) ? formatarBRL(valorCanonico) : null,
          dataFormatada: formatarDataBR(saldo.dataCorte),
        }}
      />
    </section>
  );
}
