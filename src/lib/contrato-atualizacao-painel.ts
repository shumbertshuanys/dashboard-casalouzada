import type {
  AreaEquipes,
  AreaQuadroMensal,
  BigNumber,
  Equipe,
  Linha,
  Metrica,
  ValorComposto,
  VgvPeriodo,
} from "@/lib/apresentacao-painel";

/**
 * O contrato entre o servidor e a aba aberta na TV.
 *
 * Este módulo atravessa a fronteira: o servidor produz `LeituraPainel` em
 * `src/lib/leitura-painel.ts`, e o cliente valida o que chegou pela rede antes de
 * deixar entrar no estado. Por isso ele **não** é `server-only` e importa a
 * camada de apresentação apenas como `import type` — nada de cálculo, leitura ou
 * Prisma chega ao bundle do navegador por aqui.
 *
 * A leitura é fatiada nos **mesmos três blocos** da F3.3, cada um carregando o
 * próprio `estadoLeitura`. Sem essa granularidade a retenção do último valor não
 * teria como reter só o bloco que falhou (DEC-042).
 *
 * A validação é manual e verbosa de propósito: um schema de terceiros seria uma
 * dependência nova, e o que se valida aqui não é forma genérica — é **coerência**
 * entre o estado de leitura e o shape que o acompanha. Um payload que diga
 * `estadoLeitura: "OK"` carregando conteúdo `INDISPONIVEL` é contraditório, e
 * aceitá-lo apagaria dado bom da parede.
 */

export type EstadoLeituraBloco = "OK" | "INDISPONIVEL";

export type BlocoPeriodos = {
  estadoLeitura: EstadoLeituraBloco;
  vgvPeriodos: VgvPeriodo[];
  quadroMensal: AreaQuadroMensal;
};

export type BlocoAcumulados = {
  estadoLeitura: EstadoLeituraBloco;
  bigNumbers: BigNumber[];
};

export type BlocoEquipes = {
  estadoLeitura: EstadoLeituraBloco;
  area: AreaEquipes;
};

export type LeituraPainel = {
  /** Mês civil da leitura, como `YYYY-MM-01`. Guarda a retenção na virada. */
  competencia: string;
  lidoEmMs: number;
  /** `HH:mm` no fuso do escritório — o que o selo mostra. */
  horaLeitura: string;
  periodo: string;
  metricas: Metrica[];
  blocos: {
    periodos: BlocoPeriodos;
    acumulados: BlocoAcumulados;
    equipes: BlocoEquipes;
  };
};

const COMPETENCIA = /^(\d{4})-(\d{2})-01$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const ESTADOS_LEITURA = ["OK", "INDISPONIVEL"];
const ESTADOS_BIG_NUMBER = ["OK", "INDISPONIVEL", "SEM_SALDO_HISTORICO"];
const ESTADOS_VGV = ["OK", "INDISPONIVEL", "SEM_DADOS"];
const ESTADOS_QUADRO = ["OK", "INDISPONIVEL", "SEM_DADOS"];
const ESTADOS_AREA = ["OK", "SEM_DADOS", "INDISPONIVEL", "CONFIGURACAO_INVALIDA"];

