import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // HSTS. O host já redireciona http → https, mas o redirecionamento só
        // acontece depois de uma requisição em claro; este cabeçalho faz o
        // navegador dispensar essa primeira ida nas visitas seguintes.
        //
        // `:caminho*` casa zero ou mais segmentos, então cobre desde `/` até
        // `/painel/<token>/dados` — é a regra global, não há uma por rota.
        //
        // Sem `includeSubDomains` e sem `preload` de propósito: ambos vão além
        // do host servido. `includeSubDomains` imporia HTTPS a subdomínios que
        // não são nossos enquanto o domínio for o `onrender.com`, e `preload`
        // pede inclusão numa lista embutida nos navegadores, que é lenta de
        // desfazer. Reavaliar quando houver domínio próprio.
        source: "/:caminho*",
        headers: [{ key: "Strict-Transport-Security", value: "max-age=31536000" }],
      },
      {
        // A URL do painel é secreta; o cabeçalho evita que ela apareça em
        // buscador caso vaze em algum lugar.
        source: "/painel/:token*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
