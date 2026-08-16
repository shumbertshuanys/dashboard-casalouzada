"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  avancarCelebracao,
  DURACAO_CELEBRACAO_MS,
  estadoInicialCelebracoes,
  incorporarCelebracoes,
} from "@/lib/celebracao-cliente";
import { ehRespostaCelebracoes } from "@/lib/contrato-celebracao";
import { CelebracaoOverlay } from "./celebracao-overlay";

/**
 * Cinco segundos entre leituras.
 *
 * Bem mais curto que o minuto do `AtualizadorPainel`, e de propósito: métrica é
 * acompanhamento, celebração é reação. Uma venda fechada precisa aparecer na TV
 * enquanto a sala ainda está comemorando — meio minuto de atraso já transforma
 * o momento em aviso.
 */
const INTERVALO_MS = 5_000;

/**
 * Quatro segundos: menos que o intervalo, para uma tentativa nunca alcançar a
 * seguinte. A trava `emVoo` já impede duas requisições ao mesmo tempo; o limite
 * é o que impede uma conexão pendurada de silenciar a TV até o fim do dia.
 */
const TEMPO_LIMITE_MS = 4_000;

/**
 * O que traz a comemoração para a TV.
 *
 * **É irmão do `AtualizadorPainel`, não substituto dele.** O dashboard continua
 * montado e continua atualizando por baixo; este componente só desenha uma
 * camada por cima quando há o que comemorar, e some quando não há. Nada aqui
 * lê, calcula ou altera métrica.
 *
 * O caminho é sempre o mesmo: pedir, validar, incorporar. A validação não é
 * cerimônia — `resposta.json()` devolve `any`, e sem essa porta um payload
 * malformado atravessaria a tipagem e viraria `R$ NaN` numa animação de dez
 * segundos que ninguém no escritório pode interromper.
 *
 * **Nenhum caminho de falha mexe no estado.** Rede caída, timeout, status
 * diferente de 200, JSON corrompido ou payload fora do contrato: todos saem por
 * `return` sem tocar em `setEstado`. A celebração em cena continua, a fila
 * continua, e nada é marcado como visto — a mesma disciplina da DEC-014 aplicada
 * a um evento em vez de a um número.
 *
 * O token **não** é prop: ele já está na URL que o navegador abriu, e passá-lo
 * como propriedade de componente cliente o colocaria também no payload de
 * hidratação. `useParams` lê o mesmo valor, e ele só monta o caminho da
 * requisição — nunca entra em estado, storage ou log.
 */
export function VigiaCelebracao() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState(estadoInicialCelebracoes);

  // Uma requisição por vez. O intervalo é curto e a rede da TV nem sempre é
  // boa: sem esta trava, respostas lentas se acumulariam e voltariam fora de
  // ordem sobre o mesmo estado.
  const emVoo = useRef(false);

  useEffect(() => {
    let ativo = true;

    async function consultar() {
      if (emVoo.current) return;
      emVoo.current = true;

      try {
        const resposta = await fetch(`/painel/${encodeURIComponent(token)}/celebracao`, {
          cache: "no-store",
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        });

        if (!resposta.ok) return;

        const json = await resposta.json();
        if (!ativo) return;

        // A porta: o que não é do contrato é ignorado por inteiro. Aproveitar
        // "as partes boas" de um payload quebrado é o caminho mais curto para
        // uma celebração sem nome ou sem valor na parede.
        if (!ehRespostaCelebracoes(json)) return;

        setEstado((anterior) => incorporarCelebracoes(anterior, json));
      } catch {
        // Sem detalhe: a URL carrega o token e o erro bruto pode carregar a URL.
        console.warn("Consulta de celebrações falhou.");
      } finally {
        emVoo.current = false;
      }
    }

    // Uma leitura imediata ao montar: uma venda cadastrada segundos antes de a
    // TV ser ligada ainda está dentro da janela de frescor do servidor.
    void consultar();

    const relogio = setInterval(consultar, INTERVALO_MS);

    // Navegador em aba oculta atrasa timers; ao voltar à vista vale uma
    // tentativa imediata, como no atualizador de métricas.
    function aoVoltar() {
      if (document.visibilityState === "visible") void consultar();
    }

    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [token]);

  // O relógio de exibição, separado do de rede: cada celebração ocupa a tela
  // pelo mesmo tempo, e quando ele termina a próxima da fila entra sozinha. A
  // dependência é o `id` e não o objeto — sem isso, uma resposta que reentregue
  // a mesma celebração reiniciaria a contagem dela no meio da animação.
  const idAtual = estado.atual?.id ?? null;

  useEffect(() => {
    if (idAtual === null) return;

    const saida = setTimeout(() => setEstado(avancarCelebracao), DURACAO_CELEBRACAO_MS);
    return () => clearTimeout(saida);
  }, [idAtual]);

  if (estado.atual === null) return null;

  // `key` no id: cada celebração é um overlay novo, com as animações de entrada
  // e saída recomeçando do zero. Sem ela, a segunda entraria já no meio da
  // coreografia da primeira.
  return <CelebracaoOverlay key={estado.atual.id} celebracao={estado.atual} />;
}
