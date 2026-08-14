"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  MENSAGEM_TIPO_DUPLICADO,
  ehIdSaldoHistoricoValido,
  ehTipoDuplicado,
  validarSaldoHistorico,
  type ErrosSaldo,
} from "@/lib/validacao/saldo-historico";

/**
 * Server Actions do saldo histórico.
 *
 * Nada aqui toca lançamento: o saldo é um número de abertura, e como ele se
 * combina com os eventos é assunto da Fase 3. `dataCorte` é apenas armazenada.
 */

export type ValoresSaldo = {
  tipo: string;
  quantidade: string;
  valorTotal: string;
  precisao: string;
  dataCorte: string;
  descricao: string;
};

export type EstadoSaldo = {
  erros?: ErrosSaldo;
  mensagem?: string;
  valores?: ValoresSaldo;
};

const ROTA = "/admin/saldo-historico";

function valoresEnviados(form: FormData): ValoresSaldo {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    tipo: texto("tipo"),
    quantidade: texto("quantidade"),
    valorTotal: texto("valorTotal"),
    precisao: texto("precisao"),
    dataCorte: texto("dataCorte"),
    descricao: texto("descricao"),
  };
}

export async function criarSaldoHistorico(
  _anterior: EstadoSaldo,
  form: FormData,
): Promise<EstadoSaldo> {
  await exigirAdministradorAtivo();

  const validado = validarSaldoHistorico(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  try {
    await prisma.saldoHistorico.create({ data: validado.dados });
  } catch (erro) {
    // A unicidade é do banco. Consultar antes só serviria à tela; entre a
    // consulta e o insert cabe outra submissão.
    if (ehTipoDuplicado(erro)) {
      return { erros: { tipo: MENSAGEM_TIPO_DUPLICADO }, valores: valoresEnviados(form) };
    }
    throw erro;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Edita um saldo já cadastrado.
 *
 * O tipo é imutável: ele vem do registro no banco, nunca do formulário.
 * Trocá-lo transformaria um acumulado de vendas em avaliações — e a unicidade
 * por tipo tornaria isso um conflito silencioso.
 */
export async function editarSaldoHistorico(
  id: string,
  _anterior: EstadoSaldo,
  form: FormData,
): Promise<EstadoSaldo> {
  await exigirAdministradorAtivo();

  if (!ehIdSaldoHistoricoValido(id)) return { mensagem: "Este saldo não existe mais." };

  const atual = await prisma.saldoHistorico.findUnique({
    where: { id },
    select: { id: true, tipo: true },
  });
  if (!atual) return { mensagem: "Este saldo não existe mais." };

  // O tipo do banco manda: é ele que decide se o valor é exigido ou zerado.
  const tipo = atual.tipo as "VENDA" | "AVALIACAO_GOOGLE";
  const validado = validarSaldoHistorico(form, tipo);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  await prisma.saldoHistorico.update({
    where: { id },
    data: {
      quantidade: validado.dados.quantidade,
      valorTotal: validado.dados.valorTotal,
      // EXATO ↔ MINIMO_CONHECIDO nos dois sentidos (DEC-054).
      precisao: validado.dados.precisao,
      dataCorte: validado.dados.dataCorte,
      descricao: validado.dados.descricao,
      // `tipo` fica de fora de propósito.
    },
  });

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Remove o saldo de abertura de um tipo.
 *
 * Existe porque "não cadastrado" e "cadastrado como zero" são coisas
 * diferentes: sem exclusão, um saldo criado por engano só poderia ser zerado,
 * o que afirmaria um acumulado que ninguém apurou.
 *
 * Nenhum lançamento é tocado.
 */
export async function excluirSaldoHistorico(form: FormData): Promise<void> {
  await exigirAdministradorAtivo();

  const id = form.get("id");
  if (!ehIdSaldoHistoricoValido(id)) return;

  const existente = await prisma.saldoHistorico.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existente) return;

  await prisma.saldoHistorico.delete({ where: { id } });

  revalidatePath(ROTA);
  redirect(ROTA);
}
