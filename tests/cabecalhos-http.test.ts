import assert from "node:assert/strict";
import { describe, it } from "node:test";
import nextConfig from "../next.config";

/**
 * O contrato dos cabeçalhos de resposta declarados em `next.config.ts` (SEC-006).
 *
 * O teste chama `headers()` e inspeciona o que a função devolve, em vez de
 * procurar texto no arquivo: o que vale é a estrutura que o Next consome, e uma
 * busca textual passaria em um cabeçalho escrito dentro de um comentário.
 *
 * A ausência de `includeSubDomains` e de `preload` é asserção, não descuido — o
 * porquê de cada um está no comentário da regra em `next.config.ts`. São
 * justamente o que uma edição distraída acrescentaria por hábito, copiando o
 * exemplo da documentação do Next. Pelo mesmo motivo a CSP é medida diretiva a
 * diretiva: ela existe aqui só para `frame-ancestors`, e o risco real é alguém
 * pendurar `script-src` ou `default-src` na mesma string sem o desenho que
 * essas diretivas exigem.
 */

const HSTS = "strict-transport-security";
const CSP = "content-security-policy";
const XFO = "x-frame-options";
const ROBOTS = "x-robots-tag";

/** Nome de cabeçalho HTTP é case-insensitive; a comparação também precisa ser. */
function cabecalhosDe(regra: { headers: readonly { key: string; value: string }[] }, chave: string) {
  return regra.headers.filter((c) => c.key.toLowerCase() === chave);
}

async function regras() {
  const definir = nextConfig.headers;
  assert.ok(definir, "next.config.ts deveria definir headers()");
  return definir();
}

/** As regras que declaram determinado cabeçalho. */
async function regrasCom(chave: string) {
  return (await regras()).filter((r) => cabecalhosDe(r, chave).length > 0);
}

/** A única regra que declara determinado cabeçalho, mais o valor dele. */
async function unico(chave: string) {
  const encontradas = await regrasCom(chave);
  assert.equal(encontradas.length, 1, `${chave} deveria vir de uma regra única, não repetido por rota`);
  const cabecalhos = cabecalhosDe(encontradas[0], chave);
  assert.equal(cabecalhos.length, 1, `sem ${chave} duplicado dentro da regra`);
  return { regra: encontradas[0], valor: cabecalhos[0].value };
}

describe("Strict-Transport-Security (SEC-006)", () => {
  it("é declarado uma única vez, numa regra só", async () => {
    const comHsts = (await regras()).filter((r) => cabecalhosDe(r, HSTS).length > 0);

    assert.equal(comHsts.length, 1, "o HSTS deveria vir de uma regra única, não repetido por rota");
    assert.equal(cabecalhosDe(comHsts[0], HSTS).length, 1, "sem cabeçalho duplicado dentro da regra");
  });

  it("vale para a aplicação inteira", async () => {
    const [regra] = (await regras()).filter((r) => cabecalhosDe(r, HSTS).length > 0);

    // `:caminho*` — o modificador `*` casa zero ou mais segmentos, então o
    // padrão cobre desde `/` até as rotas aninhadas. Um `source` sem o `*`, ou
    // preso a um prefixo, deixaria parte da aplicação sem o cabeçalho.
    assert.equal(regra.source, "/:caminho*", "o HSTS deveria estar na regra global");
  });

  it("usa max-age de um ano, sem includeSubDomains e sem preload", async () => {
    const [regra] = (await regras()).filter((r) => cabecalhosDe(r, HSTS).length > 0);
    const [{ value }] = cabecalhosDe(regra, HSTS);

    assert.equal(value, "max-age=31536000");

    // Redundante com a igualdade acima, e de propósito: se alguém trocar o
    // valor esperado, estas duas continuam apontando o que não pode entrar.
    assert.ok(!/includeSubDomains/i.test(value), "não há subdomínio próprio para herdar a política");
    assert.ok(!/preload/i.test(value), "não pedir inclusão na lista embutida dos navegadores");
  });
});

describe("Content-Security-Policy (SEC-005)", () => {
  it("é declarado uma única vez, na regra global", async () => {
    const { regra } = await unico(CSP);
    assert.equal(regra.source, "/:caminho*", "a CSP deveria valer para a aplicação inteira");
  });

  it("bloqueia qualquer origem embutidora", async () => {
    const { valor } = await unico(CSP);
    assert.equal(valor, "frame-ancestors 'none'");
  });

  it("não carrega nenhuma outra diretiva", async () => {
    const { valor } = await unico(CSP);

    // Diretiva a diretiva, e não por igualdade de string: o que precisa ficar
    // provado é que a política tem tamanho um, não só que hoje o texto bate.
    const diretivas = valor.split(";").map((d) => d.trim()).filter(Boolean);
    assert.equal(diretivas.length, 1, `a CSP deveria ter uma diretiva só, tem ${diretivas.length}: ${valor}`);
    assert.equal(diretivas[0].split(/\s+/)[0].toLowerCase(), "frame-ancestors");

    // Restringir script e estilo pede desenho próprio — ver o comentário da
    // regra em `next.config.ts`; entrar aqui de carona quebraria a aplicação
    // em silêncio.
    for (const proibida of [
      "default-src", "script-src", "style-src", "img-src", "connect-src",
      "frame-src", "object-src", "base-uri", "form-action",
      "upgrade-insecure-requests", "report-uri", "report-to",
    ]) {
      assert.ok(!valor.toLowerCase().includes(proibida), `a CSP não deveria conter ${proibida}`);
    }
  });
});

describe("X-Frame-Options (SEC-005)", () => {
  it("é declarado uma única vez, na regra global", async () => {
    const { regra } = await unico(XFO);
    assert.equal(regra.source, "/:caminho*");
  });

  it("nega o enquadramento inclusive pela própria origem", async () => {
    const { valor } = await unico(XFO);
    assert.equal(valor, "DENY");
    // `SAMEORIGIN` é o valor do exemplo genérico e o desvio provável; não há
    // iframe próprio no produto que o justifique.
    assert.notEqual(valor.toUpperCase(), "SAMEORIGIN");
    assert.ok(!/ALLOW-FROM/i.test(valor), "ALLOW-FROM é obsoleto e não é suportado");
  });
});

describe("regra global", () => {
  it("reúne os três cabeçalhos globais numa regra só", async () => {
    const globais = (await regras()).filter((r) => r.source === "/:caminho*");

    assert.equal(globais.length, 1, "deveria haver uma regra global, não várias");
    assert.deepEqual(
      globais[0].headers.map((c) => c.key),
      ["Strict-Transport-Security", "Content-Security-Policy", "X-Frame-Options"],
    );
  });
});

describe("X-Robots-Tag do painel", () => {
  it("continua valendo para as rotas do painel", async () => {
    const comRobots = (await regras()).filter((r) => cabecalhosDe(r, ROBOTS).length > 0);

    assert.equal(comRobots.length, 1);
    assert.equal(comRobots[0].source, "/painel/:token*");
    assert.deepEqual(cabecalhosDe(comRobots[0], ROBOTS), [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
    ]);
  });
});
