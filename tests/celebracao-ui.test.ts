import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DURACAO_CELEBRACAO_MS } from "@/lib/celebracao-cliente";

/**
 * A fiação dos dois componentes cliente da celebração.
 *
 * **Por que estrutural.** Nenhum dos dois é importável neste harness: eles
 * carregam `"use client"`, `useParams`/`useActionState` e `next/font`, e
 * importar qualquer um puxa o runtime de cliente do React — o mesmo obstáculo
 * documentado no C2, que estoura com `_react.default.createContext is not a
 * function`. O projeto não tem jsdom nem testing-library instalados, e o mandato
 * do C3 é explícito em não adicionar framework de teste por causa deste ciclo.
 *
 * O que **é** lógica de negócio — dedup e fila — não está aqui: está em
 * `src/lib/celebracao-cliente.ts`, com teste executável de verdade em
 * `tests/celebracao-cliente.test.ts`. O que sobra para este arquivo são as
 * decisões que só existem na casca: cadência, trava, endpoint, ordem entre
 * validar e incorporar. São asserções frágeis de propósito reconhecido — mexer
 * numa delas quebra o teste e pede revisão em vez de passar despercebido.
 *
 * O checagem de tipos e o lint são gates de verdade destes arquivos, e os dois
 * rodam limpos.
 */

/**
 * A fonte, com as quebras normalizadas.
 *
 * O repositório guarda LF e o checkout no Windows entrega CRLF: sem normalizar,
 * uma asserção estrutural passaria numa máquina e falharia na outra por causa de
 * um `\r` invisível.
 */
const lerFonte = (caminho: string) => readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");

/**
 * O mesmo arquivo, sem comentários.
 *
 * Toda asserção de **ausência** roda sobre isto, e a razão é concreta: os
 * comentários deste projeto explicam justamente o que o código não faz — "sem
 * `Math.random`", "não conhece `buscarUltimaVendaCadastrada`". Procurar esses
 * nomes na fonte crua encontraria a prosa e reprovaria o código correto, ou
 * pior: passaria a aprovar quando alguém apagasse o comentário. O que se quer
 * afirmar é sobre o código.
 *
 * O `[^:]` antes de `//` preserva `https://` e afins.
 */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const VIGIA = "src/components/painel/vigia-celebracao.tsx";
const OVERLAY = "src/components/painel/celebracao-overlay.tsx";
const CSS = "src/components/painel/celebracao.module.css";
const BOTAO = "src/app/admin/lancamentos/botao-celebracao.tsx";
const PAGINA_PAINEL = "src/app/painel/[token]/page.tsx";
const PAGINA_ADMIN = "src/app/admin/lancamentos/page.tsx";

