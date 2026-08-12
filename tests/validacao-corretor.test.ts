import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deDataCivil } from "@/lib/datas";
import {
  decidirEquipeDoCorretor,
  ehIdCorretorValido,
  interpretarEstadoAtivoCorretor,
  interpretarFiltroEquipe,
  interpretarSituacao,
  paraCampoData,
  validarCorretor,
} from "@/lib/validacao/corretor";

const EQUIPE_A = "896d6dcd-a564-4315-86b8-3c9f1544531e";
const EQUIPE_B = "d8a21455-1b8b-479e-8c10-b169189d9ed3";

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

const VALIDO = {
  nomeCompleto: "Rafael Nunes de Souza",
  nomeExibicao: "Rafael",
  equipeId: EQUIPE_A,
};

describe("validarCorretor — nomes", () => {
  it("aceita o mínimo obrigatório", () => {
    const r = validarCorretor(formulario(VALIDO));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.dados.nomeCompleto, "Rafael Nunes de Souza");
      assert.equal(r.dados.nomeExibicao, "Rafael");
      assert.equal(r.dados.equipeId, EQUIPE_A);
      assert.equal(r.dados.creci, null);
      assert.equal(r.dados.fotoUrl, null);
      assert.equal(r.dados.dataEntrada, null);
    }
  });

  it("apara espaços dos nomes", () => {
    const r = validarCorretor(
      formulario({ ...VALIDO, nomeCompleto: "  Rafael Nunes  ", nomeExibicao: "  Rafael  " }),
    );
    assert.equal(r.ok === true && r.dados.nomeCompleto, "Rafael Nunes");
    assert.equal(r.ok === true && r.dados.nomeExibicao, "Rafael");
  });

  it("recusa nomeCompleto vazio ou só espaços", () => {
    for (const nomeCompleto of ["", "   "]) {
      const r = validarCorretor(formulario({ ...VALIDO, nomeCompleto }));
      assert.equal(r.ok, false);
      assert.ok(r.ok === false && r.erros.nomeCompleto);
    }
  });

  it("recusa nomeExibicao vazio ou só espaços", () => {
    for (const nomeExibicao of ["", "  "]) {
      const r = validarCorretor(formulario({ ...VALIDO, nomeExibicao }));
      assert.equal(r.ok, false);
      assert.ok(r.ok === false && r.erros.nomeExibicao);
    }
  });

  it("acumula erros em vez de parar no primeiro", () => {
    const r = validarCorretor(formulario({ nomeCompleto: "", nomeExibicao: "", equipeId: "" }));
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.ok(r.erros.nomeCompleto);
      assert.ok(r.erros.nomeExibicao);
      assert.ok(r.erros.equipeId);
    }
  });
});

describe("validarCorretor — opcionais", () => {
  it("creci vazio vira null e preenchido é aparado", () => {
    for (const creci of ["", "   "]) {
      const r = validarCorretor(formulario({ ...VALIDO, creci }));
      assert.equal(r.ok, true);
      assert.equal(r.ok === true && r.dados.creci, null, `${JSON.stringify(creci)} deveria virar null`);
    }

    const preenchido = validarCorretor(formulario({ ...VALIDO, creci: "  CRECI-SP 123456-F  " }));
    assert.equal(preenchido.ok === true && preenchido.dados.creci, "CRECI-SP 123456-F");
  });

  it("não inventa formato de CRECI", () => {
    // Formatos reais variam por estado e por época; recusar aqui barraria
    // registro legítimo.
    for (const creci of ["12345", "CRECI/SP 98765-J", "F-1234", "MG 4567"]) {
      const r = validarCorretor(formulario({ ...VALIDO, creci }));
      assert.equal(r.ok, true, `${creci} deveria ser aceito`);
    }
  });

  it("fotoUrl vazia vira null e preenchida é aparada", () => {
    const vazia = validarCorretor(formulario({ ...VALIDO, fotoUrl: "  " }));
    assert.equal(vazia.ok === true && vazia.dados.fotoUrl, null);

    const cheia = validarCorretor(
      formulario({ ...VALIDO, fotoUrl: "  https://exemplo.test/foto.jpg " }),
    );
    assert.equal(cheia.ok === true && cheia.dados.fotoUrl, "https://exemplo.test/foto.jpg");
  });
});

