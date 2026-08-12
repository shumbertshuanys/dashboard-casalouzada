import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ehNomeDuplicado,
  mensagemNomeDuplicado,
  validarEquipe,
} from "@/lib/validacao/equipe";

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

const VALIDO = { nome: "Equipe Nova", gerenteNome: "Fulana", ordemExibicao: "4" };

describe("validarEquipe", () => {
  it("aceita entrada completa", () => {
    const r = validarEquipe(formulario(VALIDO));
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok === true && r.dados, {
      nome: "Equipe Nova",
      gerenteNome: "Fulana",
      ordemExibicao: 4,
    });
  });

  it("apara espaços dos textos", () => {
    const r = validarEquipe(
      formulario({ ...VALIDO, nome: "   Equipe Nova   ", gerenteNome: "  Fulana  " }),
    );
    assert.equal(r.ok === true && r.dados.nome, "Equipe Nova");
    assert.equal(r.ok === true && r.dados.gerenteNome, "Fulana");
  });

  it("apara também a ordem antes de conferir", () => {
    const r = validarEquipe(formulario({ ...VALIDO, ordemExibicao: "  7  " }));
    assert.equal(r.ok === true && r.dados.ordemExibicao, 7);
  });

  it("recusa nome vazio ou só espaços", () => {
    for (const nome of ["", "   "]) {
      const r = validarEquipe(formulario({ ...VALIDO, nome }));
      assert.equal(r.ok, false);
      assert.ok(r.ok === false && r.erros.nome);
    }
  });

  it("recusa gerente vazio ou só espaços", () => {
    for (const gerenteNome of ["", "  "]) {
      const r = validarEquipe(formulario({ ...VALIDO, gerenteNome }));
      assert.equal(r.ok, false);
      assert.ok(r.ok === false && r.erros.gerenteNome);
    }
  });

  it("recusa ordem ausente, decimal, textual, zero e negativa", () => {
    for (const ordemExibicao of ["", "1.5", "1,5", "abc", "0", "-1", "-3", "1e3", "  "]) {
      const r = validarEquipe(formulario({ ...VALIDO, ordemExibicao }));
      assert.equal(r.ok, false, `ordem ${JSON.stringify(ordemExibicao)} deveria falhar`);
      assert.ok(r.ok === false && r.erros.ordemExibicao);
    }
  });

  it("aceita ordem 1 — é a primeira posição, não zero", () => {
    const r = validarEquipe(formulario({ ...VALIDO, ordemExibicao: "1" }));
    assert.equal(r.ok === true && r.dados.ordemExibicao, 1);
  });

  it("acumula os erros em vez de parar no primeiro", () => {
    const r = validarEquipe(formulario({ nome: "", gerenteNome: "", ordemExibicao: "0" }));
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.ok(r.erros.nome);
      assert.ok(r.erros.gerenteNome);
      assert.ok(r.erros.ordemExibicao);
    }
  });

  it("trata campo ausente como vazio, não como erro de tipo", () => {
    const r = validarEquipe(new FormData());
    assert.equal(r.ok, false);
    assert.equal(Object.keys(r.ok === false ? r.erros : {}).length, 3);
  });
});

describe("ehNomeDuplicado", () => {
  it("reconhece P2002 no campo nome", () => {
    assert.equal(ehNomeDuplicado({ code: "P2002", meta: { target: ["nome"] } }), true);
    assert.equal(ehNomeDuplicado({ code: "P2002", meta: { target: "equipes_nome_key" } }), true);
    // Equipe só tem um índice único; sem alvo, é ele.
    assert.equal(ehNomeDuplicado({ code: "P2002" }), true);
  });

  it("ignora outros erros", () => {
    assert.equal(ehNomeDuplicado({ code: "P2025" }), false);
    assert.equal(ehNomeDuplicado({ code: "P2002", meta: { target: ["email"] } }), false);
    assert.equal(ehNomeDuplicado(new Error("conexão recusada")), false);
    assert.equal(ehNomeDuplicado(null), false);
    assert.equal(ehNomeDuplicado(undefined), false);
    assert.equal(ehNomeDuplicado("P2002"), false);
  });
});

describe("mensagemNomeDuplicado", () => {
  it("distingue equipe ativa de desativada", () => {
    assert.equal(mensagemNomeDuplicado(true), "Já existe uma equipe com este nome.");
    assert.equal(
      mensagemNomeDuplicado(false),
      "Já existe uma equipe com este nome e ela está desativada.",
    );
  });

  it("não vaza detalhe interno do banco", () => {
    for (const ativa of [true, false]) {
      const m = mensagemNomeDuplicado(ativa);
      assert.doesNotMatch(m, /P2002|constraint|equipes_nome_key|SQL|prisma/i);
    }
  });
});
