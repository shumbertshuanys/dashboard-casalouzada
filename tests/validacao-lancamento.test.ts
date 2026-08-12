import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deDataCivil } from "@/lib/datas";
import {
  POR_PAGINA,
  TIPOS,
  decidirLancamentoParaCorretor,
  ehTipoMonetario,
  interpretarFiltrosLancamentos,
  interpretarPagina,
  interpretarTipo,
  validarLancamento,
} from "@/lib/validacao/lancamento";

const CORRETOR = "896d6dcd-a564-4315-86b8-3c9f1544531e";
const EQUIPE = "d8a21455-1b8b-479e-8c10-b169189d9ed3";

function formulario(campos: Record<string, string>): FormData {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

const BASE = { tipo: "PROPOSTA", corretorId: CORRETOR, dataReferencia: "2026-08-10" };

describe("tipos", () => {
  it("são exatamente os sete do enum", () => {
    assert.deepEqual([...TIPOS], [
      "VENDA",
      "LOCACAO",
      "CAPTACAO_VENDA",
      "CAPTACAO_EXCLUSIVA",
      "CAPTACAO_LOCACAO",
      "PROPOSTA",
      "AVALIACAO_GOOGLE",
    ]);
    assert.equal(new Set(TIPOS).size, 7);
  });

  it("aceita os sete", () => {
    for (const tipo of TIPOS) assert.equal(interpretarTipo(tipo), tipo);
  });

  it("recusa qualquer outro", () => {
    for (const valor of ["", "venda", "Venda", "VENDAS", "META", "abc", "1", null, undefined, {}, 7]) {
      assert.equal(interpretarTipo(valor), null, `${JSON.stringify(valor)}`);
    }
  });

  it("só VENDA e LOCACAO são monetários", () => {
    assert.equal(ehTipoMonetario("VENDA"), true);
    assert.equal(ehTipoMonetario("LOCACAO"), true);
    for (const tipo of ["CAPTACAO_VENDA", "CAPTACAO_EXCLUSIVA", "CAPTACAO_LOCACAO", "PROPOSTA", "AVALIACAO_GOOGLE"] as const) {
      assert.equal(ehTipoMonetario(tipo), false, tipo);
    }
  });

  it("CAPTACAO_VENDA e CAPTACAO_EXCLUSIVA são tipos distintos", () => {
    // DEC-003: um lançamento é um ou outro, nunca os dois.
    assert.notEqual(interpretarTipo("CAPTACAO_VENDA"), interpretarTipo("CAPTACAO_EXCLUSIVA"));

    const a = validarLancamento(formulario({ ...BASE, tipo: "CAPTACAO_VENDA" }));
    const b = validarLancamento(formulario({ ...BASE, tipo: "CAPTACAO_EXCLUSIVA" }));
    assert.equal(a.ok === true && a.dados.tipo, "CAPTACAO_VENDA");
    assert.equal(b.ok === true && b.dados.tipo, "CAPTACAO_EXCLUSIVA");
  });
});

describe("validarLancamento — um evento por submissão", () => {
  it("devolve um único objeto, não uma lista", () => {
    const r = validarLancamento(formulario({ ...BASE, tipo: "CAPTACAO_VENDA" }));
    assert.equal(r.ok, true);
    assert.equal(Array.isArray(r.ok === true ? r.dados : null), false);
    assert.equal(typeof (r.ok === true ? r.dados : null), "object");
  });

  it("tipo ausente ou inválido é erro de campo", () => {
    for (const tipo of ["", "abc", "venda"]) {
      const r = validarLancamento(formulario({ ...BASE, tipo }));
      assert.equal(r.ok, false);
      assert.ok(r.ok === false && r.erros.tipo);
    }
  });
});

describe("validarLancamento — corretor", () => {
  it("aceita UUID canônico", () => {
    const r = validarLancamento(formulario(BASE));
    assert.equal(r.ok === true && r.dados.corretorId, CORRETOR);
  });

  it("recusa ausente", () => {
    const r = validarLancamento(formulario({ ...BASE, corretorId: "" }));
    assert.equal(r.ok === false && r.erros.corretorId, "Escolha o corretor.");
  });

  it("recusa id que não é UUID", () => {
    for (const corretorId of ["abc", "1", "896d6dcd-a564", "'; DROP TABLE lancamentos; --"]) {
      const r = validarLancamento(formulario({ ...BASE, corretorId }));
      assert.equal(r.ok === false && r.erros.corretorId, "Corretor inválido.");
    }
  });
});

describe("validarLancamento — data", () => {
  it("aceita data civil e ancora na meia-noite UTC", () => {
    const r = validarLancamento(formulario({ ...BASE, dataReferencia: "2024-02-29" }));
    assert.equal(r.ok === true && r.dados.dataReferencia.toISOString(), "2024-02-29T00:00:00.000Z");
  });

  it("faz round-trip civil", () => {
    for (const dataReferencia of ["2026-01-01", "2024-02-29", "2026-12-31"]) {
      const r = validarLancamento(formulario({ ...BASE, dataReferencia }));
      assert.equal(r.ok === true && deDataCivil(r.dados.dataReferencia), dataReferencia);
    }
  });

  it("é obrigatória", () => {
    const r = validarLancamento(formulario({ ...BASE, dataReferencia: "" }));
    assert.equal(r.ok === false && r.erros.dataReferencia, "Informe a data do lançamento.");
  });

  it("recusa data inexistente ou mal formatada", () => {
    for (const dataReferencia of ["2026-02-30", "2026-13-01", "10/08/2026", "2026-8-1", "hoje"]) {
      const r = validarLancamento(formulario({ ...BASE, dataReferencia }));
      assert.equal(r.ok === false && r.erros.dataReferencia, "Data inválida.", dataReferencia);
    }
  });

  it("não recusa data futura nem antiga — não há regra inventada", () => {
    for (const dataReferencia of ["1999-01-01", "2090-12-31"]) {
      const r = validarLancamento(formulario({ ...BASE, dataReferencia }));
      assert.equal(r.ok, true, dataReferencia);
    }
  });
});

describe("validarLancamento — valor por tipo", () => {
  it("VENDA exige valor", () => {
    const r = validarLancamento(formulario({ ...BASE, tipo: "VENDA" }));
    assert.equal(r.ok === false && r.erros.valor, "Informe o valor.");
  });

  it("VENDA recusa zero em qualquer grafia", () => {
    for (const valor of ["0", "0,00", "0.00", "0,0", "000"]) {
      const r = validarLancamento(formulario({ ...BASE, tipo: "VENDA", valor }));
      assert.equal(
        r.ok === false && r.erros.valor,
        "O valor precisa ser maior que zero.",
        `valor ${valor}`,
      );
    }
  });

  it("VENDA aceita o formato brasileiro e guarda a canônica", () => {
    const r = validarLancamento(
      formulario({ ...BASE, tipo: "VENDA", valor: "1.250.000,00" }),
    );
    assert.equal(r.ok === true && r.dados.valor, "1250000.00");
    // String, nunca número: Decimal(14,2) não sobrevive a um double.
    assert.equal(typeof (r.ok === true ? r.dados.valor : null), "string");
  });

  it("VENDA recusa valor malformado", () => {
    for (const valor of ["abc", "-100", "1.5000", "1,234"]) {
      const r = validarLancamento(formulario({ ...BASE, tipo: "VENDA", valor }));
      assert.equal(r.ok === false && r.erros.valor, "Valor inválido.", valor);
    }
  });

  it("LOCACAO exige valor positivo", () => {
    assert.ok(validarLancamento(formulario({ ...BASE, tipo: "LOCACAO" })).ok === false);
    assert.ok(validarLancamento(formulario({ ...BASE, tipo: "LOCACAO", valor: "0,00" })).ok === false);

    const r = validarLancamento(formulario({ ...BASE, tipo: "LOCACAO", valor: "3.500,00" }));
    assert.equal(r.ok === true && r.dados.valor, "3500.00");
  });

  it("os cinco tipos não monetários gravam valor null", () => {
    for (const tipo of [
      "CAPTACAO_VENDA",
      "CAPTACAO_EXCLUSIVA",
      "CAPTACAO_LOCACAO",
      "PROPOSTA",
      "AVALIACAO_GOOGLE",
    ]) {
      const r = validarLancamento(formulario({ ...BASE, tipo }));
      assert.equal(r.ok, true, tipo);
      assert.equal(r.ok === true && r.dados.valor, null, tipo);
    }
  });

  it("valor enviado em tipo não monetário é descartado, sem virar erro", () => {
    // Trocar de VENDA para PROPOSTA deixa um valor órfão no payload.
    for (const tipo of ["PROPOSTA", "CAPTACAO_VENDA", "CAPTACAO_EXCLUSIVA", "AVALIACAO_GOOGLE"]) {
      const r = validarLancamento(formulario({ ...BASE, tipo, valor: "5000,00" }));
      assert.equal(r.ok, true, tipo);
      assert.equal(r.ok === true && r.dados.valor, null, tipo);
    }
  });

  it("AVALIACAO_GOOGLE passa com o mínimo, sem valor", () => {
    const r = validarLancamento(formulario({ ...BASE, tipo: "AVALIACAO_GOOGLE" }));
    assert.equal(r.ok, true);
    assert.equal(r.ok === true && r.dados.valor, null);
  });
});

describe("validarLancamento — opcionais", () => {
  it("vazios viram null e preenchidos são aparados", () => {
    const vazio = validarLancamento(formulario({ ...BASE, imovelRef: "  ", observacao: "" }));
    assert.equal(vazio.ok === true && vazio.dados.imovelRef, null);
    assert.equal(vazio.ok === true && vazio.dados.observacao, null);

    const cheio = validarLancamento(
      formulario({ ...BASE, imovelRef: "  AP-1203 ", observacao: "  cliente indicado  " }),
    );
    assert.equal(cheio.ok === true && cheio.dados.imovelRef, "AP-1203");
    assert.equal(cheio.ok === true && cheio.dados.observacao, "cliente indicado");
  });
});

describe("decidirLancamentoParaCorretor", () => {
  const ativo = { id: CORRETOR, ativo: true, equipeId: EQUIPE, equipe: { ativa: true } };

  it("autoriza e devolve a equipe atual do corretor", () => {
    assert.deepEqual(decidirLancamentoParaCorretor(ativo), { ok: true, equipeId: EQUIPE });
  });

  it("recusa corretor inexistente", () => {
    const r = decidirLancamentoParaCorretor(null);
    assert.equal(r.ok === false && r.erro, "Corretor não encontrado.");
  });

  it("recusa corretor inativo", () => {
    const r = decidirLancamentoParaCorretor({ ...ativo, ativo: false });
    assert.equal(r.ok === false && r.erro, "Este corretor está inativo.");
  });

  it("recusa corretor ativo cuja equipe foi desativada", () => {
    const r = decidirLancamentoParaCorretor({ ...ativo, equipe: { ativa: false } });
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.erro : "", /equipe atual deste corretor está desativada/i);
    // A saída é operacional: ninguém é movido automaticamente.
    assert.match(r.ok === false ? r.erro : "", /Atualize a equipe do corretor/i);
  });
});

