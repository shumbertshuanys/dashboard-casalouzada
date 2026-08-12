import type { Metadata } from "next";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { criarEquipe } from "../acoes";
import { FormularioEquipe } from "../formulario";

export const metadata: Metadata = {
  title: "Nova equipe — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaNovaEquipe() {
  // Não lê o banco, mas também não serve o formulário a quem não é
  // administrador ativo.
  await exigirAdministradorAtivo();

  return (
    <section>
      <h2 className="mb-6 text-lg font-medium text-texto">Nova equipe</h2>
      <FormularioEquipe
        acao={criarEquipe}
        valores={{ nome: "", gerenteNome: "", ordemExibicao: "" }}
        rotuloEnvio="Criar equipe"
      />
    </section>
  );
}
