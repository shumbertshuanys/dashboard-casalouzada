import { mesCorrente, paraDataCivil } from "@/lib/datas";
import { normalizarValorBR } from "@/lib/dinheiro";

/**
 * Validação do VGV histórico mensal — o VGV **total consolidado** de uma
 * competência já encerrada.
 *
 * O que esta entidade é, e o que ela não é, decide quase tudo neste arquivo. Ela
 * é o número fechado que o escritório já apurava antes de o sistema existir,
 * mês a mês, vindo de um relatório histórico. Ela **não** é lançamento, não é
 * VENDA, não é saldo histórico e não credita corretor nem equipe — por isso aqui
 * não há tipo, não há corretor, não há participação e não há quantidade.
 *
 * `valorTotal` representa **exclusivamente valor de imóveis vendidos**,
 * semanticamente o mesmo que `Lancamento.valor` de uma VENDA contribui para o
 * VGV. Não é locação, comissão nem honorário.
 *
 * Duas coisas são deliberadamente de outra camada:
 *
 * - **duplicidade** é do banco, pelo índice único de `competencia`. Não há
 *   `SELECT` prévio aqui: ele abriria corrida entre a consulta e a escrita, como
 *   já está registrado em `saldo-historico.ts`;
 * - **o consumo** — VGV trimestral e anual — não existe ainda. Nada neste módulo
 *   soma, compara ou projeta valor.
 *
 * Nada aqui calcula. O que se faz é traduzir um formulário em domínio, ou
 * recusar com uma mensagem que o operador consiga agir sobre.
 */

/** `2026-07` — ano com quatro dígitos, mês com dois, e nada além disso. */
const COMPETENCIA_ISO = /^(\d{4})-(\d{2})$/;

/**
 * A competência do formulário como data civil, ou `null`.
 *
 * Devolve o **primeiro dia do mês** em meia-noite UTC, que é a mesma base de
 * `dataReferencia` e `dataCorte`. A representação de um mês é uma só: "agosto de
 * 2026" é `2026-08-01`, nunca `2026-08-14` — e é isso que o `CHECK` do banco
 * também exige.
 *
 * A validade do calendário **não** é reimplementada aqui: o dia 1 é montado e
 * entregue a `paraDataCivil`, que já recusa mês fora de faixa e já trata o
 * mapeamento de ano 0–99 para 1900+ que o `Date.UTC` faria calado. Um segundo
 * calendário neste arquivo seria uma segunda opinião sobre o mesmo assunto.
 *
 * Separada do validador de propósito: a forma `YYYY-MM` é sintaxe, e a exigência
 * de mês encerrado é regra de negócio. Quem precisa só converter — a edição, um
 * script — não deveria arrastar o relógio junto.
 */
export function interpretarCompetencia(valor: unknown): Date | null {
  if (typeof valor !== "string") return null;

  const partes = COMPETENCIA_ISO.exec(valor.trim());
  if (!partes) return null;

  try {
    return paraDataCivil(`${partes[1]}-${partes[2]}-01`);
  } catch {
    // Mês 00 e mês 13 caem aqui, pelo mesmo caminho que `2026-02-30`.
    return null;
  }
}

export type DadosVgvHistoricoMensal = {
  /** Primeiro dia do mês, em meia-noite UTC. */
  competencia: Date;
  /** String decimal canônica (`"4500000.00"`), nunca `number`. */
  valorTotal: string;
  observacao: string | null;
};

export type CampoVgvHistorico = keyof DadosVgvHistoricoMensal;
export type ErrosVgvHistorico = Partial<Record<CampoVgvHistorico, string>>;

export type ResultadoVgvHistorico =
  | { ok: true; dados: DadosVgvHistoricoMensal }
  | { ok: false; erros: ErrosVgvHistorico };

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** `"0.00"`, `"0"` e `"000.00"` são zero. Mesma regra de `saldo-historico.ts`. */
function ehZero(canonico: string): boolean {
  return /^0+(\.0+)?$/.test(canonico);
}

