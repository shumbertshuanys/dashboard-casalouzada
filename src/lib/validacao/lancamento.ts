import { paraDataCivil } from "@/lib/datas";
import { normalizarValorBR } from "@/lib/dinheiro";
import { ehIdCorretorValido } from "@/lib/validacao/corretor";
import { ehIdEquipeValido } from "@/lib/validacao/equipe";

/**
 * Validação de lançamento — TypeScript manual sobre o `FormData`.
 *
 * Duas coisas de propósito **não** vêm do formulário:
 *
 * - `equipeId`, porque a equipe do evento é a equipe atual do corretor no
 *   instante do lançamento, lida do banco pela action;
 * - `criadoPor`, que vem da guarda administrativa.
 *
 * Aceitar qualquer um dos dois pelo cliente permitiria forjar crédito de
 * equipe ou autoria.
 */

/** Os sete do enum `tipo_lancamento`, na ordem do schema. */
export const TIPOS = [
  "VENDA",
  "LOCACAO",
  "CAPTACAO_VENDA",
  "CAPTACAO_EXCLUSIVA",
  "CAPTACAO_LOCACAO",
  "PROPOSTA",
  "AVALIACAO_GOOGLE",
] as const;

export type TipoLancamento = (typeof TIPOS)[number];

/**
 * Só estes dois carregam dinheiro — é o que a seção 3 do PLANO chama de
 * "preenchido apenas em vendas e locações". PROPOSTA fica de fora de
 * propósito: `valorProposta` é campo próprio e nunca vira VGV (DEC-053).
 */
export const TIPOS_MONETARIOS: readonly TipoLancamento[] = ["VENDA", "LOCACAO"];

export function ehTipoMonetario(tipo: TipoLancamento): boolean {
  return TIPOS_MONETARIOS.includes(tipo);
}

/** Os três estados do pipeline de uma proposta (DEC-053). */
export const STATUS_PROPOSTA = ["AGUARDANDO", "ACEITA", "REJEITADA"] as const;

export type StatusPropostaLancamento = (typeof STATUS_PROPOSTA)[number];

export const ROTULOS_STATUS_PROPOSTA: Record<StatusPropostaLancamento, string> = {
  AGUARDANDO: "Aguardando",
  ACEITA: "Aceita",
  REJEITADA: "Rejeitada",
};

/** Domínio fechado: nada além dos três chega ao Prisma. */
export function interpretarStatusProposta(valor: unknown): StatusPropostaLancamento | null {
  return STATUS_PROPOSTA.includes(valor as StatusPropostaLancamento)
    ? (valor as StatusPropostaLancamento)
    : null;
}

/** Rótulos de tela. `CAPTACAO_VENDA` e `CAPTACAO_EXCLUSIVA` são linhas distintas. */
export const ROTULOS: Record<TipoLancamento, string> = {
  VENDA: "Venda",
  LOCACAO: "Locação",
  CAPTACAO_VENDA: "Captação de venda",
  CAPTACAO_EXCLUSIVA: "Exclusividade",
  CAPTACAO_LOCACAO: "Captação de locação",
  PROPOSTA: "Proposta",
  AVALIACAO_GOOGLE: "Avaliação Google",
};

/** Domínio fechado: nada além dos sete chega ao Prisma. */
export function interpretarTipo(valor: unknown): TipoLancamento | null {
  return TIPOS.includes(valor as TipoLancamento) ? (valor as TipoLancamento) : null;
}

/** Mesmo formato canônico dos demais ids; helper próprio para o lançamento. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdLancamentoValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

export type DadosLancamento = {
  tipo: TipoLancamento;
  corretorId: string;
  dataReferencia: Date;
  /** String decimal canônica, ou `null` nos tipos não monetários. */
  valor: string | null;
  /** String decimal canônica; só em PROPOSTA, e mesmo lá opcional (DEC-053). */
  valorProposta: string | null;
  /** Obrigatório em PROPOSTA; `null` nos demais tipos. */
  statusProposta: StatusPropostaLancamento | null;
  imovelRef: string | null;
  observacao: string | null;
};

export type CampoLancamento = keyof DadosLancamento;
export type ErrosLancamento = Partial<Record<CampoLancamento, string>>;

