import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ehEscolhaValida,
  resolverEquipeDoLancamento,
} from "@/lib/lancamento-equipe";

/**
 * Recomendação C, sem banco: a função é pura e é a única autoridade sobre a
 * equipe resultante de uma edição.
 */

const CORRETOR_A = "896d6dcd-a564-4315-86b8-3c9f1544531e";
const CORRETOR_B = "d8a21455-1b8b-479e-8c10-b169189d9ed3";
const EQUIPE_ARMAZENADA = "e9049b19-9178-4bbf-892e-2bfb6a64c017";
const EQUIPE_OUTRA = "0122d677-0db3-4a1d-96ac-64390a2c134e";

describe("resolverEquipeDoLancamento — corretor não mudou", () => {
  it("preserva a equipe armazenada literalmente", () => {
    const r = resolverEquipeDoLancamento({
      corretorIdAnterior: CORRETOR_A,
      equipeIdArmazenada: EQUIPE_ARMAZENADA,
      corretorIdNovo: CORRETOR_A,
      equipeAtualDoNovoCorretor: EQUIPE_OUTRA,
    });
    // Repare: a equipe ATUAL do corretor é outra, e mesmo assim o histórico
    // não é recalculado. É o ponto central da Recomendação C.
    assert.deepEqual(r, { ok: true, equipeId: EQUIPE_ARMAZENADA });
  });

  it("editar só a data não move a equipe", () => {
    // A função não recebe data: é justamente por isso que campo não
    // relacionado não tem como alterar a equipe.
    const r = resolverEquipeDoLancamento({
      corretorIdAnterior: CORRETOR_A,
      equipeIdArmazenada: EQUIPE_ARMAZENADA,
      corretorIdNovo: CORRETOR_A,
      equipeAtualDoNovoCorretor: EQUIPE_ARMAZENADA,
    });
    assert.equal(r.ok === true && r.equipeId, EQUIPE_ARMAZENADA);
  });

  it("ignora escolha enviada quando o corretor não mudou", () => {
    for (const escolha of ["CORRIGIR", "PRESERVAR", "LIXO", "", null, undefined]) {
      const r = resolverEquipeDoLancamento({
        corretorIdAnterior: CORRETOR_A,
        equipeIdArmazenada: EQUIPE_ARMAZENADA,
        corretorIdNovo: CORRETOR_A,
        equipeAtualDoNovoCorretor: EQUIPE_OUTRA,
        escolha,
      });
      assert.deepEqual(r, { ok: true, equipeId: EQUIPE_ARMAZENADA }, `escolha ${escolha}`);
    }
  });
});

describe("resolverEquipeDoLancamento — corretor mudou, mesma equipe", () => {
  it("preserva sem pedir escolha", () => {
    const r = resolverEquipeDoLancamento({
      corretorIdAnterior: CORRETOR_A,
      equipeIdArmazenada: EQUIPE_ARMAZENADA,
      corretorIdNovo: CORRETOR_B,
      equipeAtualDoNovoCorretor: EQUIPE_ARMAZENADA,
    });
    assert.deepEqual(r, { ok: true, equipeId: EQUIPE_ARMAZENADA });
  });

  it("qualquer escolha enviada é irrelevante nesse ramo", () => {
    for (const escolha of ["CORRIGIR", "PRESERVAR", "qualquer coisa", ""]) {
      const r = resolverEquipeDoLancamento({
        corretorIdAnterior: CORRETOR_A,
        equipeIdArmazenada: EQUIPE_ARMAZENADA,
        corretorIdNovo: CORRETOR_B,
        equipeAtualDoNovoCorretor: EQUIPE_ARMAZENADA,
        escolha,
      });
      assert.deepEqual(r, { ok: true, equipeId: EQUIPE_ARMAZENADA }, `escolha ${escolha}`);
    }
  });
});

describe("resolverEquipeDoLancamento — corretor mudou, equipes diferentes", () => {
  const conflito = {
    corretorIdAnterior: CORRETOR_A,
    equipeIdArmazenada: EQUIPE_ARMAZENADA,
    corretorIdNovo: CORRETOR_B,
    equipeAtualDoNovoCorretor: EQUIPE_OUTRA,
  };

  it("sem escolha, exige decisão do operador", () => {
    assert.deepEqual(resolverEquipeDoLancamento(conflito), {
      ok: false,
      erro: "ESCOLHA_OBRIGATORIA",
    });
  });

  it("escolha vazia, nula ou ausente também exige decisão", () => {
    for (const escolha of ["", null, undefined]) {
      assert.deepEqual(
        resolverEquipeDoLancamento({ ...conflito, escolha }),
        { ok: false, erro: "ESCOLHA_OBRIGATORIA" },
        `escolha ${escolha}`,
      );
    }
  });

  it("PRESERVAR mantém a equipe do lançamento", () => {
    assert.deepEqual(resolverEquipeDoLancamento({ ...conflito, escolha: "PRESERVAR" }), {
      ok: true,
      equipeId: EQUIPE_ARMAZENADA,
    });
  });

  it("CORRIGIR adota a equipe atual do novo corretor", () => {
    assert.deepEqual(resolverEquipeDoLancamento({ ...conflito, escolha: "CORRIGIR" }), {
      ok: true,
      equipeId: EQUIPE_OUTRA,
    });
  });

  it("escolha arbitrária é recusada", () => {
    for (const escolha of ["preservar", "Corrigir", "TERCEIRA", "1", "true", "MANTER"]) {
      assert.deepEqual(
        resolverEquipeDoLancamento({ ...conflito, escolha }),
        { ok: false, erro: "ESCOLHA_INVALIDA" },
        `escolha ${escolha}`,
      );
    }
  });

  it("nunca devolve uma equipe fora das duas do conflito", () => {
    for (const escolha of ["PRESERVAR", "CORRIGIR"]) {
      const r = resolverEquipeDoLancamento({ ...conflito, escolha });
      assert.ok(r.ok);
      assert.ok(
        r.ok === true && [EQUIPE_ARMAZENADA, EQUIPE_OUTRA].includes(r.equipeId),
        "só existem duas saídas possíveis",
      );
    }
  });
});

describe("ehEscolhaValida", () => {
  it("aceita só as duas palavras", () => {
    assert.equal(ehEscolhaValida("PRESERVAR"), true);
    assert.equal(ehEscolhaValida("CORRIGIR"), true);
  });

  it("recusa o resto", () => {
    for (const valor of ["", "preservar", "CORRIGIR ", null, undefined, 1, {}, []]) {
      assert.equal(ehEscolhaValida(valor), false, `${JSON.stringify(valor)}`);
    }
  });
});
