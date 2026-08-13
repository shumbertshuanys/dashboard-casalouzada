import { Jost } from "next/font/google";
import type { ApresentacaoPainel } from "@/lib/apresentacao-painel";
import { decidirAreaEquipes } from "./decidir-area-equipes";
import { FaixaBig } from "./faixa-big";
import { FaixaVgv } from "./faixa-vgv";
import { QuadrosEquipe } from "./quadros-equipe";
import estilos from "./painel.module.css";

/**
 * A composição visual do painel, compartilhada pelas duas rotas.
 *
 * `/preview` a alimenta com o mock e `/painel/[token]` com os dados reais — o
 * desenho é o mesmo nas duas, e é justamente por ser um só que o protótipo
 * continua valendo como contrato visual da tela de verdade.
 *
 * Não carrega `"use client"`: pelo grafo do `/preview` ele é renderizado no
 * servidor. Pelo grafo da rota real, porém, quem o importa é o
 * `AtualizadorPainel` — que é cliente —, e ele entra no bundle junto. Isso é
 * possível justamente por não ter estado nem efeito próprio: recebe tudo pronto
 * em `ApresentacaoPainel` (F3.4) e desenha.
 *
 * Aqui não se lê banco, não se calcula e não se formata nada. Os estados já
 * chegam resolvidos — `—` onde não há número a afirmar, zero real onde há.
 */

// Jost é a tipografia da seção 6 do PLANO. Fica só no painel: o admin e o login
// seguem com a fonte do layout raiz. O `next/font` hospeda o arquivo junto com o
// build, então a TV não depende do Google Fonts para desenhar certo.
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"] });

/**
 * A área de equipes quando não há quadros a mostrar.
 *
 * Um título e nada mais: sem stack, sem nome de tabela e sem instrução
 * administrativa — a TV fica na parede do escritório, à vista de quem passa.
 */
function EstadoEquipes({ titulo }: { titulo: string }) {
  return (
    <section className={`${estilos.quadro} ${estilos.estadoEquipes}`}>
      <h2>{titulo}</h2>
    </section>
  );
}

export function PainelVisual({
  apresentacao,
  atualizadoEm,
}: {
  apresentacao: ApresentacaoPainel;
  /** Hora da leitura mais antiga ainda em tela. Ausente no `/preview`. */
  atualizadoEm?: string | null;
}) {
  const decisao = decidirAreaEquipes(apresentacao.equipes);

  return (
    <div className={`${jost.className} ${estilos.moldura}`}>
      {/* `.tv` só estabelece o retângulo 16:9 e a referência de `cqw`; o padding da
          composição fica em `.conteudo`, senão encolheria a própria referência. */}
      <div className={estilos.tv}>
        <div className={estilos.conteudo}>
          <div className={estilos.topo}>
            <div className={estilos.marca}>CASA LOUZADA</div>
            <div className={estilos.periodo}>
              {apresentacao.periodo}
              {/* Discreto de propósito: quem passa pelo escritório lê os números,
                  não o relógio. Sem selo quando não há leitura a datar. */}
              {atualizadoEm ? (
                <span className={estilos.atualizacao}>atualizado {atualizadoEm}</span>
              ) : null}
            </div>
          </div>

          <FaixaBig itens={apresentacao.bigNumbers} />

          <FaixaVgv titulo="VGV por período" itens={apresentacao.vgvPeriodos} />

          <div className={estilos.faixaBase}>
            {/* Estático e usado uma vez só — não vale um componente próprio. */}
            <section className={estilos.quadro}>
              <h2>Mensal geral</h2>
              <div className={estilos.sub}>Toda a equipe, mês corrente</div>
              <div className={estilos.linhas}>
                {apresentacao.quadroMensal.linhas.map((linha) => (
                  <div key={linha.rotulo} className={estilos.linha}>
                    <span className={estilos.lab}>{linha.rotulo}</span>
                    <span className={estilos.rule} />
                    <span className={estilos.val}>{linha.valor}</span>
                  </div>
                ))}
              </div>
            </section>

            {decisao.tipo === "quadros" ? (
              // `metricas` é readonly no shape e o componente cliente pede um
              // array mutável; a cópia rasa resolve sem mexer no contrato dele.
              <QuadrosEquipe equipes={decisao.equipes} metricas={[...apresentacao.metricas]} />
            ) : (
              <EstadoEquipes titulo={decisao.titulo} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
