/**
 * Resolve qual equipe fica gravada num lançamento quando ele é editado.
 *
 * O problema: `Lancamento.equipeId` é a equipe do momento do fato, mas o
 * sistema **não guarda o histórico de qual corretor esteve em qual equipe em
 * cada data**. Então, se a edição troca o corretor, a equipe atual do novo
 * corretor não prova qual era a equipe verdadeira na data do evento — pode
 * ser, pode não ser.
 *
 * A saída aprovada (Recomendação C) é não adivinhar:
 *
 * - Enquanto o corretor não muda, a equipe gravada é preservada **literalmente**.
 *   Corrigir um valor ou uma data nunca reescreve o crédito de equipe.
 * - Se o corretor muda mas a equipe atual dele já é a mesma que está gravada,
 *   não há conflito e nada muda.
 * - Se muda e as equipes divergem, quem decide é o operador, entre duas opções
 *   apenas: preservar o que está gravado, ou corrigir para a equipe atual do
 *   novo corretor. Não existe terceira equipe escolhível.
 *
 * Função pura de propósito: não consulta banco, não conhece Prisma, e é a
 * única autoridade sobre a equipe resultante.
 */

export const ESCOLHAS = ["PRESERVAR", "CORRIGIR"] as const;
export type EscolhaEquipe = (typeof ESCOLHAS)[number];

export type MotivoRecusa = "ESCOLHA_OBRIGATORIA" | "ESCOLHA_INVALIDA";

export type ResolucaoEquipe =
  | { ok: true; equipeId: string }
  | { ok: false; erro: MotivoRecusa };

export type EntradaResolucao = {
  corretorIdAnterior: string;
  equipeIdArmazenada: string;
  corretorIdNovo: string;
  /** Equipe atual do corretor novo, lida do banco no momento do submit. */
  equipeAtualDoNovoCorretor: string;
  /** O que o operador escolheu, quando houve conflito. */
  escolha?: string | null;
};

export function ehEscolhaValida(valor: unknown): valor is EscolhaEquipe {
  return ESCOLHAS.includes(valor as EscolhaEquipe);
}

export function resolverEquipeDoLancamento({
  corretorIdAnterior,
  equipeIdArmazenada,
  corretorIdNovo,
  equipeAtualDoNovoCorretor,
  escolha,
}: EntradaResolucao): ResolucaoEquipe {
  // Ramo 1 — o corretor é o mesmo. A equipe gravada vale como está, sem
  // consultar nada: editar data, tipo, valor ou observação não é motivo para
  // reescrever histórico.
  if (corretorIdNovo === corretorIdAnterior) {
    return { ok: true, equipeId: equipeIdArmazenada };
  }

  // Ramo 2 — trocou de corretor, mas o novo já está na equipe que consta no
  // lançamento. Não há o que decidir, e perguntar seria ruído.
  if (equipeAtualDoNovoCorretor === equipeIdArmazenada) {
    return { ok: true, equipeId: equipeIdArmazenada };
  }

  // Ramo 3 — trocou de corretor e as equipes divergem. Só o operador sabe se o
  // evento pertencia à equipe gravada ou se o registro estava errado.
  if (escolha === undefined || escolha === null || escolha === "") {
    return { ok: false, erro: "ESCOLHA_OBRIGATORIA" };
  }
  if (!ehEscolhaValida(escolha)) {
    return { ok: false, erro: "ESCOLHA_INVALIDA" };
  }

  return {
    ok: true,
    equipeId: escolha === "PRESERVAR" ? equipeIdArmazenada : equipeAtualDoNovoCorretor,
  };
}
