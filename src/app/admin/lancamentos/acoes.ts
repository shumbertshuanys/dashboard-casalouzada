"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { prisma } from "@/lib/db";
import { resolverEquipeDoLancamento } from "@/lib/lancamento-equipe";
import {
  decidirLancamentoParaCorretor,
  ehIdLancamentoValido,
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
  valorProposta: string;
  statusProposta: string;
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
    valorProposta: texto("valorProposta"),
    statusProposta: texto("statusProposta"),
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
      // Do resultado validado, nunca do FormData: no não-PROPOSTA os dois já
      // chegam `null`, e payload forjado não contamina outro tipo (DEC-053).
      valorProposta: validado.dados.valorProposta,
      statusProposta: validado.dados.statusProposta,
      imovelRef: validado.dados.imovelRef,
      observacao: validado.dados.observacao,
      criadoPor: administrador.id,
    },
  });

  revalidatePath(ROTA);

  // Sem redirecionar: a tela é de lançamento em sequência. Tipo e data ficam,
  // o resto é limpo pelo formulário. Se o tipo mantido for PROPOSTA, o status
  // volta ao padrão AGUARDANDO — uma ACEITA registrada agora não pode
  // contaminar a próxima proposta digitada.
  const enviados = valoresEnviados(form);
  return {
    sucesso: "Lançamento registrado.",
    valores: {
      tipo: enviados.tipo,
      dataReferencia: enviados.dataReferencia,
      corretorId: "",
      valor: "",
      valorProposta: "",
      statusProposta: enviados.tipo === "PROPOSTA" ? "AGUARDANDO" : "",
      imovelRef: "",
      observacao: "",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Edição                                                              */
/* ------------------------------------------------------------------ */

/**
 * Contexto do conflito de equipe, devolvido ao formulário quando a troca de
 * corretor exige decisão do operador.
 *
 * `equipeAtualApresentadaId` volta no próximo submit **apenas** para detectar
 * que a situação mudou desde que a pergunta foi feita. Ele nunca decide a
 * equipe resultante: quem decide é o resolvedor, sobre o que o banco disser na
 * hora.
 */
export type ConflitoEquipe = {
  equipeArmazenada: { id: string; nome: string };
  equipeAtualDoNovoCorretor: { id: string; nome: string };
  nomeNovoCorretor: string;
  equipeAtualApresentadaId: string;
};

export type EstadoEdicao = EstadoLancamento & { conflito?: ConflitoEquipe };

/**
 * Edita um lançamento.
 *
 * A equipe **não** é um campo do formulário. Ela sai de
 * `resolverEquipeDoLancamento`, que preserva o histórico por padrão e só
 * admite mudança quando o operador decide explicitamente entre duas opções.
 */
export async function editarLancamento(
  id: string,
  _anterior: EstadoEdicao,
  form: FormData,
): Promise<EstadoEdicao> {
  await exigirAdministradorAtivo();

  // Defensivo: a página já validou, mas a action é endpoint próprio.
  if (!ehIdLancamentoValido(id)) return { mensagem: "Este lançamento não existe mais." };

  const validado = validarLancamento(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  const atual = await prisma.lancamento.findUnique({
    where: { id },
    select: {
      id: true,
      corretorId: true,
      equipeId: true,
      equipe: { select: { id: true, nome: true } },
    },
  });
  if (!atual) return { mensagem: "Este lançamento não existe mais." };

  const trocouCorretor = validado.dados.corretorId !== atual.corretorId;

  // O corretor novo é reconsultado; o original, não. Um lançamento de
  // ex-corretor precisa continuar corrigível mesmo com ele inativo hoje.
  let equipeAtualDoNovoCorretor = atual.equipeId;
  let novoCorretor: { nomeExibicao: string; equipe: { id: string; nome: string } } | null = null;

  if (trocouCorretor) {
    const corretor = await prisma.corretor.findUnique({
      where: { id: validado.dados.corretorId },
      select: {
        id: true,
        ativo: true,
        nomeExibicao: true,
        equipeId: true,
        equipe: { select: { id: true, nome: true, ativa: true } },
      },
    });

    const permitido = decidirLancamentoParaCorretor(corretor);
    if (!permitido.ok) {
      return { erros: { corretorId: permitido.erro }, valores: valoresEnviados(form) };
    }

    equipeAtualDoNovoCorretor = permitido.equipeId;
    novoCorretor = { nomeExibicao: corretor!.nomeExibicao, equipe: corretor!.equipe };
  }

  const escolhaBruta = form.get("escolhaEquipe");
  const escolha = typeof escolhaBruta === "string" ? escolhaBruta : null;

  // Se o operador respondeu sobre uma situação que já não é a de agora, a
  // resposta não vale — a equipe do novo corretor mudou no meio do caminho.
  const apresentada = form.get("equipeAtualApresentadaId");
  const respostaObsoleta =
    escolha !== null &&
    escolha !== "" &&
    typeof apresentada === "string" &&
    apresentada !== "" &&
    apresentada !== equipeAtualDoNovoCorretor;

  const resolucao = resolverEquipeDoLancamento({
    corretorIdAnterior: atual.corretorId,
    equipeIdArmazenada: atual.equipeId,
    corretorIdNovo: validado.dados.corretorId,
    equipeAtualDoNovoCorretor,
    escolha: respostaObsoleta ? null : escolha,
  });

  if (!resolucao.ok) {
    // Sem UPDATE. Devolve o conflito com os dados de agora, para o operador
    // decidir sobre a situação real.
    const conflito: ConflitoEquipe | undefined = novoCorretor
      ? {
          equipeArmazenada: { id: atual.equipe.id, nome: atual.equipe.nome },
          equipeAtualDoNovoCorretor: {
            id: novoCorretor.equipe.id,
            nome: novoCorretor.equipe.nome,
          },
          nomeNovoCorretor: novoCorretor.nomeExibicao,
          equipeAtualApresentadaId: equipeAtualDoNovoCorretor,
        }
      : undefined;

    return {
      conflito,
      valores: valoresEnviados(form),
      mensagem: respostaObsoleta
        ? "A equipe atual deste corretor mudou. Revise a escolha antes de salvar."
        : resolucao.erro === "ESCOLHA_INVALIDA"
          ? "Escolha inválida. Selecione uma das duas opções."
          : undefined,
    };
  }

  await prisma.lancamento.update({
    where: { id },
    data: {
      tipo: validado.dados.tipo,
      corretorId: validado.dados.corretorId,
      equipeId: resolucao.equipeId,
      dataReferencia: validado.dados.dataReferencia,
      // Tipo não monetário zera o valor: não sobra valor órfão. O mesmo vale
      // para os campos de proposta — PROPOSTA → outro tipo grava `null` nos
      // dois, e outro tipo → PROPOSTA exige status/imóvel na validação.
      valor: validado.dados.valor,
      valorProposta: validado.dados.valorProposta,
      statusProposta: validado.dados.statusProposta,
      imovelRef: validado.dados.imovelRef,
      observacao: validado.dados.observacao,
      // `criadoPor` fica de fora: a autoria é de quem registrou o evento.
    },
  });

  revalidatePath(ROTA);
  redirect(ROTA);
}

/* ------------------------------------------------------------------ */
/* Exclusão                                                            */
/* ------------------------------------------------------------------ */

/**
 * Remove um lançamento em definitivo.
 *
 * Hard delete por decisão: o registro é um evento, e evento lançado por engano
 * some. Não há `deletadoEm` nem arquivamento, e não existe exclusão em massa —
 * só o `id` identifica o alvo. O texto de confirmação que o navegador mostra é
 * conveniência; nada do que ele contém chega aqui.
 */
export async function excluirLancamento(form: FormData): Promise<void> {
  await exigirAdministradorAtivo();

  const id = form.get("id");
  if (!ehIdLancamentoValido(id)) return;

  const existente = await prisma.lancamento.findUnique({ where: { id }, select: { id: true } });
  if (!existente) return;

  await prisma.lancamento.delete({ where: { id } });

  revalidatePath(ROTA);
  redirect(ROTA);
}
