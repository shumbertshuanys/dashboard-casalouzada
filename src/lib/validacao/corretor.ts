import { deDataCivil, paraDataCivil } from "@/lib/datas";
import { ehIdEquipeValido } from "@/lib/validacao/equipe";

/**
 * Validação de corretor — TypeScript explícito sobre o `FormData` cru, como em
 * `equipe.ts`.
 *
 * Corretor não tem índice único, então não há P2002 a traduzir aqui. O que
 * existe de delicado é a `dataEntrada`: a coluna é `@db.Date`, dia de
 * calendário sem hora, e só `paraDataCivil` sabe montar isso sem o fuso da
 * máquina entrar no meio.
 *
 * A existência e o estado da equipe **não** são conferidos aqui: dependem de
 * consulta e do corretor que está sendo editado, então moram na action.
 */

export type DadosCorretor = {
  nomeCompleto: string;
  nomeExibicao: string;
  creci: string | null;
  fotoUrl: string | null;
  equipeId: string;
  dataEntrada: Date | null;
};

export type CampoCorretor = keyof DadosCorretor;
export type ErrosCorretor = Partial<Record<CampoCorretor, string>>;

export type ResultadoCorretor =
  | { ok: true; dados: DadosCorretor }
  | { ok: false; erros: ErrosCorretor };

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Campo textual opcional: em branco vira `null`, não string vazia. */
function opcional(valor: FormDataEntryValue | null): string | null {
  const limpo = texto(valor);
  return limpo === "" ? null : limpo;
}

export function validarCorretor(form: FormData): ResultadoCorretor {
  const erros: ErrosCorretor = {};

  const nomeCompleto = texto(form.get("nomeCompleto"));
  if (nomeCompleto === "") erros.nomeCompleto = "Informe o nome completo.";

  const nomeExibicao = texto(form.get("nomeExibicao"));
  if (nomeExibicao === "") erros.nomeExibicao = "Informe o nome de exibição.";

  // Sem regex de CRECI: o formato varia por estado e por época, e inventar
  // uma máscara recusaria registro legítimo.
  const creci = opcional(form.get("creci"));

  // Só texto nesta fase — upload e storage são refinamento posterior.
  const fotoUrl = opcional(form.get("fotoUrl"));

  const equipeId = texto(form.get("equipeId"));
  if (equipeId === "") {
    erros.equipeId = "Escolha a equipe.";
  } else if (!ehIdEquipeValido(equipeId)) {
    erros.equipeId = "Equipe inválida.";
  }

  // Vazio é legítimo: `dataEntrada` é opcional no schema.
  const dataBruta = texto(form.get("dataEntrada"));
  let dataEntrada: Date | null = null;
  if (dataBruta !== "") {
    try {
      dataEntrada = paraDataCivil(dataBruta);
    } catch {
      // A mensagem do helper cita formato interno; aqui a frase é para quem
      // está preenchendo.
      erros.dataEntrada = "Data de entrada inválida.";
    }
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    dados: { nomeCompleto, nomeExibicao, creci, fotoUrl, equipeId, dataEntrada },
  };
}

/**
 * Estado desejado de ativação. Mesmo contrato do equivalente em `equipe.ts`:
 * só `"true"` e `"false"` significam algo, e o resto é `null`. Não vale
 * reaproveitar a função de equipe — são domínios distintos e amarrá-los faria
 * uma mudança em um mexer no outro sem motivo.
 */
export function interpretarEstadoAtivoCorretor(
  valor: FormDataEntryValue | null,
): boolean | null {
  if (typeof valor !== "string") return null;
  if (valor === "true") return true;
  if (valor === "false") return false;
  return null;
}

/** Mesmo formato de UUID da equipe; helper próprio para o id do corretor. */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdCorretorValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

/** A equipe destino como o banco a devolveu, ou `null` se não existe. */
export type EquipeDestino = { id: string; ativa: boolean } | null;

export type DecisaoEquipe = { ok: true } | { ok: false; erro: string };

/**
 * Decide se o corretor pode ficar na equipe escolhida.
 *
 * A assimetria aqui é o miolo da regra:
 *
 * - **Manter** a equipe atual sempre vale, mesmo que ela tenha sido
 *   desativada. Um corretor que já pertence a uma equipe encerrada precisa
 *   continuar editável — senão, corrigir um CRECI exigiria transferi-lo, o que
 *   falsearia a lotação.
 * - **Entrar** numa equipe, seja criando ou transferindo, exige equipe ativa.
 *   O destino é escolha nova, e escolher uma equipe encerrada não faz sentido.
 *
 * `equipeAtualId` é `null` na criação, então lá toda equipe inativa é recusada.
 *
 * Roda no servidor sobre o registro reconsultado, não sobre o que o formulário
 * mandou: as opções do `<select>` são conveniência, não garantia.
 */
export function decidirEquipeDoCorretor(
  equipeIdEnviada: string,
  equipeAtualId: string | null,
  destino: EquipeDestino,
): DecisaoEquipe {
  // Continuar onde já está — vale inclusive em equipe inativa.
  if (equipeAtualId !== null && equipeIdEnviada === equipeAtualId) return { ok: true };

  if (destino === null) return { ok: false, erro: "Equipe não encontrada." };

  if (!destino.ativa) {
    return {
      ok: false,
      erro:
        equipeAtualId === null
          ? "Esta equipe está desativada e não recebe novos corretores."
          : "Não é possível transferir para uma equipe desativada.",
    };
  }

  return { ok: true };
}

/** Situações do filtro da listagem. Domínio fechado. */
export const SITUACOES = ["todos", "ativos", "inativos"] as const;
export type Situacao = (typeof SITUACOES)[number];

/**
 * Lê a situação do query param. Qualquer coisa fora do domínio cai em
 * `"todos"` — o filtro é conveniência de tela, e um parâmetro estranho não
 * pode esconder registros sem avisar.
 */
export function interpretarSituacao(valor: unknown): Situacao {
  return SITUACOES.includes(valor as Situacao) ? (valor as Situacao) : "todos";
}

/**
 * Lê o filtro de equipe do query param. Devolve `null` para "todas as
 * equipes", inclusive quando o valor é lixo: mandar texto arbitrário para uma
 * coluna `uuid` viraria erro de conversão, ou seja, 500 por causa de um
 * parâmetro de URL.
 */
export function interpretarFiltroEquipe(valor: unknown): string | null {
  return ehIdEquipeValido(valor) ? valor : null;
}

/** Formato do `<input type="date">`: `YYYY-MM-DD`, ou vazio. */
export function paraCampoData(data: Date | null): string {
  return data ? deDataCivil(data) : "";
}
