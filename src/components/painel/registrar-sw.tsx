"use client";

import { useEffect } from "react";

/**
 * Registra o Service Worker do painel — e só isso.
 *
 * O componente não desenha nada e não tem estado: a tela offline mora inteira em
 * `public/painel/offline.html`, e quem decide quando mostrá-la é o próprio
 * Service Worker. Aqui só existe o registro, porque ele precisa acontecer no
 * navegador e a página é um Server Component.
 *
 * O **token não passa por aqui**: não é prop, não é lido de `useParams` e não vai
 * para o registro. O escopo `/painel/` cobre qualquer token sem precisar conhecer
 * nenhum, e manter o segredo fora deste caminho evita que ele apareça em log de
 * registro ou em erro do navegador.
 *
 * Falha de registro é silenciosa de propósito. Um navegador sem suporte, uma
 * origem sem HTTPS ou uma política que bloqueie Service Workers não podem
 * derrubar a TV: sem o mecanismo offline o painel continua funcionando
 * normalmente enquanto houver rede, que é exatamente o comportamento anterior à
 * F4.4.
 */
export function RegistrarSwPainel() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/painel/sw.js", { scope: "/painel/" }).catch(() => {
      // Sem detalhe do erro: a URL desta página carrega o token, e o objeto de
      // erro do navegador pode carregar a URL junto.
      console.warn("Registro do mecanismo offline do painel falhou.");
    });
  }, []);

  return null;
}
