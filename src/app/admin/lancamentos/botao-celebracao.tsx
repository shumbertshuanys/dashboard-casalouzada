"use client";

import { startTransition, useActionState } from "react";
import { comemorarUltimaVenda, type EstadoCelebracao } from "./acoes";

/**
 * O botão "Comemorar última venda".
 *
 * Casca fina sobre a Server Action do C2, e nada além disso. **Toda** a regra
 * continua no servidor: qual é a última venda, a guarda administrativa e a
 * gravação do evento. Este arquivo não consulta banco, não conhece
 * `buscarUltimaVendaCadastrada` e não sabe o que é uma celebração — se soubesse,
 * existiriam duas respostas para "qual venda comemorar", livres para divergir.
 *
 * Clicar aqui **não** cria lançamento, participação, valor, VGV nem ranking:
 * cria uma `Celebracao` e mais nada. O backend já garante isso, e a UI não abre
 * um segundo caminho.
 *
 * `useActionState` exige uma ação no formato `(estado, payload)`; a action não
 * recebe entrada nenhuma — o alvo sai do banco, e nada vindo do cliente escolhe
 * qual venda comemorar. O invólucro de uma linha abaixo faz a ponte entre os
 * dois formatos sem alargar a superfície da action.
 *
 * Não é `<form>`: não há dado a submeter. O disparo vai por `startTransition`,
 * que é como uma ação sem formulário é acionada no App Router.
 */
export function BotaoCelebracao() {
  const [estado, acionar, pendente] = useActionState<EstadoCelebracao, void>(
    () => comemorarUltimaVenda(),
    {},
  );

  // Os dois estados de retorno do C2 têm pesos diferentes: `sucesso` é "a TV vai
  // comemorar"; `mensagem` é estado operacional normal — não há venda ainda — e
  // não deve aparecer com cara de erro. Falha real da action não é tratada aqui
  // de propósito: ela sobe pelo mecanismo de erro da aplicação em vez de virar
  // um sucesso silencioso.
  const retorno = estado.sucesso ?? estado.mensagem ?? null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => startTransition(acionar)}
        // Desabilitado enquanto executa: dois cliques seguidos gravariam duas
        // celebrações e a TV comemoraria a mesma venda duas vezes.
        disabled={pendente}
        // Hierarquia secundária ao lado de "Novo lançamento": comemorar é
        // acessório, cadastrar é o trabalho.
        className="rounded-md border border-destaque/50 px-4 py-2 text-sm font-medium text-destaque disabled:opacity-50"
      >
        {pendente ? "Enviando..." : "Comemorar última venda"}
      </button>

      {retorno === null ? null : (
        <p
          className={`text-xs ${estado.sucesso ? "text-destaque" : "text-texto-secundario"}`}
          role="status"
          aria-live="polite"
        >
          {retorno}
        </p>
      )}
    </div>
  );
}
