"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  ehCompetenciaDuplicada,
  ehIdVgvHistoricoValido,
  MENSAGEM_COMPETENCIA_DUPLICADA,
  validarVgvHistoricoMensal,
  type ErrosVgvHistorico,
} from "@/lib/validacao/vgv-historico-mensal";

/**
 * Server Actions do VGV histórico mensal.
 *
 * Nada aqui toca `lancamentos`, `participacoes_venda`, `saldo_historico`,
 * `corretores` ou `equipes`. O registro é um agregado administrativo: ele
 * alimenta o VGV trimestral e anual, e mais nada.
 *
 * Toda regra — a forma `AAAA-MM`, a exigência de mês encerrado, a normalização
 * do dinheiro, o UUID e o reconhecimento do P2002 — vem de
 * `src/lib/validacao/vgv-historico-mensal.ts`. Nenhuma delas é reescrita aqui.
 */

export type ValoresVgvHistorico = {
  competencia: string;
  valorTotal: string;
  observacao: string;
};

export type EstadoVgvHistorico = {
  erros?: ErrosVgvHistorico;
  mensagem?: string;
  valores?: ValoresVgvHistorico;
};

const ROTA = "/admin/vgv-historico";

function valoresEnviados(form: FormData): ValoresVgvHistorico {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    competencia: texto("competencia"),
    valorTotal: texto("valorTotal"),
    observacao: texto("observacao"),
  };
}

export async function criarVgvHistorico(
  _anterior: EstadoVgvHistorico,
  form: FormData,
): Promise<EstadoVgvHistorico> {
  await exigirAdministradorAtivo();

  const validado = validarVgvHistoricoMensal(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  try {
    await prisma.vgvHistoricoMensal.create({ data: validado.dados });
  } catch (erro) {
    // A unicidade da competência é do banco. Consultar antes só serviria à
    // tela; entre a consulta e o insert cabe outra submissão.
    if (ehCompetenciaDuplicada(erro)) {
      return {
        erros: { competencia: MENSAGEM_COMPETENCIA_DUPLICADA },
        valores: valoresEnviados(form),
      };
    }
    throw erro;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Edita um agregado já cadastrado.
 *
 * A competência é **imutável**: ela vem do registro no banco, nunca do
 * formulário. Trocá-la moveria o dinheiro de um mês para outro em silêncio — e,
 * com o índice único, transformaria a edição num conflito.
 *
 * O que muda é o que a fonte consolidada pode ter revisado: o valor e a
 * observação.
 */
export async function editarVgvHistorico(
  id: string,
  _anterior: EstadoVgvHistorico,
  form: FormData,
): Promise<EstadoVgvHistorico> {
  await exigirAdministradorAtivo();

  if (!ehIdVgvHistoricoValido(id)) return { mensagem: "Este registro não existe mais." };

  const atual = await prisma.vgvHistoricoMensal.findUnique({
    where: { id },
    select: { id: true, competencia: true },
  });
  if (!atual) return { mensagem: "Este registro não existe mais." };

  // A competência do banco manda, e por isso a regra de mês encerrado não é
  // reaplicada: um mês que já era passado no cadastro não volta a ser futuro.
  const validado = validarVgvHistoricoMensal(form, undefined, atual.competencia);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  await prisma.vgvHistoricoMensal.update({
    where: { id },
    data: {
      valorTotal: validado.dados.valorTotal,
      observacao: validado.dados.observacao,
      // `competencia` fica de fora de propósito.
    },
  });

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Remove um agregado mensal.
 *
 * Permitida porque a linha não é referenciada por FK nenhuma e não representa
 * fato comercial: ao excluí-la, aquele mês volta a ser calculado exclusivamente
 * pelas VENDA reais que existirem. Nenhum lançamento é tocado.
 */
export async function excluirVgvHistorico(form: FormData): Promise<void> {
  await exigirAdministradorAtivo();

  const id = form.get("id");
  if (!ehIdVgvHistoricoValido(id)) return;

  const existente = await prisma.vgvHistoricoMensal.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existente) return;

  await prisma.vgvHistoricoMensal.delete({ where: { id } });

  revalidatePath(ROTA);
  redirect(ROTA);
}
