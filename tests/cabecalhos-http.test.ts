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
 * exemplo da documentação do Next.
 */

const HSTS = "strict-transport-security";
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
