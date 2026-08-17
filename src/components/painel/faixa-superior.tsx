"use client";

import { useEffect, useState } from "react";
import type { AreaOperacional, BigNumber } from "@/lib/apresentacao-painel";
import { FaixaBig } from "./faixa-big";
import { FaixaOperacional } from "./faixa-operacional";
import {
  avancarRotacao,
  DURACAO_FADE,
  DURACAO_TELA,
  janelaOperacional,
  ROTACAO_INICIAL,
} from "./rotacao-faixa";
import estilos from "./painel.module.css";

/**
 * A faixa superior do painel, alternando entre duas telas (DEC-056).
 *
 * **Tela A** é a de sempre: imóveis vendidos, VGV acumulado e avaliações.
 * **Tela B** mostra o que está em aberto agora: propostas em andamento e
 * reservas de locação. Vinte segundos cada, `A → B → A → B`, sem terceira tela.
 *
 * A responsabilidade aqui é **só alternar e paginar**. Não lê banco, não
 * calcula, não ordena e não filtra status — recebe as listas prontas e decide
 * qual tela está visível e qual janela de até três itens aparece nela. A regra
 * de quem entra em cada lista é do núcleo (DEC-013).
 *
 * As listas chegam **inteiras**, e não cortadas em três. Com mais de três itens
 * em aberto, cada aparição da Tela B mostra o grupo seguinte, em ciclo: sem
 * isso, o quarto item nunca apareceria na parede. As páginas viram na entrada em
 * B, nunca dentro dos 20 s — a lista não pode trocar debaixo de quem está lendo.
 *
 * A rotação é independente do refresh de 60 s: o timer só depende de qual tela
 * está ativa, então uma atualização de dados troca o conteúdo por baixo sem
 * reiniciar o ciclo nem devolver a rotação ao primeiro grupo. Amarrar os dois
 * faria a Tela B aparecer em intervalos irregulares sempre que a rede oscilasse.
 */

export function FaixaSuperior({
  bigNumbers,
  operacionais,
}: {
  bigNumbers: BigNumber[];
  operacionais: AreaOperacional;
}) {
  const [rotacao, setRotacao] = useState(ROTACAO_INICIAL);
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    const some = setTimeout(() => setTrocando(true), DURACAO_TELA - DURACAO_FADE);
    const troca = setTimeout(() => {
      setRotacao(avancarRotacao);
      setTrocando(false);
    }, DURACAO_TELA);

    return () => {
      clearTimeout(some);
      clearTimeout(troca);
    };
  }, [rotacao.tela]);

  return (
    <div className={`${estilos.faixaSuperior} ${trocando ? estilos.trocando : ""}`}>
      {rotacao.tela === "A" ? (
        <FaixaBig itens={bigNumbers} />
      ) : (
        <FaixaOperacional
          propostas={janelaOperacional(operacionais.propostas, rotacao.paginaPropostas)}
          reservas={janelaOperacional(operacionais.reservas, rotacao.paginaReservas)}
        />
      )}
    </div>
  );
}