export type ResultadoLancamento =
  | { ok: true; dados: DadosLancamento }
  | { ok: false; erros: ErrosLancamento };

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function opcional(valor: FormDataEntryValue | null): string | null {
  const limpo = texto(valor);
  return limpo === "" ? null : limpo;
}

/** `"0.00"`, `"0"` e `"000.00"` são zero; qualquer dígito não-zero não é. */
function ehZero(canonico: string): boolean {
  return /^0+\.0+$/.test(canonico);
}

/**
 * Valida uma submissão e devolve **um** conjunto de dados — nunca uma lista.
 * Uma submissão é um evento, e um evento é uma linha.
 */
export function validarLancamento(form: FormData): ResultadoLancamento {
  const erros: ErrosLancamento = {};

  const tipo = interpretarTipo(texto(form.get("tipo")));
  if (tipo === null) erros.tipo = "Escolha o tipo do lançamento.";

  const corretorId = texto(form.get("corretorId"));
  if (corretorId === "") {
    erros.corretorId = "Escolha o corretor.";
  } else if (!ehIdCorretorValido(corretorId)) {
    erros.corretorId = "Corretor inválido.";
  }

  const dataBruta = texto(form.get("dataReferencia"));
  let dataReferencia: Date | null = null;
  if (dataBruta === "") {
    erros.dataReferencia = "Informe a data do lançamento.";
  } else {
    try {
      dataReferencia = paraDataCivil(dataBruta);
    } catch {
      erros.dataReferencia = "Data inválida.";
    }
  }

  // O valor só é analisado quando o tipo comporta dinheiro. Nos demais, o que
  // vier é descartado sem reclamar: trocar de VENDA para PROPOSTA no meio do
  // preenchimento deixa um valor órfão no payload, e isso não é erro de quem
  // está lançando.
  let valor: string | null = null;
  if (tipo !== null && ehTipoMonetario(tipo)) {
    const bruto = texto(form.get("valor"));
    if (bruto === "") {
      erros.valor = "Informe o valor.";
    } else {
      const canonico = normalizarValorBR(bruto);
      if (canonico === null) {
        erros.valor = "Valor inválido.";
      } else if (ehZero(canonico)) {
        // `normalizarValorBR` aceita zero de propósito — é o default do saldo
        // histórico. Para lançamento, zero não é evento.
        erros.valor = "O valor precisa ser maior que zero.";
      } else {
        valor = canonico;
      }
    }
  }

  const imovelRef = opcional(form.get("imovelRef"));
  const observacao = opcional(form.get("observacao"));

  // Os campos de proposta só existem em PROPOSTA. Nos demais tipos, o que
  // vier no payload é zerado sem virar erro — um payload forjado não pode
  // contaminar outro tipo, e trocar de PROPOSTA para outro tipo no meio do
  // preenchimento não é erro de quem está lançando (DEC-053).
  let statusProposta: StatusPropostaLancamento | null = null;
  let valorProposta: string | null = null;

  if (tipo === "PROPOSTA") {
    statusProposta = interpretarStatusProposta(texto(form.get("statusProposta")));
    if (statusProposta === null) {
      erros.statusProposta = "Escolha o status da proposta.";
    }

    // Opcional, mas quando vem precisa ser dinheiro válido e positivo.
    const brutoProposta = texto(form.get("valorProposta"));
    if (brutoProposta !== "") {
      const canonico = normalizarValorBR(brutoProposta);
      if (canonico === null) {
        erros.valorProposta = "Valor inválido.";
      } else if (ehZero(canonico)) {
        erros.valorProposta = "O valor precisa ser maior que zero.";
      } else {
        valorProposta = canonico;
      }
    }

    // O imóvel é o que identifica a proposta na operação e na TV. Obrigatório
    // em novas submissões e edições; a proposta legada sem imóvel continua
    // válida no banco enquanto não for editada (DEC-053).
    if (imovelRef === null) {
      erros.imovelRef = "Informe o imóvel da proposta.";
    }
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: {
      tipo: tipo as TipoLancamento,
      corretorId,
      dataReferencia: dataReferencia as Date,
      valor,
      valorProposta,
      statusProposta,
      imovelRef,
      observacao,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Decisão sobre quem pode receber lançamento                          */
/* ------------------------------------------------------------------ */

/** O corretor como o banco devolve, com a equipe atual dele. */
export type CorretorParaLancamento = {
  id: string;
  ativo: boolean;
  equipeId: string;
  equipe: { ativa: boolean };
} | null;

export type DecisaoLancamento =
  | { ok: true; equipeId: string }
  | { ok: false; erro: string };

/**
 * Decide se dá para lançar para este corretor e devolve a equipe que será
 * gravada no evento.
 *
 * A equipe sai daqui, do registro consultado — nunca do formulário. É o que
 * mantém o histórico estável quando o corretor troca de equipe depois.
 *
 * Equipe desativada barra o lançamento **novo**: creditar produção a uma
 * equipe encerrada mistura o histórico dela com o presente. A saída é
 * operacional, não automática — nem o corretor é movido, nem outra equipe é
 * escolhida por conta própria.
 */
export function decidirLancamentoParaCorretor(
  corretor: CorretorParaLancamento,
): DecisaoLancamento {
  if (corretor === null) return { ok: false, erro: "Corretor não encontrado." };
  if (!corretor.ativo) return { ok: false, erro: "Este corretor está inativo." };
  if (!corretor.equipe.ativa) {
    return {
      ok: false,
      erro:
        "A equipe atual deste corretor está desativada. " +
        "Atualize a equipe do corretor antes de lançar.",
    };
  }
  return { ok: true, equipeId: corretor.equipeId };
}

/* ------------------------------------------------------------------ */
/* Filtros e paginação da listagem                                     */
/* ------------------------------------------------------------------ */

export const POR_PAGINA = 50;

export type FiltrosLancamentos = {
  de: Date | null;
  ate: Date | null;
  corretorId: string | null;
  equipeId: string | null;
  tipo: TipoLancamento | null;
};

/** Data de filtro: inválida vira `null`, ou seja, filtro neutro. */
function dataFiltro(valor: unknown): Date | null {
  if (typeof valor !== "string" || valor.trim() === "") return null;
  try {
    return paraDataCivil(valor.trim());
  } catch {
    return null;
  }
}

/**
 * Lê os filtros da query string. Todo campo inválido some em vez de virar
 * erro: parâmetro de URL é entrada externa, e texto arbitrário numa coluna
 * `uuid` ou `date` daria 500.
 */
export function interpretarFiltrosLancamentos(
  params: Record<string, string | string[] | undefined>,
): FiltrosLancamentos {
  const primeiro = (chave: string) => {
    const valor = params[chave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const corretorId = primeiro("corretor");
  const equipeId = primeiro("equipe");

  return {
    de: dataFiltro(primeiro("de")),
    ate: dataFiltro(primeiro("ate")),
    corretorId: ehIdCorretorValido(corretorId) ? corretorId : null,
    equipeId: ehIdEquipeValido(equipeId) ? equipeId : null,
    tipo: interpretarTipo(primeiro("tipo")),
  };
}

/**
 * Página da listagem. Só inteiro positivo; qualquer outra coisa é a página 1 —
 * inclusive `0`, negativo, decimal e texto.
 *
 * A página ser um inteiro seguro não basta: quem vai para o banco é o `skip`,
 * e `(pagina - 1) * POR_PAGINA` sai da faixa segura muito antes do teto da
 * página. Com `POR_PAGINA = 50`, `Number.MAX_SAFE_INTEGER` como página produz
 * um `skip` de 450359962737049500, que já não é representável exatamente.
 *
 * Por isso a última condição é sobre o próprio `skip`, derivada de
 * `POR_PAGINA` em vez de um teto escrito à mão: trocar o tamanho da página
 * continua seguro sem ninguém precisar recalcular o limite.
 */
export function interpretarPagina(valor: unknown): number {
  if (typeof valor !== "string") return 1;

  const limpo = valor.trim();
  if (!/^\d+$/.test(limpo)) return 1;

  const numero = Number(limpo);
  if (!Number.isSafeInteger(numero) || numero < 1) return 1;

  const skip = (numero - 1) * POR_PAGINA;
  if (!Number.isSafeInteger(skip)) return 1;

  return numero;
}
