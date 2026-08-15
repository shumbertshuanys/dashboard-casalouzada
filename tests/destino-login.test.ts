import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESTINO_PADRAO, destinoAposLogin } from "@/lib/destino-login";

/** Byte nulo construido em runtime: o arquivo-fonte permanece texto puro. */
const NULO = String.fromCharCode(0);

/**
 * O `proximo` do login é entrada de terceiro: quem monta o link decide o texto,
 * e o administrador só clica. Estes casos existem para que a fronteira `/admin`
 * seja verificada por comportamento, e não por leitura do código.
 *
 * A lista de recusados é deliberadamente maior que a de aceitos, e cada linha
 * dela é uma forma diferente de escrever "leve isto para fora de /admin" —
 * incluindo a que passou pela versão anterior.
 */

describe("destinoAposLogin — destinos legítimos", () => {
  const aceitos: [string, string][] = [
    ["/admin", "/admin"],
    ["/admin/", "/admin/"],
    ["/admin/corretores", "/admin/corretores"],
    ["/admin/corretores?x=1", "/admin/corretores?x=1"],
    ["/admin?x=1", "/admin?x=1"],
    ["/admin/lancamentos/novo", "/admin/lancamentos/novo"],
    // Subrota profunda com id, como as telas de edição usam.
    [
      "/admin/lancamentos/8f1a4b2c-0000-4000-8000-000000000001/editar",
      "/admin/lancamentos/8f1a4b2c-0000-4000-8000-000000000001/editar",
    ],
  ];

  for (const [entrada, esperado] of aceitos) {
    it(`aceita ${JSON.stringify(entrada)}`, () => {
      assert.equal(destinoAposLogin(entrada), esperado);
    });
  }

  it("preserva a query inteira, que é o filtro que a pessoa estava usando", () => {
    // É o formato que `proxy.ts` monta com `pathname + search`.
    assert.equal(
      destinoAposLogin("/admin/lancamentos?tipo=VENDA&pagina=3"),
      "/admin/lancamentos?tipo=VENDA&pagina=3",
    );
  });

  it("preserva valores percent-encoded legítimos na query", () => {
    assert.equal(
      destinoAposLogin("/admin/lancamentos?de=2026-08-01&q=Jo%C3%A3o%20Silva"),
      "/admin/lancamentos?de=2026-08-01&q=Jo%C3%A3o%20Silva",
    );
  });

  it("preserva o fragmento", () => {
    assert.equal(destinoAposLogin("/admin/equipes#lista"), "/admin/equipes#lista");
  });
});

describe("destinoAposLogin — recusados", () => {
  const recusados: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["string vazia", ""],
    ["número", 42],
    ["objeto", { toString: () => "/admin" }],
    ["sem barra inicial", "admin"],
    ["https absoluto", "https://evil.example"],
    ["http absoluto", "http://evil.example"],
    ["protocolo-relativo", "//evil.example"],
    ["barra + contrabarra (o exploit do SEC-003)", "/\\evil.example"],
    ["duas contrabarras", "\\\\evil.example"],
    ["contrabarra simples", "\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,x"],
    ["prefixo parecido", "/administrator"],
    ["prefixo com hífen", "/admin-evil"],
    ["prefixo colado", "/adminevil"],
    ["outra rota interna", "/login"],
    ["raiz", "/"],
    ["painel", "/painel/qualquer-coisa"],
    ["escapa por dot-segment", "/admin/../login"],
    ["escapa por dot-segment codificado", "/admin/%2e%2e/login"],
    ["escapa por dot-segment duplo", "/admin/../../login"],
    ["credencial embutida", "/\\user:senha@evil.example"],
    ["barra + contrabarra com caminho", "/\\evil.example/admin"],
  ];

  for (const [rotulo, entrada] of recusados) {
    it(`recusa ${rotulo} → ${DESTINO_PADRAO}`, () => {
      assert.equal(destinoAposLogin(entrada), DESTINO_PADRAO);
    });
  }

  it("nunca lança, seja qual for a entrada", () => {
    // Percent-encoding quebrado, caracteres de controle e tipos que nem string
    // são: a resposta é o destino padrão, nunca uma exceção dentro da action.
    const esquisitos: unknown[] = [
      "/%zz",
      "/admin?%",
      "/" + NULO,
      "/admin" + NULO + "/x",
      "/admin",
      "/admin\t/x",
      "/admin\n/x",
      Symbol.iterator,
      Number.NaN,
      [],
    ];
    for (const entrada of esquisitos) {
      assert.doesNotThrow(() => destinoAposLogin(entrada));
    }
  });

  it("byte nulo embutido não abre a fronteira", () => {
    // Truncamento em C-string é um clássico; aqui o julgamento é sobre o
    // caminho canonicalizado inteiro.
    const saida = destinoAposLogin("/admin" + NULO + "/../login");
    assert.ok(saida === DESTINO_PADRAO || saida.startsWith(`${DESTINO_PADRAO}/`));
  });
});

