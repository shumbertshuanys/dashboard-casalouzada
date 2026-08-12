/**
 * Datas civis — dia de calendário sem hora, como as colunas `@db.Date` do schema
 * (`dataReferencia`, `dataEntrada`, `dataCorte`).
 *
 * Regra única deste módulo: **nada aqui olha o fuso da máquina**. Um `Date` civil
 * é sempre a meia-noite UTC do dia, e todo getter é UTC. Se a construção usasse
 * `new Date(ano, mes, dia)`, o mesmo código gravaria dias diferentes em máquinas
 * com fusos diferentes — e o servidor não roda no fuso de São Paulo.
 *
 * O único ponto que conhece `America/Sao_Paulo` é `hojeEmSaoPaulo`, porque ali a
 * pergunta é outra: que dia é hoje para quem opera o sistema.
 *
 * Recortes de período — mês, trimestre, ano — são da Fase 3 e não moram aqui.
 */

/** Fuso do negócio. O corte de dia segue o escritório, não o servidor. */
export const FUSO_NEGOCIO = "America/Sao_Paulo";

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converte `YYYY-MM-DD` na meia-noite UTC do dia.
 *
 * Lança se o formato não bater ou se o dia não existir no calendário — `Date.UTC`
 * aceita 30 de fevereiro e devolve 2 de março calado, então o resultado é
 * comparado de volta com o que foi pedido.
 */
export function paraDataCivil(valor: string): Date {
  const partes = FORMATO_ISO.exec(valor);
  if (!partes) {
    throw new Error(`Data civil inválida: ${JSON.stringify(valor)} — esperado YYYY-MM-DD.`);
  }

  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);

  const data = new Date(Date.UTC(ano, mes - 1, dia));

  // Pega tanto o dia inexistente (2026-02-30) quanto o mês fora de faixa
  // (2026-13-01). Pega também ano de dois dígitos: `Date.UTC` mapeia 0–99 para
  // 1900+, então "0026-01-01" viraria 1926 e é recusado aqui.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new Error(`Data civil inexistente no calendário: ${JSON.stringify(valor)}.`);
  }

  return data;
}

/** Volta para `YYYY-MM-DD`, sempre por getters UTC. */
export function deDataCivil(data: Date): string {
  const ano = String(data.getUTCFullYear()).padStart(4, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** `dd/mm/aaaa` para exibição. Derivado da forma UTC, sem passar por `Intl`. */
export function formatarDataBR(data: Date): string {
  const [ano, mes, dia] = deDataCivil(data).split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Data civil de hoje em São Paulo, como `YYYY-MM-DD`.
 *
 * `agora` é injetável para o teste não depender do relógio. O fuso entra por
 * `Intl` com `timeZone` explícito: às 23h de São Paulo o servidor em UTC já está
 * no dia seguinte, e é o dia do escritório que vale.
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);

  const pegar = (tipo: "year" | "month" | "day") =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}
