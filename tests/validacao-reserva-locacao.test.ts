import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decidirReservaParaCorretor,
  ehIdReservaLocacaoValido,
  interpretarStatusReservaLocacao,
  validarCriacaoReserva,
  validarEdicaoReserva,
  type CorretorParaReserva,
} from "@/lib/validacao/reserva-locacao";

/** Monta um FormData como o navegador enviaria. */
function form(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

const UUID = "0b6a4f2e-1c3d-4a5b-8c7d-9e0f1a2b3c4d";

const CRIACAO_MINIMA = {
  corretorId: UUID,
  imovelRef: "AP-101",
  dataReferencia: "2026-08-14",
};

const EDICAO_MINIMA = {
  status: "ATIVA",
  imovelRef: "AP-101",
  dataReferencia: "2026-08-14",
};

describe("interpretarStatusReservaLocacao", () => {
  it("aceita os três estados", () => {
    assert.equal(interpretarStatusReservaLocacao("ATIVA"), "ATIVA");
    assert.equal(interpretarStatusReservaLocacao("FINALIZADA"), "FINALIZADA");
    assert.equal(interpretarStatusReservaLocacao("CANCELADA"), "CANCELADA");
  });

  it("recusa qualquer outra coisa", () => {
    assert.equal(interpretarStatusReservaLocacao("ativa"), null);
    assert.equal(interpretarStatusReservaLocacao(""), null);
    assert.equal(interpretarStatusReservaLocacao("EXCLUIDA"), null);
    assert.equal(interpretarStatusReservaLocacao(null), null);
    assert.equal(interpretarStatusReservaLocacao(["ATIVA"]), null);
  });
});

describe("ehIdReservaLocacaoValido", () => {
  it("aceita UUID canônico", () => {
    assert.equal(ehIdReservaLocacaoValido(UUID), true);
  });

  it("recusa não-UUID", () => {
    assert.equal(ehIdReservaLocacaoValido("1"), false);
    assert.equal(ehIdReservaLocacaoValido(""), false);
    assert.equal(ehIdReservaLocacaoValido(null), false);
    assert.equal(ehIdReservaLocacaoValido(undefined), false);
  });
});

describe("validarCriacaoReserva", () => {
  it("aceita a criação mínima e devolve observação null", () => {
    const resultado = validarCriacaoReserva(form(CRIACAO_MINIMA));
    assert.equal(resultado.ok, true);
    if (!resultado.ok) return;
    assert.equal(resultado.dados.corretorId, UUID);
    assert.equal(resultado.dados.imovelRef, "AP-101");
    assert.equal(resultado.dados.observacao, null);
  });

  it("exige o corretor", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, corretorId: "" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.corretorId, "Escolha o corretor.");
  });

  it("recusa corretor que não é UUID", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, corretorId: "abc" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.corretorId, "Corretor inválido.");
  });

  it("exige o imóvel", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, imovelRef: "" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.imovelRef, "Informe o imóvel da reserva.");
  });

  it("recusa imóvel só de espaços", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, imovelRef: "   " }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.imovelRef, "Informe o imóvel da reserva.");
  });

  it("exige a data", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, dataReferencia: "" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.dataReferencia, "Informe a data da reserva.");
  });

  it("recusa data inválida", () => {
    const resultado = validarCriacaoReserva(
      form({ ...CRIACAO_MINIMA, dataReferencia: "2026-02-30" }),
    );
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.dataReferencia, "Data inválida.");
  });

  it("observação só de espaços vira null; com conteúdo, é aparada", () => {
    const vazia = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, observacao: "   " }));
    assert.equal(vazia.ok, true);
    if (vazia.ok) assert.equal(vazia.dados.observacao, null);

    const cheia = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, observacao: "  ok  " }));
    assert.equal(cheia.ok, true);
    if (cheia.ok) assert.equal(cheia.dados.observacao, "ok");
  });

  it("status forjado no payload não entra no domínio validado", () => {
    // A criação não lê `status` de propósito: toda reserva nasce ATIVA na
    // action (DEC-055). O payload forjado não muda o resultado.
    const semForja = validarCriacaoReserva(form(CRIACAO_MINIMA));
    const comForja = validarCriacaoReserva(
      form({ ...CRIACAO_MINIMA, status: "FINALIZADA" }),
    );
    assert.equal(comForja.ok, true);
    if (!comForja.ok || !semForja.ok) return;
    assert.deepEqual(comForja.dados, semForja.dados);
    assert.equal("status" in comForja.dados, false);
  });

  it("equipeId forjada não entra no domínio validado", () => {
    const resultado = validarCriacaoReserva(form({ ...CRIACAO_MINIMA, equipeId: UUID }));
    assert.equal(resultado.ok, true);
    if (!resultado.ok) return;
    assert.equal("equipeId" in resultado.dados, false);
  });
});

