"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  ehNomeDuplicado,
  mensagemNomeDuplicado,
  validarEquipe,
  type ErrosEquipe,
} from "@/lib/validacao/equipe";

/**
 * Server Actions de equipe.
 *
 * Toda action começa exigindo administrador ativo, antes de ler o `FormData` e
 * antes de qualquer consulta. Passar pelo `proxy` ou pelo layout não conta:
 * o middleware só confere a assinatura do JWT e o layout não reexecuta a cada
 * navegação. Uma Server Action é um endpoint — dá para invocá-la sem nunca
 * renderizar a tela.
 *
 * Não existe action de exclusão: equipe carrega histórico de corretores e
 * lançamentos, então encerrar é `ativa = false`.
 */

/**
 * `valores` devolve ao formulário o que foi digitado. Sem isso, um erro de
 * validação limparia os campos e a pessoa redigitaria tudo — os inputs são não
 * controlados e só têm `defaultValue`.
 */
export type EstadoEquipe = {
  erros?: ErrosEquipe;
  mensagem?: string;
  valores?: { nome: string; gerenteNome: string; ordemExibicao: string };
};

function valoresEnviados(form: FormData): EstadoEquipe["valores"] {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    nome: texto("nome"),
    gerenteNome: texto("gerenteNome"),
    ordemExibicao: texto("ordemExibicao"),
  };
}

const ROTA = "/admin/equipes";

/** Descobre se quem já ocupa o nome está ativa, só para a mensagem certa. */
async function conflitoDeNome(nome: string): Promise<string> {
  const existente = await prisma.equipe.findUnique({
    where: { nome },
    select: { ativa: true },
  });
  return mensagemNomeDuplicado(existente?.ativa ?? true);
}

export async function criarEquipe(
  _anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  await exigirAdministradorAtivo();

  const validado = validarEquipe(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  try {
    await prisma.equipe.create({ data: validado.dados });
  } catch (erro) {
    if (ehNomeDuplicado(erro)) {
      return { erros: { nome: await conflitoDeNome(validado.dados.nome) }, valores: valoresEnviados(form) };
    }
    throw erro;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function editarEquipe(
  id: string,
  _anterior: EstadoEquipe,
  form: FormData,
): Promise<EstadoEquipe> {
  await exigirAdministradorAtivo();

  const validado = validarEquipe(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  try {
    await prisma.equipe.update({ where: { id }, data: validado.dados });
  } catch (erro) {
    if (ehNomeDuplicado(erro)) {
      return { erros: { nome: await conflitoDeNome(validado.dados.nome) }, valores: valoresEnviados(form) };
    }
    // P2025: a equipe sumiu entre abrir o formulário e salvar.
    if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2025") {
      return { mensagem: "Esta equipe não existe mais.", valores: valoresEnviados(form) };
    }
    throw erro;
  }

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Desativa ou reativa. Recebe só o `id` e o estado desejado, e reconsulta o
 * registro no servidor — nome e status vindos do cliente não são confiáveis, e
 * usá-los deixaria a decisão nas mãos de quem manda o formulário.
 *
 * Escreve exclusivamente em `Equipe.ativa`: nenhum corretor, lançamento ou FK
 * é tocado.
 */
export async function alterarEstadoEquipe(form: FormData): Promise<void> {
  await exigirAdministradorAtivo();

  const id = String(form.get("id") ?? "");
  const ativa = form.get("ativa") === "true";
  if (id === "") return;

  const existente = await prisma.equipe.findUnique({ where: { id }, select: { id: true } });
  if (!existente) return;

  await prisma.equipe.update({ where: { id }, data: { ativa } });
  revalidatePath(ROTA);
}
