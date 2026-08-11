import bcrypt from "bcryptjs";

/**
 * Hash de senha isolado aqui — sem `server-only` e sem Prisma — para o seed
 * poder reaproveitar exatamente o mesmo algoritmo e custo.
 */

const CUSTO_BCRYPT = 12;

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function conferirSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
