"use client";

import { useActionState } from "react";
import type { EstadoEquipe } from "./acoes";

/**
 * Formulário de equipe, usado tanto para criar quanto para editar.
 *
 * Sem biblioteca de formulário: `FormData` cru e `useActionState` para receber
 * de volta os erros que o servidor apurou. Os campos ficam preenchidos com
 * `defaultValue` — não são controlados, então nada aqui precisa de estado.
 */

const VAZIO: EstadoEquipe = {};

export type ValoresEquipe = {
  nome: string;
  gerenteNome: string;
  ordemExibicao: number | "";
};

export function FormularioEquipe({
  acao,
  valores,
  rotuloEnvio,
}: {
  acao: (anterior: EstadoEquipe, form: FormData) => Promise<EstadoEquipe>;
  valores: ValoresEquipe;
  rotuloEnvio: string;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);

  // Depois de um erro os campos voltam com o que foi digitado, não com o valor
  // original: a pessoa corrige o que errou em vez de recomeçar. A `key` força o
  // React a recriar os inputs, senão o `defaultValue` novo seria ignorado.
  const atuais = estado.valores ?? {
    nome: valores.nome,
    gerenteNome: valores.gerenteNome,
    ordemExibicao: String(valores.ordemExibicao),
  };

  return (
    <form action={enviar} className="max-w-xl space-y-5">
      {estado.mensagem && (
        <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
          {estado.mensagem}
        </p>
      )}

      <Campo rotulo="Nome da equipe" erro={estado.erros?.nome}>
        <input
          key={atuais.nome}
          name="nome"
          defaultValue={atuais.nome}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="Gerente" erro={estado.erros?.gerenteNome}>
        <input
          key={atuais.gerenteNome}
          name="gerenteNome"
          defaultValue={atuais.gerenteNome}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="Ordem de exibição" erro={estado.erros?.ordemExibicao}>
        <input
          key={atuais.ordemExibicao}
          name="ordemExibicao"
          defaultValue={atuais.ordemExibicao}
          inputMode="numeric"
          className="w-32 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
        <span className="ml-2 text-xs text-texto-secundario">
          posição do quadro no painel, começando em 1
        </span>
      </Campo>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          {enviando ? "Salvando…" : rotuloEnvio}
        </button>
        <a href="/admin/equipes" className="text-sm text-texto-secundario hover:text-texto">
          Cancelar
        </a>
      </div>
    </form>
  );
}

function Campo({
  rotulo,
  erro,
  children,
}: {
  rotulo: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-texto-secundario">{rotulo}</span>
      {children}
      {erro && <span className="mt-1 block text-sm text-negativo">{erro}</span>}
    </label>
  );
}
