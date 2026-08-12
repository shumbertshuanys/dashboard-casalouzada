"use client";

import { useActionState, useState } from "react";
import {
  ROTULOS_SALDO,
  ehTipoComValor,
  interpretarTipoSaldo,
  type TipoSaldoHistorico,
} from "@/lib/validacao/saldo-historico";
import { excluirSaldoHistorico, type EstadoSaldo, type ValoresSaldo } from "./acoes";

/**
 * Formulário de saldo histórico, usado para criar e para editar.
 *
 * Na criação, `tiposDisponiveis` traz só os tipos ainda sem saldo. Na edição,
 * `tipoFixo` é passado e o seletor some — o tipo de um saldo cadastrado não
 * muda.
 *
 * O campo de valor só aparece para venda: avaliação é contagem, e mostrar um
 * campo de dinheiro ali convidaria a preencher algo que o servidor descarta.
 */

const VAZIO: EstadoSaldo = {};

export type ResumoSaldo = {
  id: string;
  tipoRotulo: string;
  quantidade: number;
  valorFormatado: string | null;
  dataFormatada: string;
};

export function FormularioSaldo({
  acao,
  valoresIniciais,
  tiposDisponiveis,
  tipoFixo,
  rotuloEnvio,
  resumo,
}: {
  acao: (anterior: EstadoSaldo, form: FormData) => Promise<EstadoSaldo>;
  valoresIniciais: ValoresSaldo;
  /** Só na criação. */
  tiposDisponiveis?: TipoSaldoHistorico[];
  /** Só na edição. */
  tipoFixo?: TipoSaldoHistorico;
  rotuloEnvio: string;
  /** Só na edição: habilita a exclusão. */
  resumo?: ResumoSaldo;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  const chave = [atuais.tipo, atuais.quantidade, atuais.valorTotal, atuais.dataCorte, atuais.descricao].join("|");

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
          tiposDisponiveis={tiposDisponiveis}
          tipoFixo={tipoFixo}
        />

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
          >
            {enviando ? "Salvando…" : rotuloEnvio}
          </button>
          <a href="/admin/saldo-historico" className="text-sm text-texto-secundario hover:text-texto">
            Cancelar
          </a>
        </div>
      </form>

      {resumo && <ZonaDeExclusao resumo={resumo} />}
    </div>
  );
}

function Campos({
  atuais,
  erros,
  tiposDisponiveis,
  tipoFixo,
}: {
  atuais: ValoresSaldo;
  erros?: EstadoSaldo["erros"];
  tiposDisponiveis?: TipoSaldoHistorico[];
  tipoFixo?: TipoSaldoHistorico;
}) {
  const [tipo, setTipo] = useState(tipoFixo ?? atuais.tipo);
  const tipoAtual = tipoFixo ?? interpretarTipoSaldo(tipo);
  const pedeValor = tipoAtual !== null && ehTipoComValor(tipoAtual);

  return (
    <>
      {tipoFixo ? (
        // Na edição o tipo é só informação; não vai no `FormData`, e a action
        // usa o que está no banco de qualquer forma.
        <div>
          <span className="mb-1 block text-sm text-texto-secundario">Tipo</span>
          <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
            {ROTULOS_SALDO[tipoFixo]}
          </p>
          <span className="mt-1 block text-xs text-texto-secundario">
            o tipo de um saldo cadastrado não muda
          </span>
        </div>
      ) : (
        <Campo rotulo="Tipo" erro={erros?.tipo}>
          <select
            name="tipo"
            defaultValue={atuais.tipo}
            onChange={(evento) => setTipo(evento.target.value)}
            className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
          >
            <option value="">Selecione…</option>
            {(tiposDisponiveis ?? []).map((valor) => (
              <option key={valor} value={valor}>
                {ROTULOS_SALDO[valor]}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Quantidade acumulada" erro={erros?.quantidade}>
        <input
          name="quantidade"
          defaultValue={atuais.quantidade}
          inputMode="numeric"
          autoComplete="off"
          className="w-40 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      {pedeValor && (
        <Campo rotulo="Valor total acumulado" erro={erros?.valorTotal}>
          <input
            name="valorTotal"
            defaultValue={atuais.valorTotal}
            inputMode="decimal"
            placeholder="12.345.678,90"
            autoComplete="off"
            className="w-64 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
          />
        </Campo>
      )}

      <Campo rotulo="Data de corte" erro={erros?.dataCorte}>
        <input
          name="dataCorte"
          type="date"
          defaultValue={atuais.dataCorte}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
        <span className="mt-1 block text-xs text-texto-secundario">
          até quando este acumulado vai; os lançamentos cobrem daí em diante
        </span>
      </Campo>

      <Campo rotulo="Descrição (opcional)" erro={erros?.descricao}>
        <textarea
          name="descricao"
          defaultValue={atuais.descricao}
          rows={2}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>
    </>
  );
}

/** Exclusão vive só na edição, nunca na listagem. */
function ZonaDeExclusao({ resumo }: { resumo: ResumoSaldo }) {
  function confirmar(evento: React.FormEvent<HTMLFormElement>) {
    const linhas = [
      "Excluir este saldo histórico?",
      "",
      `Tipo: ${resumo.tipoRotulo}`,
      `Quantidade: ${resumo.quantidade}`,
      ...(resumo.valorFormatado ? [`Valor total: ${resumo.valorFormatado}`] : []),
      `Data de corte: ${resumo.dataFormatada}`,
      "",
      "O saldo de abertura será removido. Os lançamentos não são apagados.",
    ];
    if (!window.confirm(linhas.join("\n"))) evento.preventDefault();
  }

  return (
    <form action={excluirSaldoHistorico} onSubmit={confirmar} className="border-t border-white/10 pt-6">
      <input type="hidden" name="id" value={resumo.id} />
      <button
        type="submit"
        className="rounded-md border border-negativo/50 px-3 py-2 text-sm text-negativo hover:bg-negativo/10"
      >
        Excluir saldo histórico
      </button>
      <span className="ml-3 text-xs text-texto-secundario">
        o tipo volta a ficar sem saldo cadastrado
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
