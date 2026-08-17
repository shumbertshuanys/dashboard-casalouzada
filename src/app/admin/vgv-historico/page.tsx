import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import { competenciaBR, competenciaISO } from "./competencia";

export const metadata: Metadata = {
  title: "VGV histórico — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * VGV histórico mensal — o total consolidado de meses já fechados.
 *
 * Existe para o escritório registrar o que apurava antes do sistema, mês a mês,
 * sem ter de cadastrar centenas de vendas antigas uma a uma. Ele entra **só** no
 * VGV trimestral e anual; o mês corrente, os acumulados, o quadro mensal e todos
 * os números de equipe continuam vindo exclusivamente das VENDA reais.
 *
 * Sem paginação, busca ou filtro: são poucos meses, e a lista inteira cabe na
 * tela.
 */

export default async function PaginaVgvHistorico() {
  await exigirAdministradorAtivo();

  const registros = await prisma.vgvHistoricoMensal.findMany({
    orderBy: { competencia: "desc" },
    select: { id: true, competencia: true, valorTotal: true, observacao: true },
  });

  // Sobreposição com vendas reais: informação, nunca bloqueio. A contagem sai
  // das próprias datas de referência, agrupadas em memória — o volume é o mesmo
  // que `metricas-prisma.ts` já lê a cada pintura do painel, e evita SQL cru só
  // para um aviso de tela.
  const vendas = await prisma.lancamento.findMany({
    where: { tipo: "VENDA" },
    select: { dataReferencia: true },
  });

  const vendasPorMes = new Map<string, number>();
  for (const venda of vendas) {
    const chave = competenciaISO(venda.dataReferencia);
    vendasPorMes.set(chave, (vendasPorMes.get(chave) ?? 0) + 1);
  }

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">VGV histórico</h2>
          <p className="text-sm text-texto-secundario">
            total consolidado por mês fechado, anterior ao sistema
          </p>
        </div>
        <Link
          href="/admin/vgv-historico/novo"
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
        >
          Cadastrar competência
        </Link>
      </div>

      {registros.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Nenhuma competência cadastrada. Enquanto não houver, o VGV trimestral e o anual
          somam apenas as vendas lançadas no sistema.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-texto-secundario">
                <th className="py-2 pr-4 font-medium">Competência</th>
                <th className="py-2 pr-4 font-medium">VGV total</th>
                <th className="py-2 pr-4 font-medium">Vendas no mês</th>
                <th className="py-2 pr-4 font-medium">Observação</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => {
                const chave = competenciaISO(registro.competencia);
                const vendasDoMes = vendasPorMes.get(chave) ?? 0;

                return (
                  <tr key={registro.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 whitespace-nowrap text-texto">
                      {competenciaBR(registro.competencia)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                      {/* `toFixed(2)`: o Decimal do Prisma corta zeros à direita. */}
                      {formatarBRL(registro.valorTotal.toFixed(2))}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                      {vendasDoMes === 0 ? "—" : vendasDoMes}
                    </td>
                    <td className="py-3 pr-4 max-w-xs truncate text-texto-secundario">
                      {registro.observacao ?? "—"}
                    </td>
                    <td className="py-3">
                      {/* Só editar; excluir vive na tela de edição. */}
                      <Link
                        href={`/admin/vgv-historico/${registro.id}/editar`}
                        className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-texto-secundario">
        O VGV histórico entra apenas no trimestre e no ano; nunca no mês corrente, nos
        acumulados, em Vendidos ou em ranking. Quando um mês tem competência cadastrada, as
        vendas daquele mês deixam de ser somadas de novo ali — elas continuam contando em
        tudo o mais.
      </p>
    </section>
  );
}
