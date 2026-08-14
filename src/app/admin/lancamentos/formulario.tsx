"use client";

import { useActionState, useState } from "react";
import {
  ROTULOS,
  ROTULOS_STATUS_PROPOSTA,
  STATUS_PROPOSTA,
  TIPOS,
  ehTipoMonetario,
  interpretarTipo,
} from "@/lib/validacao/lancamento";
import type { EstadoLancamento, ValoresLancamento } from "./acoes";

/**
 * Criação rápida de lançamento.
 *
 * A tela é feita para lançar vários eventos seguidos: depois de salvar, tipo e
 * data ficam, e corretor, valor e detalhes são limpos.
 *
 * A equipe aparece só como leitura — não existe input de equipe. Quem decide
 * qual equipe vai para o evento é o servidor, lendo a equipe atual do corretor
 * na hora.
 */

const VAZIO: EstadoLancamento = {};

export type OpcaoCorretor = {
  id: string;
  nomeExibicao: string;
  nomeCompleto: string;
  equipeNome: string;
  equipeAtiva: boolean;
};

export function FormularioLancamento({
  acao,
  corretores,
  valoresIniciais,
}: {
  acao: (anterior: EstadoLancamento, form: FormData) => Promise<EstadoLancamento>;
  corretores: OpcaoCorretor[];
  valoresIniciais: ValoresLancamento;
}) {
  const [estado, enviar, enviando] = useActionState(acao, VAZIO);
  const atuais = estado.valores ?? valoresIniciais;

  // Os campos vivem num filho remontado por `key` a cada retorno do servidor.
  // Tipo e corretor precisam de estado — é o tipo que decide se o campo de
  // valor aparece —, e estado não se reinicializa sozinho quando a prop muda.
  // Remontar é o mecanismo do React para isso, e é o mesmo `key` que já
  // reposiciona os campos não controlados.
  const chave = [
    atuais.tipo,
    atuais.corretorId,
    atuais.dataReferencia,
    atuais.valor,
    atuais.valorProposta,
    atuais.statusProposta,
    atuais.imovelRef,
    atuais.observacao,
  ].join("|");

  return (
    <form action={enviar} className="max-w-2xl space-y-5">
      {estado.sucesso && (
        <p className="rounded-md border border-positivo/40 px-3 py-2 text-sm text-positivo">
          {estado.sucesso}
        </p>
      )}
      {estado.mensagem && (
        <p className="rounded-md border border-negativo/40 px-3 py-2 text-sm text-negativo">
          {estado.mensagem}
        </p>
      )}

      <Campos key={chave} atuais={atuais} erros={estado.erros} corretores={corretores} />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="rounded-md bg-destaque px-4 py-2 text-sm font-medium text-fundo disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Registrar lançamento"}
        </button>
        <a href="/admin/lancamentos" className="text-sm text-texto-secundario hover:text-texto">
          Ver lançamentos
        </a>
      </div>
    </form>
  );
}

function Campos({
  atuais,
  erros,
  corretores,
}: {
  atuais: ValoresLancamento;
  erros?: EstadoLancamento["erros"];
  corretores: OpcaoCorretor[];
}) {
  const [tipo, setTipo] = useState(atuais.tipo);
  const [corretorId, setCorretorId] = useState(atuais.corretorId);

  const tipoAtual = interpretarTipo(tipo);
  const pedeValor = tipoAtual !== null && ehTipoMonetario(tipoAtual);
  const ehProposta = tipoAtual === "PROPOSTA";
  const corretorEscolhido = corretores.find((corretor) => corretor.id === corretorId);

  return (
    <>
      {/* Não controlado, como os demais campos: o valor exibido vem do
          `defaultValue`, e o estado serve só para decidir se o campo de valor
          aparece. Select controlado por estado perdia a escolha quando o
          servidor devolvia o formulário. */}
      <Campo rotulo="Tipo" erro={erros?.tipo}>
        <select
          name="tipo"
          defaultValue={atuais.tipo}
          onChange={(evento) => setTipo(evento.target.value)}
          className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        >
          <option value="">Selecione…</option>
          {TIPOS.map((valor) => (
            <option key={valor} value={valor}>
              {ROTULOS[valor]}
            </option>
          ))}
        </select>
      </Campo>

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

      {/* Somente leitura, e sem `name`: a equipe não é enviada. */}
      <div>
        <span className="mb-1 block text-sm text-texto-secundario">Equipe do lançamento</span>
        <p className="rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
          {corretorEscolhido
            ? `${corretorEscolhido.equipeNome}${corretorEscolhido.equipeAtiva ? "" : " (desativada)"}`
            : "—"}
        </p>
        <span className="mt-1 block text-xs text-texto-secundario">
          é a equipe atual do corretor e fica gravada neste lançamento
        </span>
      </div>

      <Campo rotulo="Data do lançamento" erro={erros?.dataReferencia}>
        <input
          name="dataReferencia"
          type="date"
          defaultValue={atuais.dataReferencia}
          className="rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
        />
      </Campo>

      {pedeValor && (
        <Campo rotulo="Valor" erro={erros?.valor}>
          <input
            name="valor"
            defaultValue={atuais.valor}
            inputMode="decimal"
            placeholder="1.250.000,00"
            autoComplete="off"
            className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
          />
        </Campo>
      )}

      {/* Em PROPOSTA o imóvel é obrigatório e sobe para a área principal, junto
          do status e do valor próprio da proposta — que não é VGV (DEC-053).
          O input de imóvel dos "Detalhes" some para não duplicar o `name`. */}
      {ehProposta && (
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

          <Campo rotulo="Status da proposta" erro={erros?.statusProposta}>
            <select
              name="statusProposta"
              defaultValue={atuais.statusProposta || "AGUARDANDO"}
              className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            >
              {STATUS_PROPOSTA.map((status) => (
                <option key={status} value={status}>
                  {ROTULOS_STATUS_PROPOSTA[status]}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Valor da proposta (opcional)" erro={erros?.valorProposta}>
            <input
              name="valorProposta"
              defaultValue={atuais.valorProposta}
              inputMode="decimal"
              placeholder="450.000,00"
              autoComplete="off"
              className="w-56 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            />
            <span className="mt-1 block text-xs text-texto-secundario">
              informativo; não entra no VGV
            </span>
          </Campo>
        </>
      )}

      <details className="rounded-md border border-white/10 px-3 py-2">
        <summary className="cursor-pointer text-sm text-texto-secundario">
          Detalhes (opcional)
        </summary>
        <div className="mt-4 space-y-4">
          {!ehProposta && (
            <Campo rotulo="Imóvel" erro={erros?.imovelRef}>
              <input
                name="imovelRef"
                defaultValue={atuais.imovelRef}
                autoComplete="off"
                placeholder="código ou endereço"
                className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
              />
            </Campo>
          )}
          <Campo rotulo="Observação" erro={erros?.observacao}>
            <textarea
              name="observacao"
              defaultValue={atuais.observacao}
              rows={2}
              className="w-full rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            />
          </Campo>
        </div>
      </details>
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