describe("interpretarFiltrosLancamentos", () => {
  it("lê os cinco filtros válidos", () => {
    const f = interpretarFiltrosLancamentos({
      de: "2026-08-01",
      ate: "2026-08-31",
      corretor: CORRETOR,
      equipe: EQUIPE,
      tipo: "VENDA",
    });
    assert.equal(deDataCivil(f.de!), "2026-08-01");
    assert.equal(deDataCivil(f.ate!), "2026-08-31");
    assert.equal(f.corretorId, CORRETOR);
    assert.equal(f.equipeId, EQUIPE);
    assert.equal(f.tipo, "VENDA");
  });

  it("campo inválido vira filtro neutro, não erro", () => {
    const f = interpretarFiltrosLancamentos({
      de: "2026-02-30",
      ate: "ontem",
      corretor: "abc",
      equipe: "'; DROP TABLE lancamentos; --",
      tipo: "META",
    });
    assert.equal(f.de, null);
    assert.equal(f.ate, null);
    assert.equal(f.corretorId, null);
    assert.equal(f.equipeId, null);
    assert.equal(f.tipo, null);
  });

  it("sem parâmetro nenhum, tudo neutro", () => {
    const f = interpretarFiltrosLancamentos({});
    assert.deepEqual(f, { de: null, ate: null, corretorId: null, equipeId: null, tipo: null });
  });

  it("aceita parâmetro repetido usando o primeiro", () => {
    const f = interpretarFiltrosLancamentos({ tipo: ["VENDA", "LOCACAO"] });
    assert.equal(f.tipo, "VENDA");
  });
});

