"use client";

import { useActionState } from "react";
import {
  excluirVgvHistorico,
  type EstadoVgvHistorico,
  type ValoresVgvHistorico,
} from "./acoes";

/**
 * Formulário do VGV histórico mensal, usado para criar e para editar.
 *
 * Na edição, `competenciaFixa` é passada e o campo de mês some — a competência
 * de um agregado cadastrado não muda, e o servidor usa a do banco de qualquer
 * forma. É o mesmo arranjo do `tipoFixo` em `saldo-historico/formulario.tsx`.
 */

const VAZIO: EstadoVgvHistorico = {};

export type ResumoVgvHistorico = {
  id: string;
  competenciaRotulo: string;
  valorFormatado: string;
};

export function FormularioVgvHistorico({
  acao,
  valoresIniciais,
  competenciaFixa,
  rotuloEnvio,
  resumo,
  vendasNaCompetencia,
}: {
  acao: (anterior: EstadoVgvHistorico, form: FormData) => Promise<EstadoVgvHistorico>;
  valoresIniciais: ValoresVgvHistorico;
  /** Só na edição: `MM/AAAA` já formatado. */
  competenciaFixa?: string;
  rotuloEnvio: string;
  /** Só na edição: habilita a exclusão. */
  resumo?: ResumoVgvHistorico;
  /** Só na edição: quantas VENDA reais existem no mês. Informativo. */
  vendasNaCompetencia?: number;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  const chave = [atuais.competencia, atuais.valorTotal, atuais.observacao].join("|");

  return (
    <div className="max-w-xl space-y-8">
      <form action={enviar} className="space-y-5">
        {estado.mensagem && (
          <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
            {estado.mensagem}
          </p>
        )}

        <Campos
          key={chave}
          atuais={atuais}
          erros={estado.erros}
          competenciaFixa={competenciaFixa}
        />

        {vendasNaCompetencia !== undefined && vendasNaCompetencia > 0 && (
          <AvisoSobreposicao quantidade={vendasNaCompetencia} />
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
          >
            {enviando ? "Salvando…" : rotuloEnvio}
          </button>
          <a href="/admin/vgv-historico" className="text-sm text-texto-secundario hover:text-texto">
            Cancelar
          </a>
        </div>
      </form>

      {resumo && <ZonaDeExclusao resumo={resumo} />}
    </div>
  );
}

/**
 * Sobreposição com vendas reais: informação, nunca bloqueio.
 *
 * Cadastrar o agregado de um mês que também tem VENDA lançada é legítimo — o
 * relatório consolidado costuma já conter aquelas vendas. O que muda é só que
 * elas param de somar **de novo** no trimestre e no ano; em ranking, contagem e
 * VGV de equipe elas continuam exatamente como estavam.
 */
function AvisoSobreposicao({ quantidade }: { quantidade: number }) {
  const plural = quantidade === 1 ? "venda cadastrada" : "vendas cadastradas";

  return (
    <p className="rounded-md border border-white/15 bg-fundo/40 px-3 py-2 text-xs text-texto-secundario">
      Existem <strong className="text-texto">{quantidade}</strong> {plural} nesta competência.
      Elas continuam em rankings e contagens, mas seus valores não são somados novamente ao
      VGV trimestral/anual.
    </p>
  );
}

function Campos({
  atuais,
  erros,
  competenciaFixa,
}: {
  atuais: ValoresVgvHistorico;
  erros?: EstadoVgvHistorico["erros"];
  competenciaFixa?: string;
}) {
  return (
    <>
      {competenciaFixa ? (
        // Na edição a competência é só informação; não vai no `FormData`, e a
        // action usa a do banco de qualquer forma.
        <div>
          <span className="mb-1 block text-sm text-texto-secundario">Competência</span>
          <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
            {competenciaFixa}
          </p>
          <span className="mt-1 block text-xs text-texto-secundario">
            a competência de um registro cadastrado não muda
          </span>
        </div>
      ) : (
        <Campo rotulo="Competência" erro={erros?.competencia}>
          <input
            name="competencia"
            type="month"
            defaultValue={atuais.competencia}
            className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
          />
          <span className="mt-1 block text-xs text-texto-secundario">
            somente um mês já encerrado; o mês corrente ainda está acontecendo
          </span>
        </Campo>
      )}

      <Campo rotulo="VGV total do mês" erro={erros?.valorTotal}>
        <input
          name="valorTotal"
          defaultValue={atuais.valorTotal}
          inputMode="decimal"
          placeholder="8.000.000,00"
          autoComplete="off"
          className="w-64 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
        <span className="mt-1 block text-xs text-texto-secundario">
          só valor de imóveis vendidos — sem locação, comissão ou honorário
        </span>
      </Campo>

      <Campo rotulo="Observação (opcional)" erro={erros?.observacao}>
        <textarea
          name="observacao"
          defaultValue={atuais.observacao}
          rows={2}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>
    </>
  );
}

/** Exclusão vive só na edição, nunca na listagem. */
function ZonaDeExclusao({ resumo }: { resumo: ResumoVgvHistorico }) {
  function confirmar(evento: React.FormEvent<HTMLFormElement>) {
    const linhas = [
      "Excluir este VGV histórico?",
      "",
      `Competência: ${resumo.competenciaRotulo}`,
      `VGV total: ${resumo.valorFormatado}`,
      "",
      "O mês volta a ser calculado apenas pelas vendas reais cadastradas.",
      "Nenhum lançamento é apagado.",
    ];
    if (!window.confirm(linhas.join("\n"))) evento.preventDefault();
  }

  return (
    <form
      action={excluirVgvHistorico}
      onSubmit={confirmar}
      className="border-t border-white/10 pt-6"
    >
      <input type="hidden" name="id" value={resumo.id} />
      <button
        type="submit"
        className="rounded-md border border-negativo/50 px-3 py-2 text-sm text-negativo hover:bg-negativo/10"
      >
        Excluir VGV histórico
      </button>
      <span className="ml-3 text-xs text-texto-secundario">
        o mês volta a contar só as vendas reais
      </span>
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