/** Quantas equipes o painel v1 exige quando há quadros a mostrar (DEC-040). */
const EQUIPES_ESPERADAS = 3;
const METRICAS_ESPERADAS = 8;
const VGV_PERIODOS_ESPERADOS = 3;
const BIG_NUMBERS_ESPERADOS = 3;
const LINHAS_QUADRO_ESPERADAS = 7;

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function ehTextoNaoVazio(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

function ehArrayDeTamanho(valor: unknown, tamanho: number): valor is unknown[] {
  return Array.isArray(valor) && valor.length === tamanho;
}

function ehUmDe(valor: unknown, permitidos: string[]): boolean {
  return typeof valor === "string" && permitidos.includes(valor);
}

function ehValorComposto(valor: unknown): valor is ValorComposto {
  if (!ehObjeto(valor)) return false;
  if (typeof valor.valor !== "string") return false;
  if (valor.prefixo !== undefined && typeof valor.prefixo !== "string") return false;
  if (valor.sufixo !== undefined && typeof valor.sufixo !== "string") return false;
  return true;
}

function ehLinha(valor: unknown): valor is Linha {
  return ehObjeto(valor) && typeof valor.rotulo === "string" && typeof valor.valor === "string";
}

/** Competência é sempre o primeiro dia do mês, com mês real de 01 a 12. */
function ehCompetencia(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const partes = COMPETENCIA.exec(valor);
  if (!partes) return false;

  const mes = Number(partes[2]);
  return mes >= 1 && mes <= 12;
}

function ehMetricas(valor: unknown): valor is Metrica[] {
  if (!ehArrayDeTamanho(valor, METRICAS_ESPERADAS)) return false;

  const chaves = new Set<string>();
  for (const item of valor) {
    if (!ehObjeto(item)) return false;
    if (!ehTextoNaoVazio(item.chave) || !ehTextoNaoVazio(item.nome)) return false;
    chaves.add(item.chave);
  }

  // Chave repetida faria um ranking sobrescrever o outro no ciclo da TV.
  return chaves.size === METRICAS_ESPERADAS;
}

function ehVgvPeriodos(valor: unknown): valor is VgvPeriodo[] {
  if (!ehArrayDeTamanho(valor, VGV_PERIODOS_ESPERADOS)) return false;

  return valor.every(
    (item) =>
      ehObjeto(item) &&
      typeof item.rotulo === "string" &&
      ehValorComposto(item.valor) &&
      ehUmDe(item.estado, ESTADOS_VGV),
  );
}

function ehBigNumbers(valor: unknown): valor is BigNumber[] {
  if (!ehArrayDeTamanho(valor, BIG_NUMBERS_ESPERADOS)) return false;

  return valor.every(
    (item) =>
      ehObjeto(item) &&
      typeof item.rotulo === "string" &&
      ehValorComposto(item.numero) &&
      ehUmDe(item.estado, ESTADOS_BIG_NUMBER),
  );
}

function ehQuadroMensal(valor: unknown): valor is AreaQuadroMensal {
  if (!ehObjeto(valor)) return false;
  if (!ehUmDe(valor.estado, ESTADOS_QUADRO)) return false;
  if (!ehArrayDeTamanho(valor.linhas, LINHAS_QUADRO_ESPERADAS)) return false;

  return valor.linhas.every(ehLinha);
}

/**
 * Uma equipe, com um ranking por métrica do ciclo.
 *
 * As chaves vêm do próprio payload, não de `CHAVES_RANKING`: importar o núcleo
 * aqui puxaria a camada de cálculo para o bundle do cliente só para validar
 * nomes. O que importa é a **coerência interna** — todo ranking que o ciclo vai
 * pedir precisa existir, senão a rotação quebraria numa métrica qualquer.
 */
function ehEquipe(valor: unknown, chaves: string[]): valor is Equipe {
  if (!ehObjeto(valor)) return false;
  if (typeof valor.nome !== "string" || typeof valor.gerente !== "string") return false;
  if (typeof valor.totalCorretores !== "number" || !Number.isFinite(valor.totalCorretores)) {
    return false;
  }
  if (!ehObjeto(valor.rankings)) return false;

  const rankings = valor.rankings;
  return chaves.every((chave) => {
    const ranking = rankings[chave];
    return Array.isArray(ranking) && ranking.every(ehLinha);
  });
}

/**
 * A área de equipes, com a regra que mais importa aqui: **só os estados com
 * quadros carregam lista**.
 *
 * `INDISPONIVEL` e `CONFIGURACAO_INVALIDA` chegam sem a propriedade `equipes`, e
 * um payload que a trouxesse mesmo assim seria contraditório — abriria a porta
 * para a tela renderizar um subconjunto arbitrário, que é o que a DEC-040 proíbe.
 */
function ehAreaEquipes(valor: unknown, chaves: string[]): valor is AreaEquipes {
  if (!ehObjeto(valor)) return false;
  if (!ehUmDe(valor.estado, ESTADOS_AREA)) return false;

  const comQuadros = valor.estado === "OK" || valor.estado === "SEM_DADOS";

  if (!comQuadros) {
    return !("equipes" in valor);
  }

  if (!ehArrayDeTamanho(valor.equipes, EQUIPES_ESPERADAS)) return false;
  return valor.equipes.every((equipe) => ehEquipe(equipe, chaves));
}

/**
 * Coerência do bloco de períodos.
 *
 * Leitura indisponível obriga tudo dentro a estar `INDISPONIVEL`; leitura `OK`
 * proíbe qualquer `INDISPONIVEL` dentro. As duas direções importam: a primeira
 * impede que um bloco "caído" traga número, e a segunda impede que um bloco
 * "bom" traga `—` e apague o valor retido.
 */
function periodosCoerentes(bloco: BlocoPeriodos): boolean {
  const indisponivel = bloco.estadoLeitura === "INDISPONIVEL";
  const quadroIndisponivel = bloco.quadroMensal.estado === "INDISPONIVEL";
  const algumVgvIndisponivel = bloco.vgvPeriodos.some((item) => item.estado === "INDISPONIVEL");
  const todoVgvIndisponivel = bloco.vgvPeriodos.every((item) => item.estado === "INDISPONIVEL");

  return indisponivel
    ? quadroIndisponivel && todoVgvIndisponivel
    : !quadroIndisponivel && !algumVgvIndisponivel;
}

function acumuladosCoerentes(bloco: BlocoAcumulados): boolean {
  const indisponivel = bloco.estadoLeitura === "INDISPONIVEL";
  const algum = bloco.bigNumbers.some((item) => item.estado === "INDISPONIVEL");
  const todos = bloco.bigNumbers.every((item) => item.estado === "INDISPONIVEL");

  return indisponivel ? todos : !algum;
}

function equipesCoerentes(bloco: BlocoEquipes): boolean {
  return bloco.estadoLeitura === "INDISPONIVEL"
    ? bloco.area.estado === "INDISPONIVEL"
    : bloco.area.estado !== "INDISPONIVEL";
}

/**
 * O portão de entrada do que veio pela rede.
 *
 * Devolve `false` em vez de lançar: quem chama é o reducer do cliente, e um
 * payload recusado precisa deixar o estado anterior **intacto**, não derrubar a
 * TV. Falhar aqui é indistinguível, para a tela, de a requisição não ter
 * chegado — e é assim que deve ser.
 */
export function ehLeituraPainel(valor: unknown): valor is LeituraPainel {
  if (!ehObjeto(valor)) return false;

  if (!ehCompetencia(valor.competencia)) return false;
  if (typeof valor.lidoEmMs !== "number" || !Number.isFinite(valor.lidoEmMs)) return false;
  if (valor.lidoEmMs <= 0) return false;
  if (typeof valor.horaLeitura !== "string" || !HORA.test(valor.horaLeitura)) return false;
  if (!ehTextoNaoVazio(valor.periodo)) return false;
  if (!ehMetricas(valor.metricas)) return false;

  const chaves = valor.metricas.map((metrica) => metrica.chave);

  if (!ehObjeto(valor.blocos)) return false;
  const { periodos, acumulados, equipes } = valor.blocos;

  if (!ehObjeto(periodos) || !ehUmDe(periodos.estadoLeitura, ESTADOS_LEITURA)) return false;
  if (!ehVgvPeriodos(periodos.vgvPeriodos)) return false;
  if (!ehQuadroMensal(periodos.quadroMensal)) return false;

  if (!ehObjeto(acumulados) || !ehUmDe(acumulados.estadoLeitura, ESTADOS_LEITURA)) return false;
  if (!ehBigNumbers(acumulados.bigNumbers)) return false;

  if (!ehObjeto(equipes) || !ehUmDe(equipes.estadoLeitura, ESTADOS_LEITURA)) return false;
  if (!ehAreaEquipes(equipes.area, chaves)) return false;

  const blocos = valor.blocos as LeituraPainel["blocos"];

  return (
    periodosCoerentes(blocos.periodos) &&
    acumuladosCoerentes(blocos.acumulados) &&
    equipesCoerentes(blocos.equipes)
  );
}