describe("vigia da celebração", () => {
  const fonte = lerFonte(VIGIA);
  const codigo = semComentarios(fonte);

  it("consulta a cada 5 segundos", () => {
    assert.match(fonte, /const INTERVALO_MS = 5_000;/);
    assert.match(fonte, /setInterval\(consultar, INTERVALO_MS\)/);
  });

  it("o tempo limite é menor que o intervalo", () => {
    assert.match(fonte, /const TEMPO_LIMITE_MS = 4_000;/);

    const intervalo = Number(/const INTERVALO_MS = ([\d_]+);/.exec(fonte)![1].replace(/_/g, ""));
    const limite = Number(/const TEMPO_LIMITE_MS = ([\d_]+);/.exec(fonte)![1].replace(/_/g, ""));

    assert.ok(limite < intervalo, "uma tentativa nunca pode alcançar a seguinte");
    assert.match(fonte, /signal: AbortSignal\.timeout\(TEMPO_LIMITE_MS\)/);
  });

  it("lê uma vez ao montar, antes de iniciar o intervalo", () => {
    const imediata = fonte.indexOf("void consultar();");
    const intervalo = fonte.indexOf("setInterval(consultar, INTERVALO_MS)");

    assert.ok(imediata > 0, "há uma leitura imediata");
    assert.ok(imediata < intervalo, "e ela vem antes do intervalo");
  });

  it("nunca faz duas requisições ao mesmo tempo", () => {
    assert.match(fonte, /const emVoo = useRef\(false\);/);
    assert.match(fonte, /if \(emVoo\.current\) return;\n\s*emVoo\.current = true;/);
    assert.match(fonte, /finally \{\n\s*emVoo\.current = false;\n\s*\}/);
  });

  it("pede o endpoint da celebração, sem cache, com o token da URL", () => {
    assert.match(fonte, /const \{ token \} = useParams<\{ token: string \}>\(\);/);
    assert.match(
      fonte,
      /fetch\(`\/painel\/\$\{encodeURIComponent\(token\)\}\/celebracao`, \{\n\s*cache: "no-store",/,
    );
    assert.equal(codigo.includes("/dados"), false, "não encosta na rota de métricas");
  });

  it("valida antes de incorporar — e ignora o payload inteiro se reprovar", () => {
    const validacao = fonte.indexOf("if (!ehRespostaCelebracoes(json)) return;");
    const incorporacao = fonte.indexOf("incorporarCelebracoes(anterior, json)");

    assert.ok(validacao > 0, "o validador é chamado");
    assert.ok(validacao < incorporacao, "e antes de o estado ser tocado");
  });

  it("nenhum caminho de falha mexe no estado", () => {
    // Cada guarda de falha sai por `return` puro. Um `setEstado` dentro do
    // `catch` ou depois de um `!resposta.ok` apagaria a fila numa queda de rede.
    assert.match(fonte, /if \(!resposta\.ok\) return;/);
    assert.match(fonte, /catch \{\n\s*\/\/[^\n]*\n\s*console\.warn\("Consulta de celebrações falhou\."\);\n\s*\}/);

    const trecho = codigo.slice(codigo.indexOf("} catch {"), codigo.indexOf("} finally {"));
    assert.equal(trecho.includes("setEstado"), false, "o catch não toca no estado");
  });

  it("o log de falha não carrega token, URL nem erro bruto", () => {
    const catchInteiro = codigo.slice(codigo.indexOf("} catch {"), codigo.indexOf("} finally {"));

    assert.ok(catchInteiro.includes("console.warn"), "há um aviso");
    assert.equal(catchInteiro.includes("token"), false);
    assert.equal(catchInteiro.includes("erro"), false, "o erro bruto não é anexado");
    assert.equal(catchInteiro.includes("${"), false, "mensagem fixa, sem interpolação");
  });

  it("tenta de novo quando a aba volta a ficar visível", () => {
    assert.match(fonte, /document\.visibilityState === "visible"/);
    assert.match(fonte, /addEventListener\("visibilitychange", aoVoltar\)/);
    assert.match(fonte, /removeEventListener\("visibilitychange", aoVoltar\)/);
  });

  it("cada celebração sai depois da duração combinada", () => {
    assert.match(fonte, /setTimeout\(\(\) => setEstado\(avancarCelebracao\), DURACAO_CELEBRACAO_MS\)/);
    // A dependência é o id: uma resposta que reentregue a mesma celebração não
    // pode reiniciar a contagem dela no meio da animação.
    assert.match(fonte, /\}, \[idAtual\]\);/);
  });

  it("não desenha nada quando não há o que comemorar", () => {
    assert.match(fonte, /if \(estado\.atual === null\) return null;/);
  });

  it("não guarda ids em storage nem cookie", () => {
    for (const proibido of ["localStorage", "sessionStorage", "document.cookie", "indexedDB"]) {
      assert.equal(codigo.includes(proibido), false, proibido);
    }
  });

  it("não abre canal permanente nem toca em métrica", () => {
    for (const proibido of ["WebSocket", "EventSource", "supabase", "redis", "metricas"]) {
      assert.equal(codigo.includes(proibido), false, proibido);
    }
  });
});

describe("integração na página da TV", () => {
  const fonte = lerFonte(PAGINA_PAINEL);

  it("o vigia é irmão do atualizador — o dashboard continua montado", () => {
    const atualizador = fonte.indexOf("<AtualizadorPainel inicial={inicial} />");
    const vigia = fonte.indexOf("<VigiaCelebracao />");

    assert.ok(atualizador > 0, "o AtualizadorPainel continua na página");
    assert.ok(vigia > atualizador, "e o vigia entra ao lado dele, depois");

    // Irmãos no mesmo fragmento: nenhum condicional troca um pelo outro.
    assert.match(
      fonte,
      /<>\n\s*<RegistrarSwPainel \/>\n\s*<AtualizadorPainel inicial=\{inicial\} \/>\n\s*<VigiaCelebracao \/>\n\s*<\/>/,
    );
  });

  it("o vigia não recebe o token nem a leitura por prop", () => {
    assert.equal(fonte.includes("<VigiaCelebracao token"), false);
    assert.equal(fonte.includes("<VigiaCelebracao inicial"), false);
  });
});

