"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdministradorAtivo } from "@/lib/admin/guarda";
import { buscarUltimaVendaCadastrada, celebrarSemBloquear, registrarCelebracao } from "@/lib/celebracao";
import { prisma } from "@/lib/db";
import { resolverEquipeDoLancamento } from "@/lib/lancamento-equipe";
import {
  decidirLancamentoParaCorretor,
  ehIdLancamentoValido,
  validarLancamento,
  type DadosEventoIndividual,
  type DadosVenda,
  type ErrosLancamento,
} from "@/lib/validacao/lancamento";

/**
 * Server Actions de lançamento.
 *
 * Uma submissão é um evento e vira **uma** linha de `Lancamento`: sem
 * `createMany`, sem laço e sem evento derivado. `CAPTACAO_VENDA` e
 * `CAPTACAO_EXCLUSIVA` são tipos independentes — lançar um nunca cria o outro.
 *
 * Desde a E3 há dois contratos de crédito (DEC-051):
 *
 * - **VENDA** grava `corretorId` e `equipeId` **`NULL`** e o crédito vai para
 *   `ParticipacaoVenda`, uma linha por participante, com a equipe lida do
 *   servidor e a `ordem` vinda da posição no formulário;
 * - **os demais tipos** continuam exatamente como antes: um corretor, a equipe
 *   atual dele gravada no evento, e o fluxo de conflito da Q7 na edição.
 *
 * Em nenhum dos dois a equipe, a ordem ou a autoria vêm do cliente.
 */

export type ValoresLancamento = {
  tipo: string;
  corretorId: string;
  /** Ids dos participantes da venda, na ordem em que o formulário os enviou. */
  participanteIds: string[];
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
    participanteIds: form
      .getAll("participanteId")
      .map((valor) => (typeof valor === "string" ? valor.trim() : ""))
      .filter((valor) => valor !== ""),
    dataReferencia: texto("dataReferencia"),
    valor: texto("valor"),
    valorProposta: texto("valorProposta"),
    statusProposta: texto("statusProposta"),
    imovelRef: texto("imovelRef"),
    observacao: texto("observacao"),
  };
}

/** Os campos do lançamento que não dependem do contrato de crédito. */
function camposComuns(dados: DadosVenda | DadosEventoIndividual) {
  return {
    tipo: dados.tipo,
    dataReferencia: dados.dataReferencia,
    valor: dados.valor,
    // Do resultado validado, nunca do FormData: no não-PROPOSTA os dois já
    // chegam `null`, e payload forjado não contamina outro tipo (DEC-053).
    valorProposta: dados.valorProposta,
    statusProposta: dados.statusProposta,
    imovelRef: dados.imovelRef,
    observacao: dados.observacao,
  };
}

/**
 * Uma participação pronta para o banco: crédito, snapshot e posição.
 *
 * `id` e `criadoEm` só aparecem quando a participação **já existia** e está
 * sendo preservada — é o que mantém a linha sendo a mesma através de uma
 * edição. Numa participação nova os dois ficam de fora, e os defaults do
 * schema geram identidade e carimbo próprios.
 *
 * O `id` nunca vem do cliente: ele sai da participação que a action releu do
 * banco pelo `lancamentoId` da própria venda.
 */
type ParticipacaoNova = {
  id?: string;
  corretorId: string;
  equipeId: string;
  ordem: number;
  criadoEm?: Date;
};

/**
 * Decide se cada participante pode receber crédito **novo** e devolve a equipe
 * que fica gravada em cada participação.
 *
 * Cada um passa pelas mesmas três exigências de um lançamento novo — existe,
 * está ativo, e a equipe atual dele está ativa —, e a equipe sai daqui, do
 * registro consultado, nunca do formulário. O select da tela não é fronteira de
 * segurança.
 */
