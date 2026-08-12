/**
 * Dinheiro — sempre string, nunca `number`.
 *
 * `Lancamento.valor` e `SaldoHistorico.valorTotal` são `Decimal(14, 2)`. Passar
 * por ponto flutuante no caminho de persistência corrompe centavos de forma
 * silenciosa (`0.1 + 0.2`), então este módulo não usa `parseFloat`, `Number`,
 * `+valor` nem aritmética — só manipulação de texto.
 *
 * A forma canônica é a string decimal que o Prisma aceita direto no campo
 * `Decimal`: dígitos, ponto, exatamente duas casas. Ex.: `"1250000.00"`.
 */

/** `Decimal(14, 2)`: 14 dígitos ao todo, 2 deles decimais. */
export const MAX_DIGITOS_INTEIROS = 12;
export const CASAS_DECIMAIS = 2;

const SO_DIGITOS = /^\d+$/;

/**
 * Junta os grupos de milhar num inteiro só, recusando agrupamento torto.
 * `1.250.000` vira `1250000`; `1234.500` e `1.50.000` são recusados.
 */
function desagruparMilhar(texto: string): string | null {
  const grupos = texto.split(".");
  if (grupos.length === 1) return SO_DIGITOS.test(texto) ? texto : null;

  const [primeiro, ...resto] = grupos;
  if (!SO_DIGITOS.test(primeiro) || primeiro.length > 3) return null;
  for (const grupo of resto) {
    if (!SO_DIGITOS.test(grupo) || grupo.length !== 3) return null;
  }
  return primeiro + resto.join("");
}

/** Tira zeros à esquerda mantendo pelo menos um dígito: `000123` → `123`. */
function semZerosAEsquerda(inteiro: string): string {
  const limpo = inteiro.replace(/^0+/, "");
  return limpo === "" ? "0" : limpo;
}

/**
 * Normaliza o que a pessoa digitou para a forma canônica, ou `null` se não for
 * um valor monetário representável em `Decimal(14, 2)`.
 *
 * Aceita as três formas que aparecem na prática:
 *
 * - `1.250.000,00` — pt-BR completo
 * - `1250000,00` — vírgula decimal sem milhar
 * - `1250000.00` — já canônico, colado de outro lugar
 * - `1.500` — ponto de milhar sozinho, lido como 1500
 *
 * A desambiguação do ponto solitário é pelo tamanho do grupo à direita: três
 * dígitos é milhar (`1.500` = 1500), uma ou duas casas é decimal (`1250000.00`),
 * qualquer outra coisa é recusada (`1.5000`).
 *
 * **Não** decide se zero é aceitável: `"0"` produz `"0.00"`, porque
 * `SaldoHistorico.valorTotal` tem default 0. Exigir valor positivo em VENDA e
 * LOCACAO é regra do validador de lançamento, não deste helper.
 */
export function normalizarValorBR(bruto: string): string | null {
  const texto = bruto.trim();
  if (texto === "") return null;

  // Recusa sinal, moeda, espaço interno e letras antes de qualquer análise —
  // aqui é onde `-100` cai.
  if (!/^[\d.,]+$/.test(texto)) return null;

  const virgulas = texto.split(",").length - 1;
  if (virgulas > 1) return null;

  let inteiro: string | null;
  let decimais: string;

  if (virgulas === 1) {
    const [antes, depois] = texto.split(",");
    // A vírgula é sempre decimal em pt-BR; três casas (`1,234`) não existe.
    if (!SO_DIGITOS.test(depois) || depois.length > CASAS_DECIMAIS) return null;
    inteiro = desagruparMilhar(antes);
    decimais = depois.padEnd(CASAS_DECIMAIS, "0");
  } else {
    const pontos = texto.split(".").length - 1;

    if (pontos === 0) {
      inteiro = SO_DIGITOS.test(texto) ? texto : null;
      decimais = "0".repeat(CASAS_DECIMAIS);
    } else if (pontos === 1) {
      const [antes, depois] = texto.split(".");
      if (!SO_DIGITOS.test(antes) || !SO_DIGITOS.test(depois)) return null;

      if (depois.length === 3) {
        inteiro = desagruparMilhar(texto);
        decimais = "0".repeat(CASAS_DECIMAIS);
      } else if (depois.length >= 1 && depois.length <= CASAS_DECIMAIS) {
        inteiro = antes;
        decimais = depois.padEnd(CASAS_DECIMAIS, "0");
      } else {
        return null;
      }
    } else {
      inteiro = desagruparMilhar(texto);
      decimais = "0".repeat(CASAS_DECIMAIS);
    }
  }

  if (inteiro === null) return null;

  const digitos = semZerosAEsquerda(inteiro);
  if (digitos.length > MAX_DIGITOS_INTEIROS) return null;

  return `${digitos}.${decimais}`;
}

/**
 * Formata a canônica para exibição: `1250000.00` → `R$ 1.250.000,00`.
 *
 * Feito por texto, não por `Intl.NumberFormat`, porque o caminho do `Intl` exige
 * converter para `number` — e um valor no topo do `Decimal(14, 2)` não cabe
 * exato num double. Não vale trocar precisão por formatação.
 *
 * Espera a string já validada por `normalizarValorBR`.
 */
export function formatarBRL(canonico: string): string {
  const [inteiro, decimais] = canonico.split(".");
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${comMilhar},${decimais}`;
}
