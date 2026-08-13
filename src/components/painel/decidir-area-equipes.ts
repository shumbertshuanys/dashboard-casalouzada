import type { AreaEquipes, Equipe } from "@/lib/apresentacao-painel";

/**
 * O que a área de equipes desenha, decidido sem JSX.
 *
 * A pergunta "há quadros a mostrar?" é lógica, não visual, e separá-la do
 * componente permite testá-la sem renderizar nada — não há aqui React, CSS nem
 * banco. O `AreaEquipes` entra como `import type`: este módulo não carrega a
 * camada de apresentação em runtime.
 */

export type DecisaoAreaEquipes =
  | { tipo: "quadros"; equipes: Equipe[] }
  | { tipo: "estado"; titulo: string };

/**
 * `OK` e `SEM_DADOS` desenham os mesmos quadros: no segundo o elenco é conhecido
 * e só os valores chegaram como `—`, então esconder as equipes apagaria
 * informação verdadeira (DEC-039).
 *
 * `INDISPONIVEL` e `CONFIGURACAO_INVALIDA` não trazem lista — e é proposital que
 * não tragam (DEC-040, DEC-042). Aqui eles viram um título, e o componente
 * desenha o estado no lugar dos três quadros, sem inventar equipe nenhuma.
 *
 * O `switch` é exaustivo por construção: um quinto estado em `AreaEquipes` faz o
 * `default` falhar na atribuição a `never`, e o erro aparece na compilação em vez
 * de a área cair calada num ramo qualquer.
 */
export function decidirAreaEquipes(area: AreaEquipes): DecisaoAreaEquipes {
  switch (area.estado) {
    case "OK":
    case "SEM_DADOS":
      return { tipo: "quadros", equipes: area.equipes };

    case "INDISPONIVEL":
      return { tipo: "estado", titulo: "Dados das equipes indisponíveis" };

    case "CONFIGURACAO_INVALIDA":
      return { tipo: "estado", titulo: "Configuração de equipes inválida" };

    default: {
      const naoTratado: never = area;
      throw new Error(
        `Estado da área de equipes sem tratamento: ${JSON.stringify(naoTratado)}.`,
      );
    }
  }
}
