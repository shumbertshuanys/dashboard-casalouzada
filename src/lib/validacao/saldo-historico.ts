import { paraDataCivil } from "@/lib/datas";
import { normalizarValorBR } from "@/lib/dinheiro";

/**
 * Validação do saldo histórico — saldo de **abertura** dos big numbers.
 *
 * Duas coisas o separam do lançamento:
 *
 * - o conjunto de tipos é bem menor. Saldo de abertura só existe para venda e
 *   avaliação; captação, locação e proposta não têm acumulado anterior a
 *   registrar nesta versão;
 * - existe no máximo **uma linha por tipo**, garantida pelo índice único do
 *   banco. Aqui não há checagem prévia de duplicidade: ela abriria corrida
 *   entre o `SELECT` e o `INSERT`.
 *
 * Nada aqui calcula: `dataCorte` é armazenada, e o que ela significa para a
 * soma é assunto da Fase 3.
 */

/** Os únicos tipos com saldo de abertura na v1. */
export const TIPOS_SALDO_HISTORICO = ["VENDA", "AVALIACAO_GOOGLE"] as const;

export type TipoSaldoHistorico = (typeof TIPOS_SALDO_HISTORICO)[number];

export const ROTULOS_SALDO: Record<TipoSaldoHistorico, string> = {
  VENDA: "Vendas",
  AVALIACAO_GOOGLE: "Avaliações Google",
};

/** Domínio fechado: os outros cinco tipos do enum não entram. */
export function interpretarTipoSaldo(valor: unknown): TipoSaldoHistorico | null {
  return TIPOS_SALDO_HISTORICO.includes(valor as TipoSaldoHistorico)
    ? (valor as TipoSaldoHistorico)
    : null;
}

/** Só venda carrega dinheiro; avaliação é contagem. */
export function ehTipoComValor(tipo: TipoSaldoHistorico): boolean {
  return tipo === "VENDA";
}

/** Teto do `Int` do Prisma sobre `integer` do PostgreSQL. Limite técnico. */
export const MAX_QUANTIDADE = 2_147_483_647;

/** Avaliação não vira dinheiro: o valor gravado é sempre este. */
export const VALOR_ZERO = "0.00";

const INTEIRO_POSITIVO = /^\d+$/;

export type DadosSaldoHistorico = {
  tipo: TipoSaldoHistorico;
  quantidade: number;
  /** String decimal canônica; `"0.00"` para avaliação. */
  valorTotal: string;
  dataCorte: Date;
  descricao: string | null;
};

export type CampoSaldo = keyof DadosSaldoHistorico;
export type ErrosSaldo = Partial<Record<CampoSaldo, string>>;

export type ResultadoSaldo =
  | { ok: true; dados: DadosSaldoHistorico }
  | { ok: false; erros: ErrosSaldo };

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** `"0.00"`, `"0"` e `"000.00"` são zero. */
function ehZero(canonico: string): boolean {
  return /^0+(\.0+)?$/.test(canonico);
}

/**
 * Valida uma submissão de saldo histórico.
 *
 * `tipoFixo` é usado na edição: lá o tipo vem do registro no banco, não do
 * formulário, porque trocar o tipo de um saldo já cadastrado transformaria um
 * acumulado de vendas em avaliações.
 */
export function validarSaldoHistorico(
  form: FormData,
  tipoFixo?: TipoSaldoHistorico,
): ResultadoSaldo {
  const erros: ErrosSaldo = {};

  const tipo = tipoFixo ?? interpretarTipoSaldo(texto(form.get("tipo")));
  if (tipo === null) erros.tipo = "Escolha o tipo do saldo.";

  const quantidadeBruta = texto(form.get("quantidade"));
  let quantidade = 0;
  if (quantidadeBruta === "") {
    erros.quantidade = "Informe a quantidade.";
  } else if (!INTEIRO_POSITIVO.test(quantidadeBruta)) {
    erros.quantidade = "A quantidade deve ser um número inteiro.";
  } else {
    quantidade = Number(quantidadeBruta);
    if (quantidade < 1) {
      // Saldo de abertura com quantidade zero é o mesmo que não ter saldo —
      // e ausência já é representada pela ausência da linha.
      erros.quantidade = "A quantidade precisa ser maior que zero.";
    } else if (quantidade > MAX_QUANTIDADE) {
      erros.quantidade = "A quantidade informada é grande demais.";
    }
  }

  // Avaliação nunca vira dinheiro: o que vier no payload é descartado.
  let valorTotal = VALOR_ZERO;
  if (tipo !== null && ehTipoComValor(tipo)) {
    const bruto = texto(form.get("valorTotal"));
    if (bruto === "") {
      erros.valorTotal = "Informe o valor total.";
    } else {
      const canonico = normalizarValorBR(bruto);
      if (canonico === null) {
        erros.valorTotal = "Valor inválido.";
      } else if (ehZero(canonico)) {
        erros.valorTotal = "O valor precisa ser maior que zero.";
      } else {
        valorTotal = canonico;
      }
    }
  }

  const dataBruta = texto(form.get("dataCorte"));
  let dataCorte: Date | null = null;
  if (dataBruta === "") {
    erros.dataCorte = "Informe a data de corte.";
  } else {
    try {
      dataCorte = paraDataCivil(dataBruta);
    } catch {
      erros.dataCorte = "Data inválida.";
    }
  }

  const descricaoBruta = texto(form.get("descricao"));
  const descricao = descricaoBruta === "" ? null : descricaoBruta;

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: {
      tipo: tipo as TipoSaldoHistorico,
      quantidade,
      valorTotal,
      dataCorte: dataCorte as Date,
      descricao,
    },
  };
}

/** UUID canônico, como nos demais ids do projeto. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdSaldoHistoricoValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

/**
 * Violação do índice único de `tipo`. Detectada pela forma do erro, como em
 * `equipe.ts` — importar a classe amarraria este módulo ao cliente gerado.
 */
export function ehTipoDuplicado(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null || !("code" in erro)) return false;
  if ((erro as { code?: unknown }).code !== "P2002") return false;

  const alvo = (erro as { meta?: { target?: unknown } }).meta?.target;
  // `saldo_historico` tem um único índice único, o de `tipo`.
  if (alvo === undefined) return true;
  if (Array.isArray(alvo)) return alvo.includes("tipo");
  return typeof alvo === "string" && alvo.includes("tipo");
}

export const MENSAGEM_TIPO_DUPLICADO =
  "Já existe saldo histórico cadastrado para este tipo.";
