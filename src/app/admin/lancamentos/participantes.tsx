"use client";

import { useState } from "react";

/**
 * O elenco de uma venda compartilhada (DEC-051).
 *
 * **A ordem visual é a ordem gravada**: o primeiro da lista vira a participação
 * de ordem 1, o segundo a de ordem 2, e assim por diante — decisão do
 * proprietário. Por isso não há campo de ordem, nem arrastar, nem subir/descer:
 * a posição existe, mas não é editável em si. Os números à esquerda são só
 * indicação visual.
 *
 * Cada linha envia `participanteId`; a equipe aparece ao lado **sem `name`**,
 * como conveniência de leitura. Quem decide a equipe de cada participação é o
 * servidor, lendo a equipe atual do corretor na hora — o select desta tela lista
 * só corretores ativos de equipe ativa, mas isso é conveniência, não fronteira
 * de segurança.
 */

export type OpcaoParticipante = {
  id: string;
  nomeExibicao: string;
  nomeCompleto: string;
  equipeNome: string;
};

/** Uma participação já gravada, que a edição mostra sem permitir troca. */
export type ParticipanteRegistrado = {
  corretorId: string;
  nomeExibicao: string;
  corretorAtivo: boolean;
  equipeNome: string;
  equipeAtiva: boolean;
};

let sequencia = 0;

/** Chave estável de linha: o índice mudaria de dono ao remover do meio. */
function novaChave(): string {
  sequencia += 1;
  return `linha-${sequencia}`;
}

export function Participantes({
  corretores,
  iniciais,
  registrados = [],
  erro,
}: {
  /** Candidatos a participante **novo**: ativos, de equipe ativa. */
  corretores: OpcaoParticipante[];
  /** Ids que o servidor devolveu, para repovoar o formulário após um erro. */
  iniciais: readonly string[];
  /** Participações já gravadas — só na edição. */
  registrados?: readonly ParticipanteRegistrado[];
  erro?: string;
}) {
  const jaRegistrado = new Set(registrados.map((participante) => participante.corretorId));

  // Os registrados aparecem como linhas fixas; o estado governa só os que o
  // operador pode escolher e remover agora.
  const [linhas, setLinhas] = useState<{ chave: string; corretorId: string }[]>(() => {
    const novos = iniciais.filter((id) => !jaRegistrado.has(id));
    if (novos.length > 0) {
      return novos.map((corretorId) => ({ chave: novaChave(), corretorId }));
    }
    // Na criação começa com uma linha vazia; na edição, nenhuma — o elenco já
    // existe e acrescentar é escolha explícita.
    return registrados.length > 0 ? [] : [{ chave: novaChave(), corretorId: "" }];
  });

  const [removidos, setRemovidos] = useState<Set<string>>(new Set());

  const mantidos = registrados.filter(
    (participante) => !removidos.has(participante.corretorId),
  );
  const total = mantidos.length + linhas.filter((linha) => linha.corretorId !== "").length;

  return (
    <fieldset className="rounded-md border border-white/15 px-4 py-3">
      <legend className="px-1 text-sm text-texto-secundario">Participantes da venda</legend>

      <div className="space-y-3">
        {mantidos.map((participante, indice) => (
          <div key={participante.corretorId} className="flex items-center gap-3">
            <span className="w-5 text-right text-sm text-texto-secundario">{indice + 1}.</span>
            {/* Participação gravada: o corretor não muda de lugar. Trocar
                participante é remover este e acrescentar outro, que entra no
                final com a equipe atual dele. */}
            <input type="hidden" name="participanteId" value={participante.corretorId} />
            <p className="flex-1 rounded-md border border-white/10 bg-fundo/40 px-3 py-2 text-sm text-texto">
              {participante.nomeExibicao}
              {!participante.corretorAtivo && " (inativo)"}
              {" — "}
              {participante.equipeNome}
              {!participante.equipeAtiva && " (equipe inativa)"}
            </p>
            <button
              type="button"
              onClick={() =>
                setRemovidos((atuais) => new Set(atuais).add(participante.corretorId))
              }
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-texto-secundario hover:text-texto"
            >
              Remover
            </button>
          </div>
        ))}

        {linhas.map((linha, indice) => (
          <div key={linha.chave} className="flex items-center gap-3">
            <span className="w-5 text-right text-sm text-texto-secundario">
              {mantidos.length + indice + 1}.
            </span>
            <select
              name="participanteId"
              value={linha.corretorId}
              onChange={(evento) =>
                setLinhas((atuais) =>
                  atuais.map((candidata) =>
                    candidata.chave === linha.chave
                      ? { ...candidata, corretorId: evento.target.value }
                      : candidata,
                  ),
                )
              }
              className="flex-1 rounded-md border border-white/15 bg-fundo px-3 py-2 text-texto"
            >
              <option value="">Selecione…</option>
              {corretores
                .filter(
                  (corretor) =>
                    !jaRegistrado.has(corretor.id) ||
                    removidos.has(corretor.id) ||
                    corretor.id === linha.corretorId,
                )
                .map((corretor) => (
                  <option key={corretor.id} value={corretor.id}>
                    {corretor.nomeExibicao} — {corretor.equipeNome}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setLinhas((atuais) =>
                  atuais.filter((candidata) => candidata.chave !== linha.chave),
                )
              }
              className="rounded-md border border-white/15 px-2 py-1 text-xs text-texto-secundario hover:text-texto"
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setLinhas((atuais) => [...atuais, { chave: novaChave(), corretorId: "" }])
          }
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-texto-secundario hover:text-texto"
        >
          Adicionar participante
        </button>
        <span className="text-xs text-texto-secundario">
          o VGV é dividido em partes iguais entre os participantes
        </span>
      </div>

      {total === 0 && (
        <p className="mt-2 text-sm text-negativo">
          Uma venda precisa de pelo menos um participante.
        </p>
      )}
      {erro && <p className="mt-2 text-sm text-negativo">{erro}</p>}
    </fieldset>
  );
}