async function resolverParticipantes(
  ids: readonly string[],
): Promise<{ ok: true; participantes: ParticipacaoNova[] } | { ok: false; erro: string }> {
  const corretores = await prisma.corretor.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      nomeExibicao: true,
      ativo: true,
      equipeId: true,
      equipe: { select: { ativa: true } },
    },
  });
  const porId = new Map(corretores.map((corretor) => [corretor.id, corretor]));

  const participantes: ParticipacaoNova[] = [];
  for (const [indice, id] of ids.entries()) {
    const corretor = porId.get(id) ?? null;
    const decisao = decidirLancamentoParaCorretor(corretor);
    if (!decisao.ok) {
      return {
        ok: false,
        erro: corretor === null ? decisao.erro : `${corretor.nomeExibicao} — ${decisao.erro}`,
      };
    }
    // A posição no formulário é a ordem da participação: primeiro da lista,
    // ordem 1 (decisão do proprietário em 2026-08-14).
    participantes.push({ corretorId: id, equipeId: decisao.equipeId, ordem: indice + 1 });
  }

  return { ok: true, participantes };
}

export async function criarLancamento(
  _anterior: EstadoLancamento,
  form: FormData,
): Promise<EstadoLancamento> {
  // A identidade sai da guarda, nunca do formulário — é ela que vira a autoria.
  const administrador = await exigirAdministradorAtivo();

  const validado = validarLancamento(form);
  if (!validado.ok) return { erros: validado.erros, valores: valoresEnviados(form) };

  if (validado.dados.tipo === "VENDA") {
    const resolvidos = await resolverParticipantes(validado.dados.participanteIds);
    if (!resolvidos.ok) {
      return { erros: { participanteIds: resolvidos.erro }, valores: valoresEnviados(form) };
    }

    // Escrita aninhada: lançamento e participações entram na **mesma**
    // transação do Prisma. Se qualquer participação for recusada — pela unique
    // de corretor ou de ordem —, o lançamento não fica para trás. Não existe
    // venda observável sem participação (DEC-051).
    const venda = await prisma.lancamento.create({
      data: {
        ...camposComuns(validado.dados),
        // O crédito da venda mora nas participações; o lançamento não credita.
        corretorId: null,
        equipeId: null,
        criadoPor: administrador.id,
        participacoes: { create: resolvidos.participantes },
      },
      select: { id: true },
    });

    // A comemoração na TV, e só para VENDA nova.
    //
    // O id sai do **próprio `create`**, nunca de uma consulta por "última
    // venda": duas vendas cadastradas ao mesmo tempo em duas abas fariam a
    // segunda leitura devolver a venda da outra pessoa, e a TV comemoraria o
    // fato errado. O `create` já sabe o que acabou de escrever.
    //
    // Fora da escrita comercial e depois dela, de propósito. Se estivesse na
    // mesma transação, uma falha ao gravar a celebração desfaria a venda — um
    // evento de tela derrubando um fato comercial que o operador acabou de
    // registrar. `celebrarSemBloquear` engole a falha e devolve se conseguiu;
    // o retorno é ignorado aqui porque não há nada a fazer com ele: o cadastro
    // deu certo de qualquer modo, e é isso que a tela precisa dizer.
    await celebrarSemBloquear(prisma, venda.id);
  } else {
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
        ...camposComuns(validado.dados),
        corretorId: validado.dados.corretorId,
        // Equipe do momento do fato. Se o corretor mudar de equipe depois, esta
        // linha continua creditada aqui.
        equipeId: decisao.equipeId,
        criadoPor: administrador.id,
      },
    });
  }

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
      participanteIds: [],
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
 * hora. Só existe entre tipos de participante único — venda não tem equipe no
 * lançamento para preservar ou corrigir.
 */
export type ConflitoEquipe = {
  equipeArmazenada: { id: string; nome: string };
  equipeAtualDoNovoCorretor: { id: string; nome: string };
  nomeNovoCorretor: string;
  equipeAtualApresentadaId: string;
};

export type EstadoEdicao = EstadoLancamento & { conflito?: ConflitoEquipe };