describe("overlay da celebração", () => {
  const fonte = lerFonte(OVERLAY);
  const codigo = semComentarios(fonte);
  const css = lerFonte(CSS);
  const cssCodigo = semComentarios(css);

  it("a duração da coreografia vem do mesmo lugar que o temporizador", () => {
    assert.match(fonte, /"--duracao": `\$\{DURACAO_CELEBRACAO_MS\}ms`/);
    assert.match(css, /animation: velar var\(--duracao\)/);
    assert.match(css, /calc\(var\(--duracao\) - 600ms\)/);
    assert.equal(DURACAO_CELEBRACAO_MS, 10_000, "aproximadamente dez segundos por celebração");
  });

  it("valor nulo nunca vira R$ 0,00", () => {
    assert.match(fonte, /celebracao\.valor === null \? \(\n\s*<p className=\{estilos\.semValor\}>/);
    assert.match(fonte, /formatarBRL\(celebracao\.valor\)/);
    assert.equal(codigo.includes("Number("), false, "dinheiro não passa por Number");
    assert.equal(codigo.includes("parseFloat"), false);
  });

  it("mostra o imóvel entre o valor e o elenco, e some quando não há", () => {
    // Ausente é bloco inexistente — nada de traço, "—" ou espaço reservado.
    assert.match(
      fonte,
      /celebracao\.imovelRef === null \? null : \(\n\s*<p className=\{estilos\.imovel\}>\{celebracao\.imovelRef\}<\/p>\n\s*\)/,
    );

    const valor = fonte.indexOf("estilos.valor");
    const imovel = fonte.indexOf("estilos.imovel}");
    const participantes = fonte.indexOf("estilos.participantes");

    assert.ok(valor < imovel, "o imóvel vem depois do valor");
    assert.ok(imovel < participantes, "e antes dos participantes");

    // Sem rótulo colado na frente: o campo é texto livre do operador, e um
    // "Imóvel" acrescentado aqui viraria "Imóvel Imóvel 142".
    assert.equal(codigo.includes(">Imóvel "), false);
  });

  it("a marca assina embaixo de tudo, sem competir com o conteúdo", () => {
    assert.match(fonte, /src="\/marca\/casa-louzada-horizontal-claro\.png"/);
    assert.match(fonte, /alt="Casa Louzada"/);
    // `unoptimized`: o lockup oficial é servido como está, sem reprocessamento.
    assert.match(fonte, /unoptimized/);
    // As dimensões intrínsecas reservam a proporção; o tamanho real vem do CSS.
    assert.match(fonte, /width=\{2511\}\n\s*height=\{297\}/);

    const participantes = fonte.indexOf("estilos.participantes");
    const assinatura = fonte.indexOf("estilos.assinatura");
    assert.ok(assinatura > participantes, "a marca vem abaixo do conteúdo principal");

    // Proporção preservada e escala relativa, como o resto do overlay.
    assert.match(css, /\.marcaImagem \{\n\s*height: [\d.]+cqw;\n\s*width: auto;/);
    assert.match(css, /\.assinatura \{[\s\S]*?opacity: 0\.\d+;/);
  });

  it("o imóvel e a marca escalam com a viewport, não em px", () => {
    for (const seletor of [".imovel", ".assinatura", ".marcaImagem"]) {
      const bloco = cssCodigo.slice(
        cssCodigo.indexOf(`${seletor} {`),
        cssCodigo.indexOf("}", cssCodigo.indexOf(`${seletor} {`)),
      );
      assert.ok(bloco.length > 0, `${seletor} existe`);
      assert.equal(/\d+px/.test(bloco), false, `${seletor} não usa px fixo`);
    }
  });

  it("desenha todos os participantes, sem supor um por venda", () => {
    assert.match(fonte, /celebracao\.participantes\.map\(\(participante\) =>/);
    assert.match(fonte, /participante\.corretorNome/);
    assert.match(fonte, /participante\.equipeNome/);
    assert.match(fonte, /data-quantidade=\{quantidadeDe\(celebracao\.participantes\.length\)\}/);
  });

  it("o confete é determinístico e sem biblioteca", () => {
    assert.equal(codigo.includes("Math.random"), false, "aleatório quebraria a hidratação");
    assert.match(fonte, /const PARTICULAS = \d+;/);
    assert.match(fonte, /Array\.from\(\{ length: PARTICULAS \}/);
  });

  it("nenhuma dimensão visual principal em px", () => {
    // A TV é 80" a 4K: o overlay escala com a viewport, como o painel.
    const dimensoes =
      cssCodigo.match(/font-size:[^;]+;|gap:[^;]+;|padding:[^;]+;|width:[^;]+;/g) ?? [];
    for (const regra of dimensoes) {
      assert.equal(/\d+px/.test(regra), false, `dimensão em px fixo: ${regra.trim()}`);
    }

    assert.match(css, /container-type: inline-size;/);
    assert.match(css, /width: min\(100vw, calc\(100vh \* 16 \/ 9\)\)/);
    assert.ok(css.includes("cqw"), "a escala interna é relativa ao painel");
  });

  it("respeita movimento reduzido sem esconder a informação", () => {
    const bloco = cssCodigo.slice(cssCodigo.indexOf("@media (prefers-reduced-motion: reduce)"));

    assert.ok(bloco.length > 0, "há tratamento para movimento reduzido");
    assert.match(bloco, /animation: none;/);
    assert.match(bloco, /\.confete \{\n\s*display: none;/);
    // O que some é o movimento: título, valor e participantes não são tocados.
    for (const informacao of [".titulo", ".valor", ".semValor", ".nome", ".equipe"]) {
      assert.equal(bloco.includes(informacao), false, `${informacao} continua visível`);
    }
  });

  it("não tem áudio", () => {
    for (const proibido of ["Audio", "<audio", ".mp3", ".wav", "playbackRate"]) {
      assert.equal(codigo.includes(proibido), false, proibido);
    }
  });
});

describe("botão do Admin", () => {
  const fonte = lerFonte(BOTAO);
  const codigo = semComentarios(fonte);
  const pagina = lerFonte(PAGINA_ADMIN);

  it("chama a Server Action do C2 e nada mais", () => {
    assert.match(fonte, /import \{ comemorarUltimaVenda, type EstadoCelebracao \} from "\.\/acoes";/);
    assert.match(fonte, /useActionState<EstadoCelebracao, void>\(\n\s*\(\) => comemorarUltimaVenda\(\),/);

    // A regra continua no servidor: o botão não redescobre a última venda, não
    // grava celebração e não autoriza ninguém.
    for (const proibido of [
      "buscarUltimaVendaCadastrada",
      "registrarCelebracao",
      "exigirAdministradorAtivo",
      "prisma",
      "lancamento",
    ]) {
      assert.equal(codigo.includes(proibido), false, proibido);
    }
  });

  it("fica desabilitado enquanto a ação está pendente", () => {
    assert.match(fonte, /disabled=\{pendente\}/);
    assert.match(fonte, /\{pendente \? "Enviando\.\.\." : "Comemorar última venda"\}/);
  });

  it("expõe os dois retornos do C2 sem inventar um terceiro", () => {
    assert.match(fonte, /estado\.sucesso \?\? estado\.mensagem \?\? null/);
    assert.match(fonte, /aria-live="polite"/);
    // Falha real sobe pelo mecanismo de erro da aplicação: nada de `catch` que
    // transforme erro em sucesso silencioso.
    assert.equal(codigo.includes("catch"), false);
  });

  it("entrou na listagem, ao lado de Novo lançamento", () => {
    assert.match(pagina, /import \{ BotaoCelebracao \} from "\.\/botao-celebracao";/);
    const botao = pagina.indexOf("<BotaoCelebracao />");
    const novo = pagina.indexOf('href="/admin/lancamentos/novo"');

    assert.ok(botao > 0, "o botão está na página");
    assert.ok(Math.abs(pagina.slice(0, novo).length - botao) < 400, "e junto do outro controle");
  });
});