describe("destinoAposLogin — contraprovas do SEC-003", () => {
  const SENTINELA = "https://exemplo.invalid";

  it("o exploit original deixa de escapar para outra origem", () => {
    // Antes: `/\evil.example` era devolvido intacto e resolvia para
    // https://evil.example/. Agora vira o destino padrão.
    const saida = destinoAposLogin("/\\evil.example");
    assert.equal(saida, DESTINO_PADRAO);
    assert.equal(new URL(saida, SENTINELA).origin, SENTINELA);
  });

  it("toda saída permanece na origem de quem resolve, qualquer que seja a entrada", () => {
    const entradas = [
      "/admin",
      "/admin/corretores?x=1",
      "/\\evil.example",
      "//evil.example",
      "https://evil.example",
      "/admin/../login",
    ];
    for (const entrada of entradas) {
      const saida = destinoAposLogin(entrada);
      assert.equal(
        new URL(saida, SENTINELA).origin,
        SENTINELA,
        `escapou com ${JSON.stringify(entrada)}`,
      );
    }
  });

  it("a saída é sempre um caminho dentro de /admin", () => {
    const entradas = [
      "/admin",
      "/admin/",
      "/admin/x?y=1",
      "/administrator",
      "/login",
      "/\\evil.example",
      null,
    ];
    for (const entrada of entradas) {
      const saida = destinoAposLogin(entrada);
      const caminho = new URL(saida, SENTINELA).pathname;
      assert.ok(
        caminho === DESTINO_PADRAO || caminho.startsWith(`${DESTINO_PADRAO}/`),
        `${JSON.stringify(entrada)} produziu ${saida}`,
      );
    }
  });

  it("não basta o texto começar com /admin: vale o caminho canonicalizado", () => {
    assert.equal(destinoAposLogin("/admin/../login"), DESTINO_PADRAO);
    assert.equal(destinoAposLogin("/admin/%2e%2e/login"), DESTINO_PADRAO);
    // O controle positivo do mesmo mecanismo: dot-segment que não sai de /admin
    // é canonicalizado e continua valendo.
    assert.equal(destinoAposLogin("/admin/corretores/../equipes"), "/admin/equipes");
  });

  it("a fronteira exige o separador, não o prefixo textual", () => {
    assert.equal(destinoAposLogin("/administrator"), DESTINO_PADRAO);
    assert.equal(destinoAposLogin("/admin-evil"), DESTINO_PADRAO);
    assert.equal(destinoAposLogin("/admin/corretores"), "/admin/corretores");
  });

  it("o destino devolvido é a forma canonicalizada, não o texto recebido", () => {
    // Validar uma string e redirecionar para outra seria a falha original.
    assert.equal(destinoAposLogin("/admin/corretores/../equipes"), "/admin/equipes");
  });
});