/** O lançamento como a edição precisa lê-lo, com o crédito atual dos dois tipos. */
type LancamentoParaEdicao = {
  id: string;
  tipo: string;
  corretorId: string | null;
  equipeId: string | null;
  criadoEm: Date;
  equipe: { id: string; nome: string } | null;
  participacoes: {
    id: string;
    corretorId: string;
    equipeId: string;
    ordem: number;
    criadoEm: Date;
  }[];
};

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
      tipo: true,
      corretorId: true,
      equipeId: true,
      criadoEm: true,
      equipe: { select: { id: true, nome: true } },
      participacoes: {
        // `id` entra para que a participação preservada continue sendo a
        // **mesma linha** depois de uma edição, e não uma cópia com UUID novo.
        select: { id: true, corretorId: true, equipeId: true, ordem: true, criadoEm: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  if (!atual) return { mensagem: "Este lançamento não existe mais." };

  const resultado =
    validado.dados.tipo === "VENDA"
      ? await salvarComoVenda(atual, validado.dados, form)
      : await salvarComoEventoIndividual(atual, validado.dados, form);

  if (resultado !== null) return resultado;

  revalidatePath(ROTA);
  redirect(ROTA);
}

/**
 * Reconcilia o elenco de uma venda (DEC-051, ordem aprovada pelo proprietário).
 *
 * Quem já participava e continua na lista é **preservado**: mesmo corretor,
 * mesmo snapshot de equipe, mesma ordem relativa entre eles. Quem entrou agora
 * vai para o **final**, na ordem do formulário. Depois disso a ordem é
 * recompactada em `1..N`, sem buracos.
 *
 * Não existe troca de corretor no lugar: trocar participante é remover um e
 * acrescentar outro, e o novo entra no fim com a equipe atual dele. Por isso o
 * snapshot de uma participação preservada **nunca** é rederivado — é ele que
 * mantém o crédito histórico quando o corretor muda de equipe depois.
 *
 * Preservar significa **a mesma linha**: `id`, `corretorId`, `equipeId` e
 * `criadoEm` atravessam a edição intactos. Só a `ordem` muda, e só pela
 * recompactação. O cruzamento é por `corretorId` contra as participações que a
 * action leu da própria venda — nenhum identificador vem do cliente, e por isso
 * não há como referenciar participação de outra venda.
 */
function reconciliarElenco(
  submetidos: readonly string[],
  existentes: readonly {
    id?: string;
    corretorId: string;
    equipeId: string;
    ordem: number;
    criadoEm: Date;
  }[],
): { preservados: ParticipacaoNova[]; novos: string[] } {
  const jaExistia = new Set(existentes.map((participacao) => participacao.corretorId));
  const continuam = new Set(submetidos);

  const preservados = existentes
    .filter((participacao) => continuam.has(participacao.corretorId))
    .map((participacao) => ({
      // `id` ausente só na conversão de outro tipo para venda: ali a
      // participação é criada agora, a partir do crédito que estava no
      // lançamento, e merece identidade nova.
      ...(participacao.id === undefined ? {} : { id: participacao.id }),
      corretorId: participacao.corretorId,
      equipeId: participacao.equipeId,
      // Recompactada depois, quando a lista final estiver montada.
      ordem: 0,
      criadoEm: participacao.criadoEm,
    }));

  return {
    preservados,
    novos: submetidos.filter((corretorId) => !jaExistia.has(corretorId)),
  };
}

/**
 * Salva o lançamento como VENDA — vindo de venda ou de outro tipo.
 *
 * Devolve `null` quando gravou, ou o estado a reapresentar quando recusou.
 */
async function salvarComoVenda(
  atual: LancamentoParaEdicao,
  dados: DadosVenda,
  form: FormData,
): Promise<EstadoEdicao | null> {
  // Numa conversão de outro tipo para VENDA, o crédito que estava no
  // lançamento é tratado como participação já existente **se** o mesmo corretor
  // continuar entre os participantes: o snapshot histórico dele é preservado em
  // vez de rederivado pela lotação de hoje.
  const existentes =
    atual.tipo === "VENDA"
      ? atual.participacoes
      : atual.corretorId !== null && atual.equipeId !== null
        ? [
            {
              corretorId: atual.corretorId,
              equipeId: atual.equipeId,
              ordem: 1,
              criadoEm: atual.criadoEm,
            },
          ]
        : [];

  const { preservados, novos } = reconciliarElenco(dados.participanteIds, existentes);

  // Só os participantes novos passam pela decisão de crédito: uma venda antiga
  // com participante hoje inativo continua editável para ser corrigida.
  const resolvidos = await resolverParticipantes(novos);
  if (!resolvidos.ok) {
    return { erros: { participanteIds: resolvidos.erro }, valores: valoresEnviados(form) };
  }

  // Preservados na ordem relativa antiga, novos no final, tudo recompactado.
  const elenco: ParticipacaoNova[] = [...preservados, ...resolvidos.participantes].map(
    (participacao, indice) => ({ ...participacao, ordem: indice + 1 }),
  );

  if (elenco.length === 0) {
    return {
      erros: { participanteIds: "Escolha pelo menos um participante da venda." },
      valores: valoresEnviados(form),
    };
  }

  await prisma.$transaction(async (tx) => {
    // Apagar e recriar em vez de remanejar: `UNIQUE (lancamento_id, ordem)`
    // recusaria estados intermediários da recompactação. Dentro da transação
    // ninguém observa a venda sem elenco, e quem foi preservado volta com o
    // mesmo `id` e o mesmo `criadoEm` — é a mesma participação, na mesma venda,
    // apenas eventualmente com outra posição.
    await tx.participacaoVenda.deleteMany({ where: { lancamentoId: atual.id } });
    await tx.lancamento.update({
      where: { id: atual.id },
      data: {
        ...camposComuns(dados),
        corretorId: null,
        equipeId: null,
        // `criadoPor` fica de fora: a autoria é de quem registrou o evento.
        participacoes: { create: elenco },
      },
    });
  });

  return null;
}

/**
 * Salva o lançamento como evento de participante único — vindo de venda ou não.
 *
 * Devolve `null` quando gravou, ou o estado a reapresentar quando recusou.
 */
async function salvarComoEventoIndividual(
  atual: LancamentoParaEdicao,
  dados: DadosEventoIndividual,
  form: FormData,
): Promise<EstadoEdicao | null> {
  // Conversão de VENDA para outro tipo: o evento passa a ter um corretor só, e
  // o elenco compartilhado é descartado. O corretor escolhido é crédito novo —
  // existe, está ativo, equipe atual ativa —, e não há equipe armazenada no
  // lançamento para o fluxo da Q7 preservar ou corrigir.
  if (atual.tipo === "VENDA") {
    const corretor = await prisma.corretor.findUnique({
      where: { id: dados.corretorId },
      select: { id: true, ativo: true, equipeId: true, equipe: { select: { ativa: true } } },
    });

    const decisao = decidirLancamentoParaCorretor(corretor);
    if (!decisao.ok) {
      return { erros: { corretorId: decisao.erro }, valores: valoresEnviados(form) };
    }

    await prisma.$transaction(async (tx) => {
      await tx.participacaoVenda.deleteMany({ where: { lancamentoId: atual.id } });
      await tx.lancamento.update({
        where: { id: atual.id },
        data: {
          ...camposComuns(dados),
          corretorId: dados.corretorId,
          equipeId: decisao.equipeId,
        },
      });
    });

    return null;
  }

  // Daqui para baixo é o fluxo de sempre entre tipos de participante único: a
  // equipe sai de `resolverEquipeDoLancamento`, que preserva o histórico por
  // padrão e só admite mudança quando o operador decide entre duas opções.
  const corretorIdAnterior = atual.corretorId as string;
  const equipeIdArmazenada = atual.equipeId as string;
  const trocouCorretor = dados.corretorId !== corretorIdAnterior;

  // O corretor novo é reconsultado; o original, não. Um lançamento de
  // ex-corretor precisa continuar corrigível mesmo com ele inativo hoje.
  let equipeAtualDoNovoCorretor = equipeIdArmazenada;
  let novoCorretor: { nomeExibicao: string; equipe: { id: string; nome: string } } | null = null;

  if (trocouCorretor) {
    const corretor = await prisma.corretor.findUnique({
      where: { id: dados.corretorId },
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
    corretorIdAnterior,
    equipeIdArmazenada,
    corretorIdNovo: dados.corretorId,
    equipeAtualDoNovoCorretor,
    escolha: respostaObsoleta ? null : escolha,
  });

  if (!resolucao.ok) {
    // Sem UPDATE. Devolve o conflito com os dados de agora, para o operador
    // decidir sobre a situação real.
    const conflito: ConflitoEquipe | undefined =
      novoCorretor && atual.equipe
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
    where: { id: atual.id },
    data: {
      ...camposComuns(dados),
      corretorId: dados.corretorId,
      equipeId: resolucao.equipeId,
      // `criadoPor` fica de fora: a autoria é de quem registrou o evento.
    },
  });

  return null;
}

/* ------------------------------------------------------------------ */
/* Exclusão                                                            */
/* ------------------------------------------------------------------ */

/**
 * Remove um lançamento em definitivo.
 *
 * Hard delete por decisão: o registro é um evento, e evento lançado por engano
 * some. Não há `deletadoEm` nem arquivamento, e não existe exclusão em massa —
 * só o `id` identifica o alvo. As participações de uma venda caem junto, pela
 * FK `Cascade` do schema: a participação é parte do fato, não um registro
 * independente, e por isso nada é apagado à mão aqui. O texto de confirmação
 * que o navegador mostra é conveniência; nada do que ele contém chega aqui.
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

/* ------------------------------------------------------------------ */
/* Celebração                                                          */
/* ------------------------------------------------------------------ */

/**
 * O resultado do disparo manual, para o botão que o C3 vai montar.
 *
 * Dois campos, e a separação importa: `sucesso` é "a TV vai comemorar";
 * `mensagem` é um estado operacional normal que merece explicação — não é erro,
 * e não deve chegar à tela com cara de falha.
 */
export type EstadoCelebracao = {
  sucesso?: string;
  mensagem?: string;
};

/**
 * Comemora de novo a última venda cadastrada.
 *
 * Existe porque o disparo automático acontece uma vez, no cadastro, e o
 * escritório às vezes quer a comemoração noutro momento — a TV estava desligada,
 * a sala estava vazia, o cliente chegou depois. Repetir o evento é o caminho
 * previsto para isso; editar a venda para "reativar" a celebração não é, e por
 * isso a edição continua sem gatilho nenhum.
 *
 * **A guarda é a primeira linha.** Nada é lido nem escrito antes dela: sem
 * sessão de administrador ativo agora, `exigirAdministradorAtivo` lança e a
 * execução para aí. Layout de `/admin` não autoriza coisa alguma, então a
 * verificação é feita aqui, perto da escrita.
 *
 * "Última venda" não é redecidida aqui: quem responde é
 * `buscarUltimaVendaCadastrada`, com o contrato do C1 — `criadoEm DESC, id
 * DESC`, e não `dataReferencia`. Reescrever a consulta nesta camada criaria uma
 * segunda definição de "última" para divergir da primeira.
 *
 * Cada acionamento grava uma `Celebracao` nova, com identidade e carimbo
 * próprios: é um evento a mais, não o mesmo evento reaproveitado. Nada do fato
 * comercial é tocado — nem valor, nem participantes, nem data, nem métrica.
 *
 * Sem `celebrarSemBloquear` aqui, e a assimetria é o ponto: no cadastro a
 * celebração é acessória e não pode derrubar a venda; aqui ela **é** a operação
 * pedida, e uma falha precisa aparecer em vez de virar um sucesso silencioso.
 *
 * Sem parâmetros: a ação não recebe entrada nenhuma — o alvo sai do banco, e
 * nada do cliente influencia qual venda é comemorada. O botão do C3 liga um
 * `useActionState` a ela com um invólucro de uma linha, que é menos superfície
 * do que carregar aqui dois argumentos que ninguém lê.
 */
export async function comemorarUltimaVenda(): Promise<EstadoCelebracao> {
  await exigirAdministradorAtivo();

  const ultima = await buscarUltimaVendaCadastrada(prisma);
  if (ultima === null) {
    // Estado operacional normal, não falha: um escritório que ainda não
    // registrou venda nenhuma não tem o que comemorar.
    return { mensagem: "Nenhuma venda cadastrada para comemorar." };
  }

  await registrarCelebracao(prisma, ultima.id);

  return { sucesso: "Comemoração enviada para a TV." };
}
