/**
 * Validação de equipe — TypeScript explícito, sem biblioteca.
 *
 * Roda no servidor, sobre o `FormData` cru: o que o navegador impede é
 * conveniência, não garantia. Nada aqui checa unicidade de nome — quem garante
 * isso é o índice `equipes_nome_key`, e duplicar a checagem em código criaria
 * uma corrida entre o `SELECT` e o `INSERT`. O conflito é reconhecido por
 * `ehNomeDuplicado` e traduzido por `mensagemNomeDuplicado`.
 */

export type DadosEquipe = {
  nome: string;
  gerenteNome: string;
  ordemExibicao: number;
};

export type CampoEquipe = keyof DadosEquipe;
export type ErrosEquipe = Partial<Record<CampoEquipe, string>>;

export type ResultadoEquipe =
  | { ok: true; dados: DadosEquipe }
  | { ok: false; erros: ErrosEquipe };

/** Só dígitos: recusa decimal, sinal, notação científica e texto de uma vez. */
const INTEIRO_POSITIVO = /^\d+$/;

/**
 * Teto do `Int` do Prisma sobre `integer` do PostgreSQL. Não é limite de
 * negócio — é o que o campo comporta. Sem isso, um valor acima da faixa passa
 * pela validação e estoura lá no banco, virando erro 500 em vez de mensagem.
 */
export const MAX_ORDEM_EXIBICAO = 2_147_483_647;

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export function validarEquipe(form: FormData): ResultadoEquipe {
  const erros: ErrosEquipe = {};

  const nome = texto(form.get("nome"));
  if (nome === "") erros.nome = "Informe o nome da equipe.";

  const gerenteNome = texto(form.get("gerenteNome"));
  if (gerenteNome === "") erros.gerenteNome = "Informe o nome do gerente.";

  const ordemBruta = texto(form.get("ordemExibicao"));
  let ordemExibicao = 0;
  if (ordemBruta === "") {
    erros.ordemExibicao = "Informe a ordem de exibição.";
  } else if (!INTEIRO_POSITIVO.test(ordemBruta)) {
    erros.ordemExibicao = "A ordem deve ser um número inteiro.";
  } else {
    ordemExibicao = Number(ordemBruta);
    // A ordem é posição no painel: a primeira é 1, não 0.
    if (ordemExibicao < 1) {
      erros.ordemExibicao = "A ordem começa em 1.";
    } else if (ordemExibicao > MAX_ORDEM_EXIBICAO) {
      // Sem citar `integer` nem `int4`: o limite é técnico, mas a frase é para
      // quem está preenchendo o formulário.
      erros.ordemExibicao = "A ordem informada é grande demais.";
    }
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return { ok: true, dados: { nome, gerenteNome, ordemExibicao } };
}

/**
 * Lê o estado desejado de ativação a partir do formulário.
 *
 * Devolve `null` para qualquer coisa que não seja exatamente `"true"` ou
 * `"false"`. A comparação ingênua `valor === "true"` transformava campo
 * ausente, string vazia, `"1"` e lixo qualquer em `false` — ou seja, em
 * desativação silenciosa. Um payload manipulado não pode virar comando.
 */
export function interpretarEstadoAtivoEquipe(valor: FormDataEntryValue | null): boolean | null {
  // `File` também cai aqui: só string interessa.
  if (typeof valor !== "string") return null;
  if (valor === "true") return true;
  if (valor === "false") return false;
  return null;
}

/**
 * UUID canônico, no formato que o `@default(uuid())` do Prisma gera e que a
 * coluna `@db.Uuid` aceita.
 *
 * Serve para não mandar texto arbitrário a uma coluna `uuid`: o Postgres
 * recusaria com erro de conversão, que viraria 500 em vez de "não existe".
 */
const UUID_CANONICO = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ehIdEquipeValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_CANONICO.test(valor);
}

/**
 * `P2002` é a violação de índice único do Prisma. Detectado pela forma do erro,
 * não pela classe: o cliente é gerado em `src/generated/prisma` e importar a
 * classe só para um `instanceof` amarraria este módulo ao artefato de build.
 */
export function ehNomeDuplicado(erro: unknown): boolean {
  if (typeof erro !== "object" || erro === null || !("code" in erro)) return false;
  if ((erro as { code?: unknown }).code !== "P2002") return false;

  const alvo = (erro as { meta?: { target?: unknown } }).meta?.target;
  // Equipe tem um único índice único, o de `nome`; quando o alvo não vem
  // preenchido, tratar como sendo ele é o palpite certo.
  if (alvo === undefined) return true;
  if (Array.isArray(alvo)) return alvo.includes("nome");
  return typeof alvo === "string" && alvo.includes("nome");
}

/**
 * Mensagem do conflito de nome. A distinção importa: uma equipe desativada não
 * aparece de imediato na cabeça de quem cadastra, e sem essa frase a pessoa
 * fica tentando nomes novos sem entender o motivo da recusa.
 */
export function mensagemNomeDuplicado(equipeExistenteAtiva: boolean): string {
  return equipeExistenteAtiva
    ? "Já existe uma equipe com este nome."
    : "Já existe uma equipe com este nome e ela está desativada.";
}
