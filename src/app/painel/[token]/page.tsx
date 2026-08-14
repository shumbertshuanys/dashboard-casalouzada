import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AtualizadorPainel } from "@/components/painel/atualizador-painel";
import { RegistrarSwPainel } from "@/components/painel/registrar-sw";
import { prisma } from "@/lib/db";
import { lerPainel } from "@/lib/leitura-painel";
import { tokenPainelConfere } from "@/lib/token-painel";

export const metadata: Metadata = {
  title: "Painel — Casa Louzada",
  robots: { index: false, follow: false, nocache: true },
};

// A TV precisa sempre do dado do momento; nada de cache entre visitas.
export const dynamic = "force-dynamic";

/**
 * A tela da TV, ligada aos dados desde a F3.5 e mantida viva desde a F3.6.
 *
 * A página é curta de propósito: ela **compõe**, não calcula. O cálculo é da
 * F3.2, a leitura da F3.3, a formatação da F3.4 — aqui não há query, soma,
 * ordenação nem janela civil.
 *
 * Duas disciplinas justificam a ordem exata das linhas abaixo:
 *
 * - **o token vem antes de qualquer leitura.** Nenhuma consulta é disparada até
 *   o guard passar; o `prisma` importado no topo é o Proxy preguiçoso de
 *   `src/lib/db.ts`, que só abre conexão quando alguém o usa de verdade.
 * - **um relógio só.** `agora` é criado uma vez e desce inteiro para `lerPainel`.
 *   Se cada camada chamasse `new Date()` por conta própria, o cabeçalho poderia
 *   anunciar um mês diferente daquele que produziu os números logo abaixo dele.
 *
 * O que a página entrega é a **primeira** leitura; manter a tela atualizada é do
 * `AtualizadorPainel`, que roda no cliente. O token não é passado a ele por
 * prop — ele já está na URL, e `useParams` o lê de lá.
 *
 * `RegistrarSwPainel` entra ao lado dele desde a F4.4, e só registra o Service
 * Worker que serve a tela institucional quando a aplicação não responde. Ele não
 * desenha nada, não recebe o token e não guarda número nenhum (DEC-048).
 *
 * Não há `try`/`catch`: `INDISPONIVEL`, `SEM_DADOS`, `SEM_SALDO_HISTORICO` e
 * `CONFIGURACAO_INVALIDA` são **dados** e já chegam resolvidos. Uma exceção que
 * escape da leitura é defeito, e defeito não deve virar `—` na parede.
 */
export default async function PaginaPainel({ params }: PageProps<"/painel/[token]">) {
  const { token } = await params;

  // Token errado responde 404: uma tela de "acesso negado" já confirmaria
  // que a rota existe.
  if (!tokenPainelConfere(token)) notFound();

  const agora = new Date();
  const inicial = await lerPainel(prisma, agora);

  return (
    <>
      <RegistrarSwPainel />
      <AtualizadorPainel inicial={inicial} />
    </>
  );
}