describe("interpretarPagina", () => {
  it("aceita inteiro positivo", () => {
    assert.equal(interpretarPagina("1"), 1);
    assert.equal(interpretarPagina("2"), 2);
    assert.equal(interpretarPagina("  37  "), 37);
  });

  it("cai na página 1 para tudo que não serve", () => {
    for (const valor of ["0", "-1", "-5", "1.5", "1,5", "abc", "", "  ", "1e3", null, undefined, 3, {}]) {
      assert.equal(interpretarPagina(valor), 1, `${JSON.stringify(valor)}`);
    }
  });

  it("recusa número além do inteiro seguro", () => {
    assert.equal(interpretarPagina("9007199254740993"), 1);
    assert.equal(interpretarPagina("999999999999999999999"), 1);
  });

  it("recusa a página cujo skip sairia da faixa segura", () => {
    // O que importa não é a página caber no inteiro seguro, e sim o `skip`.
    // MAX_SAFE_INTEGER é uma página válida em si, mas daria um skip de
    // 450359962737049500 — inexato, e é ele que vai para o banco.
    const maximo = String(Number.MAX_SAFE_INTEGER);
    assert.equal(Number.isSafeInteger(Number(maximo)), true, "a página em si é segura");
    assert.equal(
      Number.isSafeInteger((Number(maximo) - 1) * POR_PAGINA),
      false,
      "mas o skip dela não é",
    );
    assert.equal(interpretarPagina(maximo), 1);
  });

  it("aceita a última página cujo skip ainda é seguro", () => {
    const limite = 180143985094820;
    assert.equal(interpretarPagina(String(limite)), limite);
    assert.equal(Number.isSafeInteger((limite - 1) * POR_PAGINA), true);
    assert.equal((limite - 1) * POR_PAGINA, 9007199254740950);
  });

  it("recusa a página seguinte à fronteira", () => {
    const primeiraInsegura = 180143985094821;
    assert.equal(Number.isSafeInteger(primeiraInsegura), true, "a página em si é segura");
    assert.equal(Number.isSafeInteger((primeiraInsegura - 1) * POR_PAGINA), false);
    assert.equal(interpretarPagina(String(primeiraInsegura)), 1);
  });

  it("toda página aceita produz um skip seguro", () => {
    // O contrato que a listagem depende: `skip` sai daqui direto para o Prisma.
    const amostra = ["1", "2", "1000", "180143985094820", "0", "-1", "abc", String(Number.MAX_SAFE_INTEGER)];
    for (const entrada of amostra) {
      const pagina = interpretarPagina(entrada);
      assert.ok(pagina >= 1, `${entrada} → página precisa ser ≥ 1`);
      assert.equal(
        Number.isSafeInteger((pagina - 1) * POR_PAGINA),
        true,
        `entrada ${entrada} produziu skip inseguro`,
      );
    }
  });

  it("o limite deriva de POR_PAGINA, não de um número escrito à mão", () => {
    // Se `POR_PAGINA` mudar, a fronteira acompanha sozinha.
    const limiteEsperado = Math.floor(Number.MAX_SAFE_INTEGER / POR_PAGINA) + 1;
    assert.equal(interpretarPagina(String(limiteEsperado)), limiteEsperado);
    assert.equal(interpretarPagina(String(limiteEsperado + 1)), 1);
  });
});
