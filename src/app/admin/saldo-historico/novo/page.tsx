import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { hojeEmSaoPaulo } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { TIPOS_SALDO_HISTORICO } from "@/lib/validacao/saldo-historico";
import { criarSaldoHistorico } from "../acoes";
import { FormularioSaldo } from "../formulario";

export const metadata: Metadata = {
  title: "Novo saldo histórico — Casa Louzada",
  robots: { index: false, follow: false },
};

export default async function PaginaNovoSaldo() {
  await exigirAdministradorAtivo();

  const cadastrados = await prisma.saldoHistorico.findMany({
    where: { tipo: { in: [...TIPOS_SALDO_HISTORICO] } },
    select: { tipo: true },
  });
  const ocupados = new Set(cadastrados.map((saldo) => saldo.tipo));

  // O seletor mostra só o que falta. É conveniência de tela: a autoridade
  // contra duplicidade é o índice único, e a action trata o P2002.
  const disponiveis = TIPOS_SALDO_HISTORICO.filter((tipo) => !ocupados.has(tipo));

  return (
    <section>
      <h2 className="mb-6 text-lg font-medium text-texto">Novo saldo histórico</h2>

      {disponiveis.length === 0 ? (
        <p className="text-sm text-texto-secundario">
          Os dois tipos já têm saldo cadastrado.{" "}
          <Link href="/admin/saldo-historico" className="underline">
            Voltar para a lista
          </Link>{" "}
          para editar ou remover.
        </p>
      ) : (
        <FormularioSaldo
          acao={criarSaldoHistorico}
          tiposDisponiveis={disponiveis}
          rotuloEnvio="Cadastrar saldo"
          valoresIniciais={{
            tipo: disponiveis.length === 1 ? disponiveis[0] : "",
            quantidade: "",
            valorTotal: "",
            // Sugestão do servidor, no fuso do escritório.
            dataCorte: hojeEmSaoPaulo(),
            descricao: "",
          }}
        />
      )}
    </section>
  );
}
