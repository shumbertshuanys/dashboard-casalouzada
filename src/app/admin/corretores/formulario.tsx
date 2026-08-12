"use client";

import { useActionState, useState } from "react";
import type { EstadoCorretor, ValoresEnviados } from "./acoes";

/**
 * Formulário de corretor, compartilhado entre criar e editar.
 *
 * Sem biblioteca: `FormData` e `useActionState`. Os campos são não controlados
 * e voltam com o que foi digitado quando a validação falha.
 */

const VAZIO: EstadoCorretor = {};

export type OpcaoEquipe = {
  id: string;
  nome: string;
  /** Só a equipe atual de um corretor pode aparecer inativa. */
  ativa: boolean;
};

export function FormularioCorretor({
  acao,
  valores,
  equipes,
  rotuloEnvio,
  equipeOriginalId,
}: {
  acao: (anterior: EstadoCorretor, form: FormData) => Promise<EstadoCorretor>;
  valores: ValoresEnviados;
  equipes: OpcaoEquipe[];
  rotuloEnvio: string;
  /** Presente só na edição; dispara a confirmação de troca. */
  equipeOriginalId?: string;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valores;

  // Como os demais campos: não controlado, com `key` para remontar quando o
  // servidor devolve o que foi digitado. Um `<select>` controlado por
  // `useState` perderia a escolha depois de um erro, porque o valor inicial do
  // `useState` só vale na primeira renderização.
  const [equipeEscolhida, setEquipeEscolhida] = useState(atuais.equipeId);

  const trocandoDeEquipe =
    equipeOriginalId !== undefined &&
    equipeEscolhida !== "" &&
    equipeEscolhida !== equipeOriginalId;

  /**
   * Confirmação é UX; a integridade de verdade está no servidor, que nunca
   * reescreve lançamento por causa de troca de equipe.
   *
   * A equipe é lida do próprio formulário, não do estado: assim a confirmação
   * não depende de o `onChange` ter passado por aqui.
   */
  function confirmarTroca(evento: React.FormEvent<HTMLFormElement>) {
    if (equipeOriginalId === undefined) return;

    const escolhida = new FormData(evento.currentTarget).get("equipeId");
    if (typeof escolhida !== "string" || escolhida === "" || escolhida === equipeOriginalId) {
      return;
    }

    const segue = window.confirm(
      "Trocar a equipe deste corretor?\n\n" +
        "Os lançamentos anteriores continuarão creditados à equipe anterior. " +
        "Apenas os próximos lançamentos usarão a nova equipe.",
    );
    if (!segue) evento.preventDefault();
  }

  return (
    <form action={enviar} onSubmit={confirmarTroca} className="max-w-xl space-y-5">
      {estado.mensagem && (
        <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
          {estado.mensagem}
        </p>
      )}

      <Campo rotulo="Nome completo" erro={estado.erros?.nomeCompleto}>
        <input
          key={atuais.nomeCompleto}
          name="nomeCompleto"
          defaultValue={atuais.nomeCompleto}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="Nome de exibição" erro={estado.erros?.nomeExibicao}>
        <input
          key={atuais.nomeExibicao}
          name="nomeExibicao"
          defaultValue={atuais.nomeExibicao}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
        <span className="mt-1 block text-xs text-texto-secundario">
          como aparece na TV — nomes curtos leem melhor à distância
        </span>
      </Campo>

      <Campo rotulo="Equipe" erro={estado.erros?.equipeId}>
        <select
          key={atuais.equipeId}
          name="equipeId"
          defaultValue={atuais.equipeId}
          onChange={(evento) => setEquipeEscolhida(evento.target.value)}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        >
          <option value="">Selecione…</option>
          {equipes.map((equipe) => (
            <option key={equipe.id} value={equipe.id}>
              {equipe.ativa ? equipe.nome : `${equipe.nome} (inativa)`}
            </option>
          ))}
        </select>
        {trocandoDeEquipe && (
          <span className="mt-1 block text-xs text-destaque">
            Os lançamentos anteriores continuam creditados à equipe anterior.
          </span>
        )}
      </Campo>

      <Campo rotulo="CRECI (opcional)" erro={estado.erros?.creci}>
        <input
          key={atuais.creci}
          name="creci"
          defaultValue={atuais.creci}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="Data de entrada (opcional)" erro={estado.erros?.dataEntrada}>
        <input
          key={atuais.dataEntrada}
          name="dataEntrada"
          type="date"
          defaultValue={atuais.dataEntrada}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="URL da foto (opcional)" erro={estado.erros?.fotoUrl}>
        <input
          key={atuais.fotoUrl}
          name="fotoUrl"
          defaultValue={atuais.fotoUrl}
          autoComplete="off"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          {enviando ? "Salvando…" : rotuloEnvio}
        </button>
        <a href="/admin/corretores" className="text-sm text-texto-secundario hover:text-texto">
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
