import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { GET } from "@/app/painel/[token]/dados/route";

/**
 * A ordem do guard na rota de dados.
 *
 * O que se prova aqui é de segurança, não de conteúdo: **o token é verificado
 * antes de o Prisma ser tocado**. Sem isso, uma URL com token errado ainda abriria
 * conexão com o banco — trabalho e superfície de ataque para quem não deveria
 * passar da porta.
 *
 * A prova usa a própria ausência de `DATABASE_URL` como sensor. O `prisma` de
 * `src/lib/db.ts` é um Proxy preguiçoso que só constrói o cliente quando alguém o
 * usa, e construir sem `DATABASE_URL` lança. Então:
 *
 * - token inválido → responde 404 **sem** lançar (o Proxy nunca foi tocado);
 * - token válido → lança ao tentar criar o cliente (o Proxy foi tocado).
 *
 * O segundo caso é a contraprova do primeiro: sem ele, um 404 poderia estar
 * vindo de qualquer outro motivo.
 */

const TOKEN_DE_TESTE = "token-de-teste-apenas-para-esta-suite";

let databaseUrlOriginal: string | undefined;
let directUrlOriginal: string | undefined;
let painelTokenOriginal: string | undefined;

before(() => {
  databaseUrlOriginal = process.env.DATABASE_URL;
  directUrlOriginal = process.env.DIRECT_URL;
  painelTokenOriginal = process.env.PAINEL_TOKEN;

  process.env.PAINEL_TOKEN = TOKEN_DE_TESTE;
  // O sensor: sem URL, tocar no Proxy do Prisma lança.
  delete process.env.DATABASE_URL;
  delete process.env.DIRECT_URL;
});

after(() => {
  const restaurar = (chave: string, valor: string | undefined) => {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  };

  restaurar("DATABASE_URL", databaseUrlOriginal);
  restaurar("DIRECT_URL", directUrlOriginal);
  restaurar("PAINEL_TOKEN", painelTokenOriginal);
});

/** O contexto que o Next entrega ao handler: `params` como Promise. */
function contexto(token: string) {
  return { params: Promise.resolve({ token }) };
}

function requisicao(token: string): Request {
  return new Request(`http://localhost/painel/${encodeURIComponent(token)}/dados`);
}

describe("token inválido", () => {
  it("responde 404 sem tocar no banco", async () => {
    const invalido = "token-errado";

    // Se o guard viesse depois da leitura, esta chamada lançaria em vez de
    // devolver resposta — é exatamente o que o `assert.doesNotReject` cobre.
    const resposta = await assert.doesNotReject(async () => {
      const saida = await GET(requisicao(invalido), contexto(invalido));
      assert.equal(saida.status, 404);
      return saida;
    });

    assert.equal(resposta, undefined, "doesNotReject não devolve a resposta");
  });

  it("responde 404 também com token vazio", async () => {
    const saida = await GET(requisicao(""), contexto(""));
    assert.equal(saida.status, 404);
  });

  it("responde 404 quando o token tem o tamanho certo mas o conteúdo errado", async () => {
    // Cobre o ramo de `timingSafeEqual`, que exige mesmo comprimento.
    const mesmoTamanho = "X".repeat(TOKEN_DE_TESTE.length);
    const saida = await GET(requisicao(mesmoTamanho), contexto(mesmoTamanho));
    assert.equal(saida.status, 404);
  });

  it("o corpo do 404 não devolve nada", async () => {
    const saida = await GET(requisicao("outro-errado"), contexto("outro-errado"));
    assert.equal(await saida.text(), "");
  });
});

describe("token válido — contraprova", () => {
  it("passa do guard e só então tenta o banco", async () => {
    // Sem `DATABASE_URL`, criar o cliente lança. O erro provar que o Proxy foi
    // tocado é o ponto: significa que o guard deixou passar e a leitura começou.
    await assert.rejects(
      () => GET(requisicao(TOKEN_DE_TESTE), contexto(TOKEN_DE_TESTE)),
      /DATABASE_URL/,
    );
  });
});

describe("sem PAINEL_TOKEN configurado", () => {
  it("nenhum token passa", async () => {
    const anterior = process.env.PAINEL_TOKEN;
    delete process.env.PAINEL_TOKEN;

    try {
      const saida = await GET(requisicao(TOKEN_DE_TESTE), contexto(TOKEN_DE_TESTE));
      assert.equal(saida.status, 404, "sem segredo configurado, a porta fica fechada");
    } finally {
      process.env.PAINEL_TOKEN = anterior;
    }
  });
});
