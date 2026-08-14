import { paraDataCivil } from "@/lib/datas";
import { ehIdCorretorValido } from "@/lib/validacao/corretor";

/**
 * Validação de reserva de locação — operação, não produção (DEC-055).
 *
 * A criação e a edição têm contratos diferentes de propósito:
 *
 * - na criação, o `status` **não é lido** do formulário. Toda reserva nasce
 *   `ATIVA`, e é a action que grava isso explicitamente — um payload com
 *   `status=FINALIZADA` forjado não muda nada;
 * - na edição, corretor e equipe **não são lidos**. A equipe é snapshot do
 *   momento da criação, e reinterpretá-la depois reescreveria histórico.
 *
 * Como nos lançamentos, `equipeId` e `criadoPor` nunca vêm do cliente.
 */

export const STATUS_RESERVA_LOCACAO = ["ATIVA", "FINALIZADA", "CANCELADA"] as const;

export type StatusReservaLocacaoValidado = (typeof STATUS_RESERVA_LOCACAO)[number];

export const ROTULOS_STATUS_RESERVA: Record<StatusReservaLocacaoValidado, string> = {
  ATIVA: "Ativa",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada",
};

/** Domínio fechado: nada além dos três chega ao Prisma. */
export function interpretarStatusReservaLocacao(
  valor: unknown,
): StatusReservaLocacaoValidado | null {
  return STATUS_RESERVA_LOCACAO.includes(valor as StatusReservaLocacaoValidado)
    ? (valor as StatusReservaLocacaoValidado)
    : null;
}

/** Mesmo formato canônico dos demais ids; helper próprio para a reserva. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdReservaLocacaoValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

/** A criação não carrega status: ele é decidido pela action, sempre ATIVA. */
export type DadosCriacaoReserva = {
  corretorId: string;
  imovelRef: string;
  dataReferencia: Date;
  observacao: string | null;
};

/** A edição não carrega corretor nem equipe: o snapshot é imutável. */
export type DadosEdicaoReserva = {
  status: StatusReservaLocacaoValidado;
  imovelRef: string;
  dataReferencia: Date;
  observacao: string | null;
};

export type CampoReserva = "corretorId" | "status" | "imovelRef" | "dataReferencia" | "observacao";
export type ErrosReserva = Partial<Record<CampoReserva, string>>;

export type ResultadoCriacaoReserva =
  | { ok: true; dados: DadosCriacaoReserva }
  | { ok: false; erros: ErrosReserva };

export type ResultadoEdicaoReserva =
  | { ok: true; dados: DadosEdicaoReserva }
  | { ok: false; erros: ErrosReserva };

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function opcional(valor: FormDataEntryValue | null): string | null {
  const limpo = texto(valor);
  return limpo === "" ? null : limpo;
}

/** Os três campos comuns aos dois contratos. */
function validarCamposComuns(form: FormData, erros: ErrosReserva) {
  const imovelRef = texto(form.get("imovelRef"));
  if (imovelRef === "") erros.imovelRef = "Informe o imóvel da reserva.";

  const dataBruta = texto(form.get("dataReferencia"));
  let dataReferencia: Date | null = null;
  if (dataBruta === "") {
    erros.dataReferencia = "Informe a data da reserva.";
  } else {
    try {
      dataReferencia = paraDataCivil(dataBruta);
    } catch {
      erros.dataReferencia = "Data inválida.";
    }
  }

  return { imovelRef, dataReferencia, observacao: opcional(form.get("observacao")) };
}

/**
 * Valida a criação. O `status` do payload é ignorado de propósito — não é
 * entrada confiável, e toda reserva nasce ATIVA (DEC-055).
 */
export function validarCriacaoReserva(form: FormData): ResultadoCriacaoReserva {
  const erros: ErrosReserva = {};

  const corretorId = texto(form.get("corretorId"));
  if (corretorId === "") {
    erros.corretorId = "Escolha o corretor.";
  } else if (!ehIdCorretorValido(corretorId)) {
    erros.corretorId = "Corretor inválido.";
  }

  const comuns = validarCamposComuns(form, erros);

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: {
      corretorId,
      imovelRef: comuns.imovelRef,
      dataReferencia: comuns.dataReferencia as Date,
      observacao: comuns.observacao,
    },
  };
}

/**
 * Valida a edição. Aqui o `status` é obrigatório e livre entre os três
 * estados — não há máquina terminal na v1: uma FINALIZADA marcada por engano
 * volta a ATIVA por edição explícita.
 */
export function validarEdicaoReserva(form: FormData): ResultadoEdicaoReserva {
  const erros: ErrosReserva = {};

  const status = interpretarStatusReservaLocacao(texto(form.get("status")));
  if (status === null) erros.status = "Escolha o status da reserva.";

  const comuns = validarCamposComuns(form, erros);

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: {
      status: status as StatusReservaLocacaoValidado,
      imovelRef: comuns.imovelRef,
      dataReferencia: comuns.dataReferencia as Date,
      observacao: comuns.observacao,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Decisão sobre quem pode receber reserva nova                        */
/* ------------------------------------------------------------------ */

/** O corretor como o banco devolve, com a equipe atual dele. */
export type CorretorParaReserva = {
  id: string;
  ativo: boolean;
  equipeId: string;
  equipe: { ativa: boolean };
} | null;

export type DecisaoReserva =
  | { ok: true; equipeId: string }
  | { ok: false; erro: string };

/**
 * Decide se dá para criar reserva para este corretor e devolve a equipe que
 * vira o snapshot. Mesmas três exigências dos lançamentos, mas função própria:
 * a reserva não tem a resolução de conflito da edição de lançamento, e
 * acoplar os dois módulos por três `if`s não compensaria.
 *
 * A equipe sai daqui, do registro consultado — nunca do formulário.
 */
export function decidirReservaParaCorretor(corretor: CorretorParaReserva): DecisaoReserva {
  if (corretor === null) return { ok: false, erro: "Corretor não encontrado." };
  if (!corretor.ativo) return { ok: false, erro: "Este corretor está inativo." };
  if (!corretor.equipe.ativa) {
    return {
      ok: false,
      erro:
        "A equipe atual deste corretor está desativada. " +
        "Atualize a equipe do corretor antes de reservar.",
    };
  }
  return { ok: true, equipeId: corretor.equipeId };
}
