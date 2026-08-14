/* Service Worker do painel — F4.4, offline de navegação.
 *
 * Escrito à mão, sem Workbox e sem dependência: o escopo é pequeno demais para
 * justificar uma biblioteca, e a regra que importa aqui é uma regra de negócio,
 * não de cache.
 *
 * O que ele NÃO faz, por decisão (DEC-048):
 *
 * - não guarda métrica, payload, JSON nem o HTML normal do painel;
 * - não toca em `/painel/<token>/dados` — nem para ler, nem para escrever;
 * - não usa localStorage, sessionStorage nem IndexedDB.
 *
 * O cache tem exatamente dois itens, os dois institucionais e sem dado nenhum:
 * a tela de indisponibilidade e a marca que ela desenha. Um número antigo, de
 * idade desconhecida, na parede do escritório violaria a distinção entre dado
 * real e dado ausente (DEC-014) — por isso o offline mostra identidade, e nunca
 * desempenho.
 *
 * O primeiro provisionamento precisa acontecer **com rede**: um navegador que
 * nunca instalou este arquivo não tem tela institucional para mostrar. Isso é
 * parte explícita da DEC-048, não uma limitação a corrigir.
 */

/** Prefixo próprio: o `activate` só apaga caches desta funcionalidade. */
const PREFIXO = "casalouzada-painel-offline-";
const CACHE = `${PREFIXO}v1`;

const TELA = "/painel/offline.html";
const MARCA = "/marca/casa-louzada-horizontal-claro.png";

/** Os dois únicos recursos cacheados. Qualquer terceiro item precisa de motivo. */
const INSTITUCIONAIS = [TELA, MARCA];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(INSTITUCIONAIS);
      // A tela institucional não tem estado a preservar entre versões: assumir
      // imediatamente evita uma TV rodando a versão anterior por dias.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes
          // O filtro pelo prefixo é o que garante que nenhum cache de terceiros
          // — ou de outra funcionalidade futura — seja apagado por engano.
          .filter((nome) => nome.startsWith(PREFIXO) && nome !== CACHE)
          .map((nome) => caches.delete(nome)),
      );
      await self.clients.claim();
    })(),
  );
});

/** A tela institucional, lida do próprio cache. */
async function telaInstitucional() {
  const cache = await caches.open(CACHE);
  const resposta = await cache.match(TELA);
  // Sem a tela em cache não há o que mostrar: devolver um erro de rede deixa o
  // navegador exibir a própria página de falha, que é a verdade do momento.
  return resposta ?? Response.error();
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;

  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  const proprio = url.origin === self.location.origin;

  // Único asset com política de cache, e por um motivo concreto: é a imagem que
  // a tela institucional desenha, e ela precisa existir justamente quando a rede
  // não responde. Nenhum outro recurso ganha cache-first.
  if (proprio && url.pathname === MARCA) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cacheada = await cache.match(MARCA);
        return cacheada ?? fetch(requisicao);
      })(),
    );
    return;
  }

  // Tudo que não é navegação segue para a rede sem interceptação — inclusive a
  // rota de dados da F3.6, que assim continua sendo uma leitura de verdade a
  // cada 60 segundos, com o `Cache-Control: no-store` que ela já manda.
  if (requisicao.mode !== "navigate") return;

  evento.respondWith(
    (async () => {
      try {
        const resposta = await fetch(requisicao);

        // O teste é pelo status, nunca por `response.ok`. `ok` é falso para 404,
        // e mascarar o 404 de token inválido com a tela institucional esconderia
        // um erro de configuração da TV atrás de uma promessa de reconexão que
        // nunca se cumpriria (DEC-010).
        if (resposta.status >= 500 && resposta.status <= 599) return telaInstitucional();

        // A resposta real segue para a página **sem** ser cacheada: o HTML do
        // painel carrega números, e número não entra em cache.
        return resposta;
      } catch {
        // Falha de transporte: sem rede, sem servidor, DNS, TLS.
        return telaInstitucional();
      }
    })(),
  );
});
