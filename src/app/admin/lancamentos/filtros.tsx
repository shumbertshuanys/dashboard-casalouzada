import Link from "next/link";
import { deDataCivil } from "@/lib/datas";
import { ROTULOS, TIPOS, type FiltrosLancamentos } from "@/lib/validacao/lancamento";

/**
 * Barra de filtros da listagem. É um `<form method="get">`, sem estado no
 * cliente — o filtro vive na URL, então o link é compartilhável e o botão
 * "voltar" do navegador funciona.
 *
 * Os seletores trazem **todos** os corretores e **todas** as equipes, ativos e
 * inativos: o histórico não pode sumir porque alguém saiu ou porque uma equipe
 * foi encerrada.
 */

export type OpcaoFiltro = { id: string; rotulo: string };

export function FiltrosLancamento({
  filtros,
  corretores,
  equipes,
}: {
  filtros: FiltrosLancamentos;
  corretores: OpcaoFiltro[];
  equipes: OpcaoFiltro[];
}) {
  return (
    <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
      <Campo rotulo="De">
        <input
          type="date"
          name="de"
          defaultValue={filtros.de ? deDataCivil(filtros.de) : ""}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
        />
      </Campo>

      <Campo rotulo="Até">
        <input
          type="date"
          name="ate"
          defaultValue={filtros.ate ? deDataCivil(filtros.ate) : ""}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
        />
      </Campo>

      <Campo rotulo="Tipo">
        <select
          name="tipo"
          defaultValue={filtros.tipo ?? ""}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
        >
          <option value="">Todos</option>
          {TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {ROTULOS[tipo]}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Corretor">
        <select
          name="corretor"
          defaultValue={filtros.corretorId ?? ""}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
        >
          <option value="">Todos</option>
          {corretores.map((corretor) => (
            <option key={corretor.id} value={corretor.id}>
              {corretor.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Equipe">
        <select
          name="equipe"
          defaultValue={filtros.equipeId ?? ""}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-sm text-texto"
        >
          <option value="">Todas</option>
          {equipes.map((equipe) => (
            <option key={equipe.id} value={equipe.id}>
              {equipe.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      <button
        type="submit"
        className="rounded-md border border-white/15 px-3 py-2 text-sm text-texto-secundario hover:text-texto"
      >
        Filtrar
      </button>
      <Link href="/admin/lancamentos" className="pb-2 text-sm text-texto-secundario hover:text-texto">
        Limpar
      </Link>
    </form>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-texto-secundario">{rotulo}</span>
      {children}
    </label>
  );
}
