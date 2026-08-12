import "server-only";
import { prisma } from "@/lib/db";
import { lerSessao } from "@/lib/sessao-servidor";
import type { Sessao } from "@/lib/sessao";

/**
 * Guarda da área administrativa.
 *
 * O `src/proxy.ts` confere só a assinatura do JWT, que vale 7 dias. Se a conta
 * for desativada nesse meio-tempo o cookie continua válido e o middleware deixa
 * passar — por isso toda operação administrativa consulta o banco e exige
 * `ativo === true` agora, não no momento do login.
 *
 * **`src/app/admin/layout.tsx` não é fronteira de autorização.** Layouts do App
 * Router são reaproveitados entre navegações e não reexecutam a cada leitura, de
 * modo que passar pelo layout não autoriza coisa alguma. Cada página que ler
 * dado administrativo e cada Server Action precisa chamar
 * `exigirAdministradorAtivo()` por conta própria, perto da leitura.
 */

export type Administrador = {
  id: string;
  nome: string;
  email: string;
};

export type MotivoNegacao = "sem-sessao" | "conta-inexistente" | "conta-inativa";

/** Erro único da guarda. Não existe hierarquia: ou autoriza, ou é isto. */
export class NaoAutorizadoError extends Error {
  readonly motivo: MotivoNegacao;

  constructor(motivo: MotivoNegacao) {
    super(`Acesso administrativo negado: ${motivo}.`);
    this.name = "NaoAutorizadoError";
    this.motivo = motivo;
  }
}

/** O que a consulta ao banco devolve, ou `null` quando não há linha. */
export type ContaConsultada = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
} | null;

export type ResultadoAcesso =
  | { autorizado: true; administrador: Administrador }
  | { autorizado: false; motivo: MotivoNegacao };

/**
 * A decisão em si, sem cookie e sem banco.
 *
 * Fica separada porque é a parte que a F2.0 consegue testar por inteiro: a
 * integração depende de `cookies()` e de conexão real, e não há banco de teste
 * isolado ainda.
 *
 * O nome exibido vem do banco, não do JWT — o token foi emitido no login e pode
 * estar velho.
 */
export function decidirAcesso(sessao: Sessao | null, conta: ContaConsultada): ResultadoAcesso {
  if (!sessao) return { autorizado: false, motivo: "sem-sessao" };
  if (!conta) return { autorizado: false, motivo: "conta-inexistente" };
  if (!conta.ativo) return { autorizado: false, motivo: "conta-inativa" };

  return {
    autorizado: true,
    administrador: { id: conta.id, nome: conta.nome, email: conta.email },
  };
}

/**
 * Exige uma sessão válida cuja conta exista e esteja ativa **neste momento**.
 *
 * Lança `NaoAutorizadoError` quando nega. Uma consulta por operação
 * administrativa é aceitável: são poucas por minuto e o custo de servir uma tela
 * a uma conta desativada é maior.
 */
export async function exigirAdministradorAtivo(): Promise<Administrador> {
  const sessao = await lerSessao();

  // Sem sessão não há o que consultar; a decisão abaixo já cobre o caso.
  const conta: ContaConsultada = sessao
    ? await prisma.usuario.findUnique({
        where: { id: sessao.usuarioId },
        select: { id: true, nome: true, email: true, ativo: true },
      })
    : null;

  const resultado = decidirAcesso(sessao, conta);
  if (!resultado.autorizado) throw new NaoAutorizadoError(resultado.motivo);

  return resultado.administrador;
}
