import type { Metadata } from "next";
import { PainelVisual } from "@/components/painel/painel-visual";
import type { ApresentacaoPainel } from "@/lib/apresentacao-painel";
import {
  bigNumbers,
  equipes,
  metricas,
  operacionais,
  periodo,
  quadroMensal,
  vgvPeriodos,
} from "@/lib/mock-painel";

export const metadata: Metadata = {
  title: "Preview do painel — Casa Louzada",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * O mock no formato que a tela consome.
 *
 * Os dados fictícios são os mesmos de sempre; o que muda é a embalagem — desde a
 * F3.5 quem desenha é `PainelVisual`, e ele pede um `ApresentacaoPainel`. Os dois
 * estados são `OK` porque o protótipo mostra o painel cheio: os caminhos de
 * ausência têm cobertura nos testes da F3.4, não aqui.
 */
const apresentacao: ApresentacaoPainel = {
  periodo,
  bigNumbers,
  vgvPeriodos,
  quadroMensal: { estado: "OK", linhas: quadroMensal },
  metricas,
  equipes: { estado: "OK", equipes },
  operacionais,
};

/**
 * Protótipo visual do painel, com dados fictícios.
 *
 * Não é a tela da TV: essa é `/painel/[token]`, protegida por token e ligada ao
 * banco desde a F3.5. Aqui não há autenticação, banco nem cálculo — só o layout,
 * alimentado por `src/lib/mock-painel.ts`.
 */
export default function PaginaPreview() {
  return <PainelVisual apresentacao={apresentacao} />;
}
