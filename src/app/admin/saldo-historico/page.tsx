import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { formatarDataBR } from "@/lib/datas";
import { formatarBRL } from "@/lib/dinheiro";
import { prisma } from "@/lib/db";
import {
  ROTULOS_SALDO,
  TIPOS_SALDO_HISTORICO,
  ehTipoComValor,
} from "@/lib/validacao/saldo-historico";

export const metadata: Metadata = {
  title: "Saldo histórico — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * Saldo histórico — saldo de abertura dos big numbers.
 *
 * A tela mostra os dois tipos suportados sempre, cadastrados ou não. Um tipo
 * sem linha aparece como **Não cadastrado**, e não como zero: nunca ter
 * apurado um acumulado é diferente de ter apurado e dado zero. Nenhuma linha é
 * criada automaticamente.
 *
 * Sem totalizador: somar saldo com lançamento é da Fase 3.
 */
export default async function PaginaSaldoHistorico() {
  await exigirAdministradorAtivo();

  const cadastrados = await prisma.saldoHistorico.findMany({
    where: { tipo: { in: [...TIPOS_SALDO_HISTORICO] } },
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      valorTotal: true,
      dataCorte: true,
      descricao: true,
    },
  });

  const porTipo = new Map(cadastrados.map((saldo) => [saldo.tipo, saldo]));
  const faltando = TIPOS_SALDO_HISTORICO.filter((tipo) => !porTipo.has(tipo));

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-texto">Saldo histórico</h2>
          <p className="text-sm text-texto-secundario">
            acumulado anterior ao sistema, por tipo
          </p>
        </div>
        {faltando.length > 0 && (
          <Link
            href="/admin/saldo-historico/novo"
            className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo"
          >
            Cadastrar saldo
          </Link>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-texto-secundario">
              <th className="py-2 pr-4 font-medium">Tipo</th>
              <th className="py-2 pr-4 font-medium">Quantidade</th>
              <th className="py-2 pr-4 font-medium">Valor total</th>
              <th className="py-2 pr-4 font-medium">Data de corte</th>
              <th className="py-2 pr-4 font-medium">Descrição</th>
              <th className="py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_SALDO_HISTORICO.map((tipo) => {
              const saldo = porTipo.get(tipo);

              if (!saldo) {
                return (
                  <tr key={tipo} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-texto">{ROTULOS_SALDO[tipo]}</td>
                    <td className="py-3 pr-4 text-texto-secundario" colSpan={4}>
                      Não cadastrado
                    </td>
                    <td className="py-3">
                      <Link
                        href="/admin/saldo-historico/novo"
                        className="text-texto-secundario underline-offset-4 hover:text-texto hover:underline"
                      >
                        Cadastrar
                      </Link>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={tipo} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-texto">{ROTULOS_SALDO[tipo]}</td>
                  <td className="py-3 pr-4 text-texto-secundario">{saldo.quantidade}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {/* Avaliação é contagem: mostrar R$ 0,00 aqui sugeriria um
                        acumulado financeiro que não existe. */}
                    {ehTipoComValor(tipo) ? formatarBRL(saldo.valorTotal.toFixed(2)) : "não se aplica"}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-texto-secundario">
                    {formatarDataBR(saldo.dataCorte)}
                  </td>
                  <td className="py-3 pr-4 max-w-xs truncate text-texto-secundario">
                    {saldo.descricao ?? "—"}
                  </td>
                  <td className="py-3">
                    {/* Só editar; excluir vive na tela de edição. */}
                    <Link
                      href={`/admin/saldo-historico/${saldo.id}/editar`}
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

      <p className="mt-6 text-xs text-texto-secundario">
        O saldo histórico entra apenas nos acumulados; nunca em mês, trimestre, ano ou ranking.
        Um tipo sem saldo cadastrado não é o mesmo que saldo zero.
      </p>
    </section>
  );
}
