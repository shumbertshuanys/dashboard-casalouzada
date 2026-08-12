import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ORDEM_EXIBICAO,
  ehIdEquipeValido,
  ehNomeDuplicado,
  interpretarEstadoAtivoEquipe,
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

  it("aceita a ordem máxima que o campo comporta", () => {
    const r = validarEquipe(
      formulario({ ...VALIDO, ordemExibicao: String(MAX_ORDEM_EXIBICAO) }),
    );
    assert.equal(r.ok === true && r.dados.ordemExibicao, 2147483647);
  });

  it("recusa ordem acima do que o campo comporta", () => {
    // Um a mais que o teto, e um absurdo que vira Infinity ao converter.
    for (const ordemExibicao of [
      "2147483648",
      "9999999999",
      "999999999999999999999999999999999999",
      "1".repeat(400),
    ]) {
      const r = validarEquipe(formulario({ ...VALIDO, ordemExibicao }));
      assert.equal(r.ok, false, `ordem ${ordemExibicao.slice(0, 12)}… deveria falhar`);
      assert.equal(
        r.ok === false && r.erros.ordemExibicao,
        "A ordem informada é grande demais.",
      );
    }
  });

  it("a mensagem de ordem grande demais não cita o tipo do banco", () => {
    const r = validarEquipe(formulario({ ...VALIDO, ordemExibicao: "2147483648" }));
    assert.doesNotMatch(
      r.ok === false ? (r.erros.ordemExibicao ?? "") : "",
      /postgres|int4|integer|prisma/i,
    );
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

describe("interpretarEstadoAtivoEquipe", () => {
  it("aceita exatamente as duas palavras esperadas", () => {
    assert.equal(interpretarEstadoAtivoEquipe("true"), true);
    assert.equal(interpretarEstadoAtivoEquipe("false"), false);
  });

  it("recusa qualquer outra coisa em vez de virar desativação", () => {
    // Este é o ponto: antes, tudo aqui significava `false` — ou seja, desativar.
    for (const valor of ["TRUE", "False", "True", "1", "0", "abc", "", " true", "true "]) {
      assert.equal(
        interpretarEstadoAtivoEquipe(valor),
        null,
        `${JSON.stringify(valor)} deveria ser inválido`,
      );
    }
  });

  it("recusa campo ausente", () => {
    assert.equal(interpretarEstadoAtivoEquipe(null), null);
    // Como um formulário sem o campo se comporta de fato.
    assert.equal(interpretarEstadoAtivoEquipe(new FormData().get("ativa")), null);
  });

  it("recusa File — só string vale", () => {
    const form = new FormData();
    form.set("ativa", new File(["true"], "ativa.txt", { type: "text/plain" }));
    assert.equal(interpretarEstadoAtivoEquipe(form.get("ativa")), null);
  });
});

describe("ehIdEquipeValido", () => {
  it("aceita UUID canônico", () => {
    for (const id of [
      "896d6dcd-a564-4315-86b8-3c9f1544531e",
      "D8A21455-1B8B-479E-8C10-B169189D9ED3",
      "00000000-0000-4000-8000-000000000000",
    ]) {
      assert.equal(ehIdEquipeValido(id), true, `${id} deveria ser válido`);
    }
  });

  it("recusa o que não é UUID", () => {
    for (const id of [
      "",
      "abc",
      "896d6dcd-a564-4315-86b8", // incompleto
      "896d6dcd-a564-4315-86b8-3c9f1544531e-extra",
      "896d6dcda5644315 86b83c9f1544531e", // sem hífens
      "zzzzzzzz-a564-4315-86b8-3c9f1544531e", // fora do hexadecimal
      "'; DROP TABLE equipes; --",
      " 896d6dcd-a564-4315-86b8-3c9f1544531e",
    ]) {
      assert.equal(ehIdEquipeValido(id), false, `${JSON.stringify(id)} deveria ser inválido`);
    }
  });

  it("recusa o que nem string é", () => {
    for (const valor of [null, undefined, 42, {}, [], true]) {
      assert.equal(ehIdEquipeValido(valor), false);
    }
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
