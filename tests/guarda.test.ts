import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NaoAutorizadoError, decidirAcesso } from "@/lib/admin/guarda";
import type { ContaConsultada } from "@/lib/admin/guarda";
import type { Sessao } from "@/lib/sessao";

/**
 * Cobre a matriz de decisão da guarda por inteiro.
 *
 * O que fica de fora é a integração — `lerSessao()` depende de `cookies()` e a
 * consulta depende de conexão real. A F2.0 não tem banco de teste isolado, e
 * criar usuário fictício no Supabase para testar não está autorizado. Os casos
 * pendentes estão listados no handoff.
 */

const SESSAO: Sessao = {
  usuarioId: "8f1a4b2c-0000-4000-8000-000000000001",
  nome: "Nome do JWT",
  email: "admin@exemplo.test",
};

const CONTA_ATIVA: ContaConsultada = {
  id: SESSAO.usuarioId,
  nome: "Nome do banco",
  email: "admin@exemplo.test",
  ativo: true,
};

describe("decidirAcesso", () => {
  it("nega quando não há sessão", () => {
    const resultado = decidirAcesso(null, null);
    assert.equal(resultado.autorizado, false);
    assert.equal(resultado.autorizado === false && resultado.motivo, "sem-sessao");
  });

  it("nega sem sessão mesmo que a conta exista e esteja ativa", () => {
    // Token inválido ou expirado faz `lerSessao()` devolver null; daí não há
    // nem o que consultar.
    const resultado = decidirAcesso(null, CONTA_ATIVA);
    assert.equal(resultado.autorizado, false);
    assert.equal(resultado.autorizado === false && resultado.motivo, "sem-sessao");
  });

  it("nega quando a conta do JWT não existe mais", () => {
    const resultado = decidirAcesso(SESSAO, null);
    assert.equal(resultado.autorizado, false);
    assert.equal(resultado.autorizado === false && resultado.motivo, "conta-inexistente");
  });

  it("nega conta desativada, mesmo com JWT ainda válido", () => {
    // É o caso que o middleware sozinho não pega: o cookie vale 7 dias.
    const resultado = decidirAcesso(SESSAO, { ...CONTA_ATIVA, ativo: false });
    assert.equal(resultado.autorizado, false);
    assert.equal(resultado.autorizado === false && resultado.motivo, "conta-inativa");
  });

  it("autoriza conta existente e ativa", () => {
    const resultado = decidirAcesso(SESSAO, CONTA_ATIVA);
    assert.equal(resultado.autorizado, true);
    assert.deepEqual(resultado.autorizado === true && resultado.administrador, {
      id: CONTA_ATIVA.id,
      nome: "Nome do banco",
      email: "admin@exemplo.test",
    });
  });

  it("prefere o nome do banco ao do JWT", () => {
    // O token foi emitido no login e pode estar velho.
    const resultado = decidirAcesso(SESSAO, { ...CONTA_ATIVA, nome: "Nome novo" });
    assert.equal(resultado.autorizado === true && resultado.administrador.nome, "Nome novo");
  });
});

describe("NaoAutorizadoError", () => {
  it("carrega o motivo e continua sendo Error", () => {
    const erro = new NaoAutorizadoError("conta-inativa");
    assert.ok(erro instanceof Error);
    assert.ok(erro instanceof NaoAutorizadoError);
    assert.equal(erro.motivo, "conta-inativa");
    assert.equal(erro.name, "NaoAutorizadoError");
  });

  it("é distinguível de um erro qualquer, para o layout não engolir falha de banco", () => {
    assert.ok(!(new Error("conexão recusada") instanceof NaoAutorizadoError));
  });
});
