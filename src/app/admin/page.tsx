import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administração — Casa Louzada",
  robots: { index: false, follow: false },
};

// A casca e a checagem de acesso ficam em `layout.tsx`. Esta página ainda não lê
// dado nenhum; quando ler, chama `exigirAdministradorAtivo()` aqui dentro — passar
// pelo layout não autoriza leitura.
export default function PaginaAdmin() {
  return (
    <p className="text-sm text-texto-secundario">Cadastros e lançamentos entram na Fase 2.</p>
  );
}
