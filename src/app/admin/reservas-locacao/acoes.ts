"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  decidirReservaParaCorretor,
  ehIdReservaLocacaoValido,
  validarCriacaoReserva,
  validarEdicaoReserva,
  type ErrosReserva,
} from "@/lib/validacao/reserva-locacao";

/**
 * Server Actions da reserva de locação (DEC-055).
 *
 * Reserva é operação, não produção: nada aqui toca `Lancamento`, e marcar uma
 * reserva como FINALIZADA **não** cria a LOCACAO — o operador registra as duas
 * coisas separadamente, sem automação na v1.
 *
 * Não existe exclusão de propósito: CANCELADA é o estado operacional de uma
 * reserva que deixou de valer, e o registro fica.
 */

export type ValoresReserva = {
  corretorId: string;
  status: string;
  imovelRef: string;
  dataReferencia: string;
  observacao: string;
};

export type EstadoReserva = {
  erros?: ErrosReserva;
  mensagem?: string;
  valores?: ValoresReserva;
};

const ROTA = "/admin/reservas-locacao";

function valoresEnviados(form: FormData): ValoresReserva {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    corretorId: texto("corretorId"),
    status: texto("status"),
    imovelRef: texto("imovelRef"),
    dataReferencia: texto("dataReferencia"),
    observacao: texto("observacao"),
  };
}

export async function criarReserva(
  _anterior: EstadoReserva,
  form: FormData,
): Promise<EstadoReserva> {
  // A identidade sai da guarda, nunca do formulário — é ela que vira a autoria.
  const administrador = await exigirAdministradorAtivo();

  const validado = validarCriacaoReserva(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  // O corretor e a equipe atual dele são lidos agora, imediatamente antes do
  // create: é este `equipeId` que fica gravado como snapshot. O select da tela
  // não é fronteira de segurança — a decisão é sobre o que o banco diz aqui.
  const corretor = await prisma.corretor.findUnique({
    where: { id: validado.dados.corretorId },
    select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
  });

  const decisao = decidirReservaParaCorretor(corretor);
  if (!decisao.ok) {
    return { erros: { corretorId: decisao.erro }, valores: valoresEnviados(form) };
  }

  await prisma.reservaLocacao.create({
    data: {
      corretorId: validado.dados.corretorId,
      // Snapshot do momento da criação. Se o corretor mudar de equipe depois,
      // esta linha continua apontando para cá.
      equipeId: decisao.equipeId,
      imovelRef: validado.dados.imovelRef,
      // Explícito, nunca do FormData: toda reserva nasce ATIVA (DEC-055).
      // Um payload com status forjado já foi ignorado pela validação.
      status: "ATIVA",
      dataReferencia: validado.dados.dataReferencia,
      observacao: validado.dados.observacao,
      criadoPor: administrador.id,
    },
  });

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Edita uma reserva. Só quatro campos mudam: imóvel, status, data e
 * observação. `corretorId`, `equipeId` e `criadoPor` ficam de fora do UPDATE
 * de propósito — o snapshot e a autoria são do momento da criação.
 *
 * O corretor original **não** é reconsultado: uma reserva de corretor hoje
 * inativo (ou de equipe hoje desativada) precisa continuar editável para ser
 * finalizada, cancelada ou corrigida.
 */
export async function editarReserva(
  id: string,
  _anterior: EstadoReserva,
  form: FormData,
): Promise<EstadoReserva> {
  await exigirAdministradorAtivo();

  // Defensivo: a página já validou, mas a action é endpoint próprio.
  if (!ehIdReservaLocacaoValido(id)) return { mensagem: "Esta reserva não existe mais." };

  const validado = validarEdicaoReserva(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  const existente = await prisma.reservaLocacao.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existente) return { mensagem: "Esta reserva não existe mais." };

  await prisma.reservaLocacao.update({
    where: { id },
    data: {
      imovelRef: validado.dados.imovelRef,
      // Livre entre os três estados: FINALIZADA marcada por engano volta a
      // ATIVA por edição explícita — não há máquina terminal na v1.
      status: validado.dados.status,
      dataReferencia: validado.dados.dataReferencia,
      observacao: validado.dados.observacao,
    },
  });

  revalidatePath(ROTA);
  redirect(ROTA);
}