/**
 * Valida uma submissão de VGV histórico mensal.
 *
 * `agora` é injetável para o teste não depender do relógio — e é dele que sai a
 * única regra temporal: **só entra mês já encerrado**. A comparação é contra
 * `mesCorrente(agora).inicio`, que já resolve São Paulo num lugar só; às 23h do
 * dia 31 o escritório ainda está no mês velho, e o mês velho ainda não é
 * cadastrável. Reimplementar o fuso aqui criaria um segundo relógio para
 * divergir do primeiro.
 *
 * A regra **não** virou `CHECK` no banco de propósito: um predicado sobre
 * `now()` não é imutável, e a linha que passou hoje reprovaria num `pg_restore`
 * de amanhã. Invariante que envelhece é regra de aplicação.
 *
 * `competenciaFixa` é para a edição, no mesmo desenho de
 * `validarSaldoHistorico(form, tipoFixo)`: lá a competência vem do registro, não
 * do formulário, porque trocar o mês de um agregado já cadastrado moveria o
 * dinheiro de um período para outro em silêncio. Quando ela é passada, o campo
 * do formulário é ignorado por inteiro — inclusive quando ausente — e a regra
 * temporal não se aplica: um mês que já era passado no cadastro não volta a ser
 * futuro depois.
 */
export function validarVgvHistoricoMensal(
  form: FormData,
  agora: Date = new Date(),
  competenciaFixa?: Date,
): ResultadoVgvHistorico {
  const erros: ErrosVgvHistorico = {};

  let competencia: Date | null = competenciaFixa ?? null;

  if (competenciaFixa === undefined) {
    const bruta = texto(form.get("competencia"));
    if (bruta === "") {
      erros.competencia = "Informe a competência.";
    } else {
      const interpretada = interpretarCompetencia(bruta);
      if (interpretada === null) {
        erros.competencia = "Competência inválida. Use o formato AAAA-MM.";
      } else if (interpretada >= mesCorrente(agora).inicio) {
        // O mês corrente ainda está acontecendo: consolidá-lo agora registraria
        // como fechado um número que ainda vai mudar.
        erros.competencia = "Só é possível cadastrar um mês já encerrado.";
      } else {
        competencia = interpretada;
      }
    }
  }

  let valorTotal = "";
  const valorBruto = texto(form.get("valorTotal"));
  if (valorBruto === "") {
    erros.valorTotal = "Informe o valor total.";
  } else {
    const canonico = normalizarValorBR(valorBruto);
    if (canonico === null) {
      // `normalizarValorBR` recusa sinal, moeda e letras — é aqui que `-100` e
      // `R$ 100,00` caem, pelo mesmo caminho de qualquer outro texto inválido.
      erros.valorTotal = "Valor inválido.";
    } else if (ehZero(canonico)) {
      // Não existe VGV histórico zero. Ausência de histórico é **ausência da
      // linha**, e zero como marcador de ausência é exatamente a confusão que a
      // DEC-014 proíbe.
      erros.valorTotal = "O valor precisa ser maior que zero.";
    } else {
      valorTotal = canonico;
    }
  }

  const observacaoBruta = texto(form.get("observacao"));
  const observacao = observacaoBruta === "" ? null : observacaoBruta;

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: {
      competencia: competencia as Date,
      valorTotal,
      observacao,
    },
  };
}

/** UUID canônico, como nos demais ids do projeto. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdVgvHistoricoValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

/**
 * Violação do índice único de `competencia`.
 *
 * Detectada pela **forma** do erro, como em `saldo-historico.ts` e `equipe.ts`:
 * importar `PrismaClientKnownRequestError` amarraria este módulo puro ao cliente
 * gerado, que é justamente o que o padrão do projeto evita.
 *
 * Alvo ausente conta como duplicidade porque `vgv_historico_mensal` tem um
 * índice único só — o de `competencia`. Alvo presente e incompatível **não**
 * conta: um P2002 de outra tabela que atravessasse até aqui viraria uma mensagem
 * falsa sobre competência.
 */
export function ehCompetenciaDuplicada(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null || !("code" in erro)) return false;
  if ((erro as { code?: unknown }).code !== "P2002") return false;

  const alvo = (erro as { meta?: { target?: unknown } }).meta?.target;
  if (alvo === undefined) return true;
  if (Array.isArray(alvo)) return alvo.includes("competencia");
  return typeof alvo === "string" && alvo.includes("competencia");
}

export const MENSAGEM_COMPETENCIA_DUPLICADA =
  "Já existe VGV histórico cadastrado para esta competência.";