describe("validarEdicaoReserva", () => {
  it("aceita os três estados", () => {
    for (const status of ["ATIVA", "FINALIZADA", "CANCELADA"] as const) {
      const resultado = validarEdicaoReserva(form({ ...EDICAO_MINIMA, status }));
      assert.equal(resultado.ok, true, status);
      if (resultado.ok) assert.equal(resultado.dados.status, status);
    }
  });

  it("exige o status", () => {
    const resultado = validarEdicaoReserva(form({ ...EDICAO_MINIMA, status: "" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.status, "Escolha o status da reserva.");
  });

  it("recusa status fora do domínio", () => {
    const resultado = validarEdicaoReserva(form({ ...EDICAO_MINIMA, status: "EXCLUIDA" }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.status, "Escolha o status da reserva.");
  });

  it("exige o imóvel", () => {
    const resultado = validarEdicaoReserva(form({ ...EDICAO_MINIMA, imovelRef: "  " }));
    assert.equal(resultado.ok, false);
    if (resultado.ok) return;
    assert.equal(resultado.erros.imovelRef, "Informe o imóvel da reserva.");
  });

  it("exige data válida", () => {
    const ausente = validarEdicaoReserva(form({ ...EDICAO_MINIMA, dataReferencia: "" }));
    assert.equal(ausente.ok, false);

    const invalida = validarEdicaoReserva(
      form({ ...EDICAO_MINIMA, dataReferencia: "não-é-data" }),
    );
    assert.equal(invalida.ok, false);
    if (invalida.ok) return;
    assert.equal(invalida.erros.dataReferencia, "Data inválida.");
  });

  it("observação é opcional", () => {
    const resultado = validarEdicaoReserva(form({ ...EDICAO_MINIMA, observacao: "" }));
    assert.equal(resultado.ok, true);
    if (resultado.ok) assert.equal(resultado.dados.observacao, null);
  });

  it("corretorId e equipeId forjados não entram no domínio validado", () => {
    const resultado = validarEdicaoReserva(
      form({ ...EDICAO_MINIMA, corretorId: UUID, equipeId: UUID }),
    );
    assert.equal(resultado.ok, true);
    if (!resultado.ok) return;
    assert.equal("corretorId" in resultado.dados, false);
    assert.equal("equipeId" in resultado.dados, false);
  });
});

describe("decidirReservaParaCorretor", () => {
  const ATIVO: NonNullable<CorretorParaReserva> = {
    id: UUID,
    ativo: true,
    equipeId: "e0000000-0000-4000-8000-000000000001",
    equipe: { ativa: true },
  };

  it("recusa corretor inexistente", () => {
    const decisao = decidirReservaParaCorretor(null);
    assert.equal(decisao.ok, false);
    if (decisao.ok) return;
    assert.equal(decisao.erro, "Corretor não encontrado.");
  });

  it("recusa corretor inativo", () => {
    const decisao = decidirReservaParaCorretor({ ...ATIVO, ativo: false });
    assert.equal(decisao.ok, false);
    if (decisao.ok) return;
    assert.equal(decisao.erro, "Este corretor está inativo.");
  });

  it("recusa equipe desativada", () => {
    const decisao = decidirReservaParaCorretor({ ...ATIVO, equipe: { ativa: false } });
    assert.equal(decisao.ok, false);
    if (decisao.ok) return;
    assert.match(decisao.erro, /equipe atual deste corretor está desativada/i);
  });

  it("corretor ativo em equipe ativa devolve a equipe consultada", () => {
    const decisao = decidirReservaParaCorretor(ATIVO);
    assert.equal(decisao.ok, true);
    if (decisao.ok) assert.equal(decisao.equipeId, ATIVO.equipeId);
  });
});
