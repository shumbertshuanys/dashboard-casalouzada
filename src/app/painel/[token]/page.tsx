import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PainelVisual } from "@/components/painel/painel-visual";
import { criarApresentacaoPainel } from "@/lib/apresentacao-painel";
import { prisma } from "@/lib/db";
import { obterMetricasPainel } from "@/lib/metricas-prisma";

export const metadata: Metadata = {
  title: "Painel — Casa Louzada",
  robots: { index: false, follow: false, nocache: true },
};

// A TV precisa sempre do dado do momento; nada de cache entre visitas.
export const dynamic = "force-dynamic";

function tokenConfere(recebido: string): boolean {
  const esperado = process.env.PAINEL_TOKEN;
  if (!esperado) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige o mesmo tamanho; o comprimento em si não é segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A tela da TV, ligada aos dados desde a F3.5.
 *
 * A página é curta de propósito: ela **compõe**, não calcula. O cálculo é da
 * F3.2, a leitura da F3.3 e a formatação da F3.4 — aqui não há query, soma,
 * ordenação nem janela civil.
 *
 * Duas disciplinas justificam a ordem exata das linhas abaixo:
 *
 * - **o token vem antes de qualquer leitura.** Nenhuma consulta é disparada até
 *   o guard passar; o `prisma` importado no topo é o Proxy preguiçoso de
 *   `src/lib/db.ts`, que só abre conexão quando alguém o usa de verdade.
 * - **um relógio só.** `agora` é criado uma vez e vai para as duas camadas. Se
 *   cada uma chamasse `new Date()` por conta própria, o cabeçalho poderia
 *   anunciar um mês diferente daquele que produziu os números logo abaixo dele.
 *
 * Não há `try`/`catch`: `INDISPONIVEL`, `SEM_DADOS`, `SEM_SALDO_HISTORICO` e
 * `CONFIGURACAO_INVALIDA` são **dados** e já chegam resolvidos. Uma exceção que
 * escape da leitura é defeito, e defeito não deve virar `—` na parede.
 */
export default async function PaginaPainel({ params }: PageProps<"/painel/[token]">) {
  const { token } = await params;

  // Token errado responde 404: uma tela de "acesso negado" já confirmaria
  // que a rota existe.
  if (!tokenConfere(token)) notFound();

  const agora = new Date();
  const resultado = await obterMetricasPainel(prisma, agora);
  const apresentacao = criarApresentacaoPainel(resultado, agora);

  return <PainelVisual apresentacao={apresentacao} />;
}
