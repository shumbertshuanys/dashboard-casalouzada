"use client";

import { useEffect, useState } from "react";
import type { AreaOperacional, BigNumber } from "@/lib/apresentacao-painel";
import { FaixaBig } from "./faixa-big";
import { FaixaOperacional } from "./faixa-operacional";
import { DURACAO_FADE, DURACAO_TELA, proximaTela, type Tela } from "./rotacao-faixa";
import estilos from "./painel.module.css";

/**
 * A faixa superior do painel, alternando entre duas telas (DEC-056).
 *
 * **Tela A** é a de sempre: imóveis vendidos, VGV acumulado e avaliações.
 * **Tela B** mostra o que está em aberto agora: propostas em andamento e
 * reservas de locação. Vinte segundos cada, `A → B → A → B`, sem terceira tela.
 *
 * A responsabilidade aqui é **só alternar**. Não lê banco, não calcula, não
 * ordena e não filtra status — recebe as duas telas prontas e decide qual está
 * visível. A regra de quem entra em cada lista é do núcleo (DEC-013).
 *
 * A rotação é independente do refresh de 60 s: o timer só depende de qual tela
 * está ativa, então uma atualização de dados troca o conteúdo por baixo sem
 * reiniciar o ciclo. Amarrar os dois faria a Tela B aparecer em intervalos
 * irregulares sempre que a rede oscilasse.
 */

export function FaixaSuperior({
  bigNumbers,
  operacionais,
}: {
  bigNumbers: BigNumber[];
  operacionais: AreaOperacional;
}) {
  const [tela, setTela] = useState<Tela>("A");
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    const some = setTimeout(() => setTrocando(true), DURACAO_TELA - DURACAO_FADE);
    const troca = setTimeout(() => {
      setTela(proximaTela);
      setTrocando(false);
    }, DURACAO_TELA);

    return () => {
      clearTimeout(some);
      clearTimeout(troca);
    };
  }, [tela]);

  return (
    <div className={`${estilos.faixaSuperior} ${trocando ? estilos.trocando : ""}`}>
      {tela === "A" ? (
        <FaixaBig itens={bigNumbers} />
      ) : (
        <FaixaOperacional
          propostas={operacionais.propostas}
          reservas={operacionais.reservas}
        />
      )}
    </div>
  );
}
