import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import { criarCorretor } from "../acoes";
import { FormularioCorretor } from "../formulario";

export const metadata: Metadata = {
  title: "Novo corretor — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaNovoCorretor() {
  // Autorização antes da leitura, na própria página.
  await exigirAdministradorAtivo();

  // Só equipes ativas: entrar numa equipe encerrada não faz sentido. A action
  // reconsulta mesmo assim.
  const equipes = await prisma.equipe.findMany({
    where: { ativa: true },
    orderBy: [{ ordemExibicao: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, ativa: true },
  });

  return (
    <section>
      <h2 className="mb-6 text-lg font-medium text-texto">Novo corretor</h2>

      {equipes.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Não há equipe ativa. <Link href="/admin/equipes" className="underline">Cadastre ou
          reative uma equipe</Link> antes de incluir corretores.
        </p>
      ) : (
        <FormularioCorretor
          acao={criarCorretor}
          equipes={equipes}
          valores={{
            nomeCompleto: "",
            nomeExibicao: "",
            creci: "",
            fotoUrl: "",
            equipeId: "",
            dataEntrada: "",
          }}
          rotuloEnvio="Criar corretor"
        />
      )}
    </section>
  );
}
