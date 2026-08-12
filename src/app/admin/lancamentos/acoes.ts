"use server";

import { revalidatePath } from "next/cache";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import {
  decidirLancamentoParaCorretor,
  validarLancamento,
  type ErrosLancamento,
} from "@/lib/validacao/lancamento";

/**
 * Criação de lançamento.
 *
 * Uma submissão é um evento e vira **uma** linha: um único
 * `prisma.lancamento.create`, sem `createMany`, sem laço e sem evento
 * derivado. `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` são tipos independentes —
 * lançar um nunca cria o outro.
 *
 * Não há edição nem exclusão nesta fatia.
 */

export type ValoresLancamento = {
  tipo: string;
  corretorId: string;
  dataReferencia: string;
  valor: string;
  imovelRef: string;
  observacao: string;
};

export type EstadoLancamento = {
  erros?: ErrosLancamento;
  mensagem?: string;
  sucesso?: string;
  valores?: ValoresLancamento;
};

const ROTA = "/admin/lancamentos";

function valoresEnviados(form: FormData): ValoresLancamento {
  const texto = (chave: string) => {
    const valor = form.get(chave);
    return typeof valor === "string" ? valor : "";
  };
  return {
    tipo: texto("tipo"),
    corretorId: texto("corretorId"),
    dataReferencia: texto("dataReferencia"),
    valor: texto("valor"),
    imovelRef: texto("imovelRef"),
    observacao: texto("observacao"),
  };
}

export async function criarLancamento(
  _anterior: EstadoLancamento,
  form: FormData,
): Promise<EstadoLancamento> {
  // A identidade sai da guarda, nunca do formulário — é ela que vira a autoria.
  const administrador = await exigirAdministradorAtivo();

  const validado = validarLancamento(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  // O corretor e a equipe atual dele são lidos agora, imediatamente antes do
  // create: é este `equipeId` que fica gravado no evento.
  const corretor = await prisma.corretor.findUnique({
    where: { id: validado.dados.corretorId },
    select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
  });

  const decisao = decidirLancamentoParaCorretor(corretor);
  if (!decisao.ok) {
    return { erros: { corretorId: decisao.erro }, valores: valoresEnviados(form) };
  }

  await prisma.lancamento.create({
    data: {
      tipo: validado.dados.tipo,
      corretorId: validado.dados.corretorId,
      // Equipe do momento do fato. Se o corretor mudar de equipe depois, esta
      // linha continua creditada aqui.
      equipeId: decisao.equipeId,
      dataReferencia: validado.dados.dataReferencia,
      valor: validado.dados.valor,
      imovelRef: validado.dados.imovelRef,
      observacao: validado.dados.observacao,
      criadoPor: administrador.id,
    },
  });

  revalidatePath(ROTA);

  // Sem redirecionar: a tela é de lançamento em sequência. Tipo e data ficam,
  // o resto é limpo pelo formulário.
  const enviados = valoresEnviados(form);
  return {
    sucesso: "Lançamento registrado.",
    valores: {
      tipo: enviados.tipo,
      dataReferencia: enviados.dataReferencia,
      corretorId: "",
      valor: "",
      imovelRef: "",
      observacao: "",
    },
  };
}
