/**
 * Datas civis — dia de calendário sem hora, como as colunas `@db.Date` do schema
 * (`dataReferencia`, `dataEntrada`, `dataCorte`).
 *
 * Regra única deste módulo: **nada aqui olha o fuso da máquina**. Um `Date` civil
 * é sempre a meia-noite UTC do dia, e todo getter é UTC. Se a construção usasse
 * `new Date(ano, mes, dia)`, o mesmo código gravaria dias diferentes em máquinas
 * com fusos diferentes — e o servidor não roda no fuso de São Paulo.
 *
 * Os pontos que conhecem `America/Sao_Paulo` são `hojeEmSaoPaulo` e
 * `horaEmSaoPaulo`, porque ali a pergunta é outra: que dia — e que hora — é agora
 * para quem opera o sistema. Os dois saem da mesma travessia `Intl`, para não
 * existirem duas conversões de fuso que pudessem divergir.
 *
 * Recortes de período — mês, trimestre, ano — moram aqui desde a F3.1, como
 * janelas civis. Só os limites: o que se conta dentro deles é das fatias
 * seguintes.
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
 * Partes de data e hora já convertidas para o fuso do negócio.
 *
 * É a **única** travessia de fuso do módulo: `hojeEmSaoPaulo` e `horaEmSaoPaulo`
 * saem daqui. O `timeZone` é explícito, então às 23h de São Paulo — quando o
 * servidor em UTC já está no dia seguinte — o que vale é o relógio do escritório.
 */
function partesEmSaoPaulo(
  agora: Date,
  opcoes: Intl.DateTimeFormatOptions,
): (tipo: Intl.DateTimeFormatPartTypes) => string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_NEGOCIO,
    ...opcoes,
  }).formatToParts(agora);

  return (tipo) => partes.find((parte) => parte.type === tipo)?.value ?? "";
}

/**
 * Data civil de hoje em São Paulo, como `YYYY-MM-DD`.
 *
 * `agora` é injetável para o teste não depender do relógio.
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const pegar = partesEmSaoPaulo(agora, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return `${pegar("year")}-${pegar("month")}-${pegar("day")}`;
}

/**
 * Hora de São Paulo como `HH:mm`, em 24 horas.
 *
 * Serve ao selo "atualizado HH:MM" do painel: quem lê a TV precisa da hora do
 * escritório, não da do servidor. `hourCycle: "h23"` de propósito — com `h24` a
 * meia-noite sairia como `24:00`.
 */
export function horaEmSaoPaulo(agora: Date): string {
  const pegar = partesEmSaoPaulo(agora, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return `${pegar("hour")}:${pegar("minute")}`;
}

/**
 * Recorte de período como intervalo **semiaberto**: `[inicio, fimExclusivo)`.
 *
 * O fim é exclusivo de propósito. "Último instante do mês" é uma data que
 * depende da precisão escolhida — 23:59:59, 23:59:59.999, ou o microssegundo
 * que o banco guarda —, e cada escolha erra em algum ponto. Com fim exclusivo o
 * critério é sempre o mesmo: `data >= inicio && data < fimExclusivo`, que não
 * perde nem duplica nada na virada.
 *
 * Ambos os limites são datas civis: meia-noite UTC do dia, como o resto do
 * módulo.
 */
export type JanelaCivil = {
  inicio: Date;
  fimExclusivo: Date;
};

/**
 * Ano e mês civis correntes em São Paulo, o mês em base zero.
 *
 * Passa por `hojeEmSaoPaulo` de propósito: ali é o único lugar do módulo que
 * conhece o fuso do negócio. Daqui para frente tudo volta a ser data civil UTC,
 * e o fuso da máquina deixa de influir.
 */
function mesCivilCorrente(agora: Date): { ano: number; mes: number } {
  const hoje = paraDataCivil(hojeEmSaoPaulo(agora));
  return { ano: hoje.getUTCFullYear(), mes: hoje.getUTCMonth() };
}

/**
 * Meia-noite UTC do primeiro dia de um mês, com `mes` em base zero.
 *
 * Aceita `mes` igual a 12: `Date.UTC` rola para janeiro do ano seguinte, que é
 * exatamente o fim exclusivo de dezembro e do Q4 — daí não haver aritmética de
 * virada espalhada pelas três funções. O ano vem sempre de uma data civil já
 * validada por `paraDataCivil`, então o mapeamento de 0–99 para 1900+ que o
 * `Date.UTC` faz não alcança este ponto.
 */
function inicioDoMesUTC(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 1));
}

/** Mês civil corrente em São Paulo. Agosto/2026 → `[2026-08-01, 2026-09-01)`. */
export function mesCorrente(agora: Date = new Date()): JanelaCivil {
  const { ano, mes } = mesCivilCorrente(agora);
  return {
    inicio: inicioDoMesUTC(ano, mes),
    fimExclusivo: inicioDoMesUTC(ano, mes + 1),
  };
}

/**
 * Trimestre civil corrente em São Paulo — Q1 jan–mar, Q2 abr–jun, Q3 jul–set,
 * Q4 out–dez. Fixo no calendário: não é trimestre móvel nem "últimos três
 * meses". Setembro/2026 → `[2026-07-01, 2026-10-01)`.
 */
export function trimestreCorrente(agora: Date = new Date()): JanelaCivil {
  const { ano, mes } = mesCivilCorrente(agora);
  const primeiroMesDoTrimestre = Math.floor(mes / 3) * 3;
  return {
    inicio: inicioDoMesUTC(ano, primeiroMesDoTrimestre),
    fimExclusivo: inicioDoMesUTC(ano, primeiroMesDoTrimestre + 3),
  };
}

/** Ano civil corrente em São Paulo. 2026 → `[2026-01-01, 2027-01-01)`. */
export function anoCorrente(agora: Date = new Date()): JanelaCivil {
  const { ano } = mesCivilCorrente(agora);
  return {
    inicio: inicioDoMesUTC(ano, 0),
    fimExclusivo: inicioDoMesUTC(ano + 1, 0),
  };
}
