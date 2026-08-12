import type { Metadata } from "next";
import { Jost } from "next/font/google";
import { FaixaBig } from "@/components/painel/faixa-big";
import { FaixaVgv } from "@/components/painel/faixa-vgv";
import { QuadrosEquipe } from "@/components/painel/quadros-equipe";
import estilos from "@/components/painel/painel.module.css";
import { bigNumbers, equipes, metricas, periodo, quadroMensal, vgvPeriodos } from "@/lib/mock-painel";

// Jost é a tipografia da seção 6 do PLANO. Fica só nesta rota: o admin e o login
// seguem com a fonte do layout raiz. O `next/font` hospeda o arquivo junto com o
// build, então a TV não depende do Google Fonts para desenhar certo.
const jost = Jost({ subsets: ["latin"], weight: ["300", "400", "500"] });

export const metadata: Metadata = {
  title: "Preview do painel — Casa Louzada",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Protótipo visual do painel, com dados fictícios.
 *
 * Não é a tela da TV: essa é `/painel/[token]`, protegida por token e ligada ao
 * banco na Fase 3. Aqui não há autenticação, banco nem cálculo — só o layout.
 */
export default function PaginaPreview() {
  return (
    <div className={`${jost.className} ${estilos.moldura}`}>
      {/* `.tv` só estabelece o retângulo 16:9 e a referência de `cqw`; o padding da
          composição fica em `.conteudo`, senão encolheria a própria referência. */}
      <div className={estilos.tv}>
        <div className={estilos.conteudo}>
          <div className={estilos.topo}>
            <div className={estilos.marca}>CASA LOUZADA</div>
            <div className={estilos.periodo}>{periodo}</div>
          </div>

          <FaixaBig itens={bigNumbers} />

          <FaixaVgv titulo="VGV por período" itens={vgvPeriodos} />

          <div className={estilos.faixaBase}>
            {/* Estático e usado uma vez só — não vale um componente próprio. */}
            <section className={estilos.quadro}>
              <h2>Mensal geral</h2>
              <div className={estilos.sub}>Toda a equipe, mês corrente</div>
              <div className={estilos.linhas}>
                {quadroMensal.map((linha) => (
                  <div key={linha.rotulo} className={estilos.linha}>
                    <span className={estilos.lab}>{linha.rotulo}</span>
                    <span className={estilos.rule} />
                    <span className={estilos.val}>{linha.valor}</span>
                  </div>
                ))}
              </div>
            </section>

            <QuadrosEquipe equipes={equipes} metricas={metricas} />
          </div>
        </div>
      </div>
    </div>
  );
}
