"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  decidirEquipeDoCorretor,
  ehIdCorretorValido,
  interpretarEstadoAtivoCorretor,
  validarCorretor,
  type ErrosCorretor,
} from "@/lib/validacao/corretor";

/**
 * Server Actions de corretor.
 *
 * Como na F2.1, toda action exige administrador ativo antes de ler o
 * `FormData` e antes de qualquer consulta: Server Action é endpoint, e passar
 * pelo layout ou pelo proxy não autoriza nada.
 *
 * Não existe exclusão. Corretor carrega lançamentos com FK `Restrict`, e o
 * histórico continua valendo depois que a pessoa sai — encerrar é
 * `ativo = false`.
 */

export type EstadoCorretor = {
  erros?: ErrosCorretor;
  mensagem?: string;
  valores?: ValoresEnviados;
};

export type ValoresEnviados = {
  nomeCompleto: string;
  nomeExibicao: string;
  creci: string;
  fotoUrl: string;
  equipeId: string;
  dataEntrada: string;
};

const ROTA = "/admin/corretores";

/** Devolve o que foi digitado, para o erro não apagar o formulário. */
function valoresEnviados(form: FormData): ValoresEnviados {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    nomeCompleto: texto("nomeCompleto"),
    nomeExibicao: texto("nomeExibicao"),
    creci: texto("creci"),
    fotoUrl: texto("fotoUrl"),
    equipeId: texto("equipeId"),
    dataEntrada: texto("dataEntrada"),
  };
}

export async function criarCorretor(
  _anterior: EstadoCorretor,
  form: FormData,
): Promise<EstadoCorretor> {
  await exigirAdministradorAtivo();

  const validado = validarCorretor(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  // A equipe é reconsultada: o `<select>` mostrou só ativas, mas o payload
  // pode dizer outra coisa.
  const destino = await prisma.equipe.findUnique({
    where: { id: validado.dados.equipeId },
    select: { id: true, ativa: true },
  });

  const decisao = decidirEquipeDoCorretor(validado.dados.equipeId, null, destino);
  if (!decisao.ok) {
    return { erros: { equipeId: decisao.erro }, valores: valoresEnviados(form) };
  }

  // `ativo` nasce do default do schema.
  await prisma.corretor.create({ data: validado.dados });

  revalidatePath(ROTA);
  redirect(ROTA);
}

export async function editarCorretor(
  id: string,
  _anterior: EstadoCorretor,
  form: FormData,
): Promise<EstadoCorretor> {
  await exigirAdministradorAtivo();

  // Defensivo: a página já validou, mas a action é endpoint próprio.
  if (!ehIdCorretorValido(id)) return { mensagem: "Este corretor não existe mais." };

  const validado = validarCorretor(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  const atual = await prisma.corretor.findUnique({
    where: { id },
    select: { id: true, equipeId: true },
  });
  if (!atual) return { mensagem: "Este corretor não existe mais." };

  const destino = await prisma.equipe.findUnique({
    where: { id: validado.dados.equipeId },
    select: { id: true, ativa: true },
  });

  const decisao = decidirEquipeDoCorretor(validado.dados.equipeId, atual.equipeId, destino);
  if (!decisao.ok) {
    return { erros: { equipeId: decisao.erro }, valores: valoresEnviados(form) };
  }

  // Só o registro do corretor. Trocar de equipe **não** mexe em lançamento
  // nenhum: `Lancamento.equipeId` guarda a equipe do momento do fato, e
  // reescrevê-lo mudaria o histórico de quem já foi creditado.
  await prisma.corretor.update({ where: { id }, data: validado.dados });

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Inativa ou reativa. Recebe só `id` e o estado desejado, reconsulta no
 * servidor e escreve exclusivamente em `Corretor.ativo`.
 */
export async function alterarEstadoCorretor(form: FormData): Promise<void> {
  await exigirAdministradorAtivo();

  const id = form.get("id");
  if (!ehIdCorretorValido(id)) return;

  const ativo = interpretarEstadoAtivoCorretor(form.get("ativo"));
  if (ativo === null) return;

  const existente = await prisma.corretor.findUnique({ where: { id }, select: { id: true } });
  if (!existente) return;

  await prisma.corretor.update({ where: { id }, data: { ativo } });
  revalidatePath(ROTA);
}
