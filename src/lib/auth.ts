import "server-only";
import { prisma } from "@/lib/db";
import { conferirSenha } from "@/lib/senha";
import type { Sessao } from "@/lib/sessao";

/** Hash de descarte, usado só para gastar tempo quando o e-mail não existe. */
const HASH_FICTICIO = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9Y5Ub9Nn0nEQ0PZDDaEcBLGVLPMD1qS";

export async function autenticar(email: string, senha: string): Promise<Sessao | null> {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  // Sem usuário ainda comparamos contra um hash qualquer: a resposta demora o
  // mesmo tanto, então o tempo não denuncia quais e-mails estão cadastrados.
  const confere = await conferirSenha(senha, usuario?.senhaHash ?? HASH_FICTICIO);

  // Falha de credencial, usuário inexistente e usuário inativo devolvem a
  // mesma coisa, de propósito.
  if (!usuario || !usuario.ativo || !confere) return null;

  return { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email };
}
