import type { Metadata } from "next";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { criarVgvHistorico } from "../acoes";
import { FormularioVgvHistorico } from "../formulario";

export const metadata: Metadata = {
  title: "Nova competência — Casa Louzada",
  robots: { index: false, follow: false },
};

/**
 * Cadastro de uma competência mensal.
 *
 * Sem seletor de meses disponíveis: a autoridade contra duplicidade é o índice
 * único, e a action trata o P2002. Sugerir a lista aqui exigiria uma consulta a
 * mais para uma conveniência que o servidor já garante.
 */
export default async function PaginaNovoVgvHistorico() {
  await exigirAdministradorAtivo();

  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-texto">Nova competência</h2>
        <p className="text-sm text-texto-secundario">
          VGV total consolidado de um mês já encerrado
        </p>
      </div>

      <FormularioVgvHistorico
        acao={criarVgvHistorico}
        rotuloEnvio="Cadastrar competência"
        valoresIniciais={{ competencia: "", valorTotal: "", observacao: "" }}
      />
    </section>
  );
}
