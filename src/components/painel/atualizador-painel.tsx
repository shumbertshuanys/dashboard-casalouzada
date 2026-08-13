"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { LeituraPainel } from "@/lib/contrato-atualizacao-painel";
import {
  aplicarPayloadAtualizacao,
  comporApresentacao,
  estadoInicial,
  idadeExibida,
} from "@/lib/retencao-painel";
import { PainelVisual } from "./painel-visual";

/** Um minuto entre leituras — o painel é de acompanhamento, não de pregão. */
const INTERVALO_MS = 60_000;

/** Um quarto do intervalo: uma tentativa nunca alcança a seguinte. */
const TEMPO_LIMITE_MS = 15_000;

/**
 * O que mantém a TV viva: uma leitura por minuto, sem recarregar a página.
 *
 * A primeira pintura vem do servidor, em `inicial` — a tela nunca começa vazia
 * nem piscando. Daí em diante este componente pede `/painel/[token]/dados`,
 * valida o que voltou e entrega ao reducer de retenção, que decide o que fica.
 *
 * **Nenhum caminho de falha mexe no estado.** Rede caída, timeout, status
 * diferente de 200, JSON corrompido ou payload fora do contrato: todos saem por
 * `return` sem tocar em `setEstado`, e a parede continua mostrando o último valor
 * conhecido (DEC-014). O oposto — zerar ou trocar por `—` — transformaria uma
 * falha de rede em informação falsa sobre o desempenho de alguém.
 *
 * O token **não** é prop: ele já está na URL que o navegador abriu, e passá-lo
 * como propriedade de componente cliente o colocaria também no payload de
 * hidratação. `useParams` lê o mesmo valor sem essa duplicação, e ele só é usado
 * para montar o caminho da requisição — nunca em estado, storage ou log.
 */
export function AtualizadorPainel({ inicial }: { inicial: LeituraPainel }) {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState(() => estadoInicial(inicial));

  // Uma requisição por vez. Sem isto, uma resposta lenta poderia voltar depois de
  // uma rápida e reescrever a tela com dado mais velho.
  const emVoo = useRef(false);

  useEffect(() => {
    let ativo = true;

    async function atualizar() {
      if (emVoo.current) return;
      emVoo.current = true;

      try {
        const resposta = await fetch(`/painel/${encodeURIComponent(token)}/dados`, {
          cache: "no-store",
          // A TV não pode ficar presa numa conexão pendurada: passados 15s, a
          // tentativa é abandonada e a próxima acontece no ciclo seguinte.
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });

        if (!resposta.ok) return;

        const json = await resposta.json();
        if (!ativo) return;

        setEstado((anterior) => aplicarPayloadAtualizacao(anterior, json));
      } catch {
        // Sem detalhe: a URL carrega o token e o erro bruto pode carregar a URL.
        console.warn("Atualização automática do painel falhou.");
      } finally {
        emVoo.current = false;
      }
    }

    const relogio = setInterval(atualizar, INTERVALO_MS);

    // Navegador em aba oculta atrasa timers; ao voltar à vista, o número na
    // parede pode estar velho, então vale uma tentativa imediata.
    function aoVoltar() {
      if (document.visibilityState === "visible") void atualizar();
    }

    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [token]);

  return (
    <PainelVisual apresentacao={comporApresentacao(estado)} atualizadoEm={idadeExibida(estado)} />
  );
}
