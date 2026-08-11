import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

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

export default async function PaginaPainel({ params }: PageProps<"/painel/[token]">) {
  const { token } = await params;

  // Token errado responde 404: uma tela de "acesso negado" já confirmaria
  // que a rota existe.
  if (!tokenConfere(token)) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo">
      {/* Faixas de big numbers, VGV e quadros de equipe entram na Fase 3. */}
      <p className="text-texto-secundario">Painel em construção.</p>
    </main>
  );
}