describe("validarCorretor — dataEntrada", () => {
  it("vazia vira null", () => {
    for (const dataEntrada of ["", "   "]) {
      const r = validarCorretor(formulario({ ...VALIDO, dataEntrada }));
      assert.equal(r.ok, true);
      assert.equal(r.ok === true && r.dados.dataEntrada, null);
    }
  });

  it("aceita data civil válida e ancora na meia-noite UTC", () => {
    const r = validarCorretor(formulario({ ...VALIDO, dataEntrada: "2024-02-29" }));
    assert.equal(r.ok, true);
    assert.equal(
      r.ok === true && r.dados.dataEntrada?.toISOString(),
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("faz round-trip pela data civil", () => {
    for (const dataEntrada of ["2026-01-01", "2024-02-29", "2026-12-31"]) {
      const r = validarCorretor(formulario({ ...VALIDO, dataEntrada }));
      assert.equal(r.ok, true);
      assert.equal(r.ok === true && deDataCivil(r.dados.dataEntrada!), dataEntrada);
    }
  });

  it("recusa data que não existe no calendário", () => {
    for (const dataEntrada of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-04-31"]) {
      const r = validarCorretor(formulario({ ...VALIDO, dataEntrada }));
      assert.equal(r.ok, false, `${dataEntrada} deveria falhar`);
      assert.equal(r.ok === false && r.erros.dataEntrada, "Data de entrada inválida.");
    }
  });

  it("recusa formato fora de YYYY-MM-DD", () => {
    for (const dataEntrada of ["01/03/2026", "2026-3-1", "ontem", "2026-03-01T00:00:00Z"]) {
      const r = validarCorretor(formulario({ ...VALIDO, dataEntrada }));
      assert.equal(r.ok, false, `${dataEntrada} deveria falhar`);
    }
  });

  it("a mensagem não expõe detalhe interno do helper", () => {
    const r = validarCorretor(formulario({ ...VALIDO, dataEntrada: "2026-02-30" }));
    assert.doesNotMatch(
      r.ok === false ? (r.erros.dataEntrada ?? "") : "",
      /YYYY-MM-DD|Date\.UTC|calendário/i,
    );
  });
});

describe("validarCorretor — equipeId", () => {
  it("aceita UUID canônico", () => {
    const r = validarCorretor(formulario({ ...VALIDO, equipeId: EQUIPE_B }));
    assert.equal(r.ok === true && r.dados.equipeId, EQUIPE_B);
  });

  it("recusa ausente", () => {
    const r = validarCorretor(formulario({ ...VALIDO, equipeId: "" }));
    assert.equal(r.ok === false && r.erros.equipeId, "Escolha a equipe.");
  });

  it("recusa id que não é UUID", () => {
    for (const equipeId of ["abc", "1", "896d6dcd-a564-4315-86b8", "'; DROP TABLE equipes; --"]) {
      const r = validarCorretor(formulario({ ...VALIDO, equipeId }));
      assert.equal(r.ok === false && r.erros.equipeId, "Equipe inválida.");
    }
  });
});

describe("ehIdCorretorValido", () => {
  it("aceita UUID canônico", () => {
    for (const id of [EQUIPE_A, EQUIPE_B.toUpperCase(), "00000000-0000-4000-8000-000000000000"]) {
      assert.equal(ehIdCorretorValido(id), true, `${id} deveria ser válido`);
    }
  });

  it("recusa o que não é UUID", () => {
    for (const id of ["", "abc", "896d6dcd-a564-4315-86b8", " " + EQUIPE_A, "zzzzzzzz-a564-4315-86b8-3c9f1544531e"]) {
      assert.equal(ehIdCorretorValido(id), false, `${JSON.stringify(id)} deveria ser inválido`);
    }
  });

  it("recusa o que nem string é", () => {
    for (const valor of [null, undefined, 42, {}, [], true]) {
      assert.equal(ehIdCorretorValido(valor), false);
    }
  });
});

describe("interpretarEstadoAtivoCorretor", () => {
  it("aceita exatamente as duas palavras", () => {
    assert.equal(interpretarEstadoAtivoCorretor("true"), true);
    assert.equal(interpretarEstadoAtivoCorretor("false"), false);
  });

  it("recusa qualquer outra coisa em vez de virar desativação", () => {
    for (const valor of ["TRUE", "False", "1", "0", "abc", "", " true", "true "]) {
      assert.equal(interpretarEstadoAtivoCorretor(valor), null, `${JSON.stringify(valor)}`);
    }
  });

  it("recusa campo ausente e File", () => {
    assert.equal(interpretarEstadoAtivoCorretor(null), null);
    assert.equal(interpretarEstadoAtivoCorretor(new FormData().get("ativo")), null);

    const form = new FormData();
    form.set("ativo", new File(["true"], "ativo.txt", { type: "text/plain" }));
    assert.equal(interpretarEstadoAtivoCorretor(form.get("ativo")), null);
  });
});

describe("decidirEquipeDoCorretor", () => {
  const ativa = { id: EQUIPE_A, ativa: true };
  const inativa = { id: EQUIPE_A, ativa: false };

  it("na criação, aceita equipe ativa", () => {
    assert.deepEqual(decidirEquipeDoCorretor(EQUIPE_A, null, ativa), { ok: true });
  });

  it("na criação, recusa equipe inativa", () => {
    const r = decidirEquipeDoCorretor(EQUIPE_A, null, inativa);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.erro : "", /desativada/i);
  });

  it("na criação, recusa equipe inexistente", () => {
    const r = decidirEquipeDoCorretor(EQUIPE_A, null, null);
    assert.equal(r.ok === false && r.erro, "Equipe não encontrada.");
  });

  it("mantém o corretor na própria equipe mesmo desativada", () => {
    // O caso que motiva a assimetria: corrigir um CRECI não pode obrigar a
    // transferir quem está numa equipe encerrada.
    assert.deepEqual(decidirEquipeDoCorretor(EQUIPE_A, EQUIPE_A, inativa), { ok: true });
  });

  it("permite transferir para equipe ativa", () => {
    assert.deepEqual(
      decidirEquipeDoCorretor(EQUIPE_B, EQUIPE_A, { id: EQUIPE_B, ativa: true }),
      { ok: true },
    );
  });

  it("recusa transferir para equipe inativa", () => {
    const r = decidirEquipeDoCorretor(EQUIPE_B, EQUIPE_A, { id: EQUIPE_B, ativa: false });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.erro : "", /transferir/i);
  });

  it("recusa transferir para equipe inexistente", () => {
    const r = decidirEquipeDoCorretor(EQUIPE_B, EQUIPE_A, null);
    assert.equal(r.ok === false && r.erro, "Equipe não encontrada.");
  });
});

describe("filtros da listagem", () => {
  it("situação aceita só o domínio fechado", () => {
    assert.equal(interpretarSituacao("todos"), "todos");
    assert.equal(interpretarSituacao("ativos"), "ativos");
    assert.equal(interpretarSituacao("inativos"), "inativos");
  });

  it("situação estranha cai em todos, não esconde registro", () => {
    for (const valor of ["", "ATIVOS", "sim", "1", null, undefined, 42, {}]) {
      assert.equal(interpretarSituacao(valor), "todos", `${JSON.stringify(valor)}`);
    }
  });

  it("filtro de equipe aceita UUID e ignora lixo", () => {
    assert.equal(interpretarFiltroEquipe(EQUIPE_A), EQUIPE_A);
    for (const valor of ["", "abc", "'; DROP TABLE corretores; --", null, undefined, 7, []]) {
      assert.equal(interpretarFiltroEquipe(valor), null, `${JSON.stringify(valor)}`);
    }
  });
});

describe("paraCampoData", () => {
  it("converte para o formato do input date", () => {
    assert.equal(paraCampoData(new Date("2026-03-01T00:00:00.000Z")), "2026-03-01");
  });

  it("null vira campo vazio", () => {
    assert.equal(paraCampoData(null), "");
  });
});
