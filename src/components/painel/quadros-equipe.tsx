"use client";

import { useEffect, useState } from "react";
import type { Equipe, Metrica } from "@/lib/mock-painel";
import estilos from "./painel.module.css";

/** 20s por métrica. Com as oito do ciclo, uma volta completa leva 2min40s. */
const DURACAO_METRICA = 20_000;
/** Igual à transição de opacidade do CSS. Acontece dentro dos 20s, não depois. */
const DURACAO_FADE = 450;

/**
 * Os três quadros de equipe, trocando de métrica em sincronia.
 *
 * É o único pedaço com estado: as faixas de cima são estáticas. Os rankings chegam
 * prontos do mock — aqui não se soma, não se ordena e não se recorta nada.
 */
export function QuadrosEquipe({ equipes, metricas }: { equipes: Equipe[]; metricas: Metrica[] }) {
  const [indice, setIndice] = useState(0);
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    const some = setTimeout(() => setTrocando(true), DURACAO_METRICA - DURACAO_FADE);
    const troca = setTimeout(() => {
      setIndice((atual) => (atual + 1) % metricas.length);
      setTrocando(false);
    }, DURACAO_METRICA);

    return () => {
      clearTimeout(some);
      clearTimeout(troca);
    };
  }, [indice, metricas.length]);

  const metricaAtiva = metricas[indice];

  return (
    <>
      {equipes.map((equipe) => (
        <section key={equipe.nome} className={estilos.quadro}>
          <h2>{equipe.nome}</h2>
          <div className={estilos.sub}>
            {equipe.gerente} · {equipe.totalCorretores} corretores
          </div>

          <div className={estilos.metrica}>{metricaAtiva.nome}</div>

          <div className={estilos.marcadores}>
            {metricas.map((metrica, posicao) => (
              <i
                key={metrica.chave}
                className={
                  posicao < indice ? estilos.feito : posicao === indice ? estilos.agora : undefined
                }
              >
                {/* `key` com o índice remonta o elemento e reinicia a animação de
                    preenchimento — no protótipo isso era um reflow forçado à mão. */}
                <span key={indice} />
              </i>
            ))}
          </div>

          <div className={`${estilos.lista} ${trocando ? estilos.trocando : ""}`}>
            {equipe.rankings[metricaAtiva.chave].map((linha) => (
              <div key={linha.rotulo} className={estilos.linha}>
                <span className={estilos.lab}>{linha.rotulo}</span>
                <span className={estilos.rule} />
                <span className={estilos.val}>{linha.valor}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
