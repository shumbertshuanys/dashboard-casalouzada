"use client";

import { useActionState, useState } from "react";
import {
  ROTULOS_STATUS_RESERVA,
  STATUS_RESERVA_LOCACAO,
} from "@/lib/validacao/reserva-locacao";
import type { EstadoReserva, ValoresReserva } from "./acoes";

/**
 * Formulários de reserva de locação.
 *
 * Criação e edição são componentes separados porque os contratos divergem:
 *
 * - na criação, o operador escolhe o corretor e **não existe** campo de
 *   status — toda reserva nasce ATIVA, e a equipe mostrada é só conveniência
 *   visual (não tem `name`, não é enviada);
 * - na edição, corretor e equipe são somente leitura — o snapshot é imutável —
 *   e o status é editável entre os três estados.
 *
 * Não há exclusão: CANCELADA é o estado de uma reserva que deixou de valer.
 */

const VAZIO: EstadoReserva = {};

export type OpcaoCorretorReserva = {
  id: string;
  nomeExibicao: string;
  nomeCompleto: string;
  equipeNome: string;
};

export function FormularioNovaReserva({
  acao,
  corretores,
  valoresIniciais,
}: {
  acao: (anterior: EstadoReserva, form: FormData) => Promise<EstadoReserva>;
  corretores: OpcaoCorretorReserva[];
  valoresIniciais: ValoresReserva;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  // Campos não controlados remontados por `key` a cada retorno do servidor,
  // como nos demais formulários do admin.
  const chave = [
    atuais.corretorId,
    atuais.imovelRef,
    atuais.dataReferencia,
    atuais.observacao,
  ].join("|");

  return (
    <form action={enviar} className="max-w-2xl space-y-5">
      {estado.mensagem && (
        <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
          {estado.mensagem}
        </p>
      )}

      <CamposCriacao key={chave} atuais={atuais} erros={estado.erros} corretores={corretores} />

      <p className="text-xs text-texto-secundario">Nova reserva é criada como Ativa.</p>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Registrar reserva"}
        </button>
        <a href="/admin/reservas-locacao" className="text-sm text-texto-secundario hover:text-texto">
          Cancelar
        </a>
      </div>
    </form>
  );
}

function CamposCriacao({
  atuais,
  erros,
  corretores,
}: {
  atuais: ValoresReserva;
  erros?: EstadoReserva["erros"];
  corretores: OpcaoCorretorReserva[];
}) {
  const [corretorId, setCorretorId] = useState(atuais.corretorId);
  const corretorEscolhido = corretores.find((corretor) => corretor.id === corretorId);

  return (
    <>
      <Campo rotulo="Corretor" erro={erros?.corretorId}>
        <select
          name="corretorId"
          defaultValue={atuais.corretorId}
          onChange={(evento) => setCorretorId(evento.target.value)}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        >
          <option value="">Selecione…</option>
          {corretores.map((corretor) => (
            <option key={corretor.id} value={corretor.id}>
              {corretor.nomeExibicao} — {corretor.nomeCompleto}
            </option>
          ))}
        </select>
      </Campo>

      {/* Somente leitura, e sem `name`: a equipe não é enviada. Quem grava o
          snapshot é o servidor, lendo a equipe atual do corretor na hora. */}
      <div>
        <span className="mb-1 block text-sm text-texto-secundario">Equipe da reserva</span>
        <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
          {corretorEscolhido ? corretorEscolhido.equipeNome : "—"}
        </p>
        <span className="mt-1 block text-xs text-texto-secundario">
          é a equipe atual do corretor e fica gravada nesta reserva
        </span>
      </div>

      <CamposComuns atuais={atuais} erros={erros} />
    </>
  );
}

export type ResumoReservaEdicao = {
  corretorNome: string;
  corretorAtivo: boolean;
  equipeNome: string;
  equipeAtiva: boolean;
};

export function FormularioEdicaoReserva({
  acao,
  valoresIniciais,
  resumo,
}: {
  acao: (anterior: EstadoReserva, form: FormData) => Promise<EstadoReserva>;
  valoresIniciais: ValoresReserva;
  resumo: ResumoReservaEdicao;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  const chave = [atuais.status, atuais.imovelRef, atuais.dataReferencia, atuais.observacao].join("|");

  return (
    <form action={enviar} className="max-w-2xl space-y-5">
      {estado.mensagem && (
        <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
          {estado.mensagem}
        </p>
      )}

      {/* Somente leitura, sem `name`: a action não lê corretor nem equipe, e o
          snapshot não muda mesmo que os dois estejam hoje inativos — a reserva
          continua editável para finalizar, cancelar ou corrigir. */}
      <div>
        <span className="mb-1 block text-sm text-texto-secundario">Corretor</span>
        <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
          {resumo.corretorNome}
          {!resumo.corretorAtivo && " (inativo)"}
        </p>
      </div>

      <div>
        <span className="mb-1 block text-sm text-texto-secundario">Equipe da reserva</span>
        <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
          {resumo.equipeNome}
          {!resumo.equipeAtiva && " (desativada)"}
        </p>
        <span className="mt-1 block text-xs text-texto-secundario">
          equipe do momento da criação; não muda na edição
        </span>
      </div>

      <CamposEdicao key={chave} atuais={atuais} erros={estado.erros} />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Salvar alterações"}
        </button>
        <a href="/admin/reservas-locacao" className="text-sm text-texto-secundario hover:text-texto">
          Cancelar
        </a>
      </div>
    </form>
  );
}

function CamposEdicao({
  atuais,
  erros,
}: {
  atuais: ValoresReserva;
  erros?: EstadoReserva["erros"];
}) {
  return (
    <>
      <Campo rotulo="Status" erro={erros?.status}>
        <select
          name="status"
          defaultValue={atuais.status}
          className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        >
          {STATUS_RESERVA_LOCACAO.map((status) => (
            <option key={status} value={status}>
              {ROTULOS_STATUS_RESERVA[status]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-texto-secundario">
          finalizar a reserva não registra a locação — lance a locação separadamente
        </span>
      </Campo>

      <CamposComuns atuais={atuais} erros={erros} />
    </>
  );
}

/** Imóvel, data e observação — iguais nos dois contratos. */
function CamposComuns({
  atuais,
  erros,
}: {
  atuais: ValoresReserva;
  erros?: EstadoReserva["erros"];
}) {
  return (
    <>
      <Campo rotulo="Imóvel" erro={erros?.imovelRef}>
        <input
          name="imovelRef"
          defaultValue={atuais.imovelRef}
          autoComplete="off"
          placeholder="código ou endereço"
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      <Campo rotulo="Data da reserva" erro={erros?.dataReferencia}>
        <input
          name="dataReferencia"
          type="date"
          defaultValue={atuais.dataReferencia}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
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
