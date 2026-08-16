import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // HSTS. O host já redireciona http → https, mas o redirecionamento só
        // acontece depois que uma requisição em claro saiu. Enquanto não
        // conhece a política, o navegador emite esse primeiro salto — e a URL
        // do painel carrega o token no path, que viaja nele. Depois de
        // aprender a política, o navegador passa a trocar para https por conta
        // própria, antes de enviar. Não cobre a primeira visita de um
        // navegador que ainda não a conhece; isso é limite conhecido, não
        // defeito de configuração.
        //
        // `:caminho*` casa zero ou mais segmentos, então cobre desde `/` até
        // `/painel/<token>/dados` — é a regra global, não há uma por rota.
        //
        // Sem `includeSubDomains`: a política pertence ao host que a emite, e a
        // diretiva a estenderia apenas aos descendentes desse host — nunca a
        // outros projetos vizinhos sob `onrender.com`, que emitem a sua. Como
        // não existe subdomínio próprio abaixo do host atual, não há quem
        // herde. Reavaliar se a topologia de domínio mudar.
        //
        // Sem `preload`: não faz parte desta decisão. Entra por decisão
        // própria, não por cópia do exemplo genérico da documentação do Next.
        //
        // Framing. `frame-ancestors 'none'` é a política; nenhum site pode
        // embutir a aplicação em frame, iframe, object ou embed. Vale mesmo
        // sem sessão: o cookie é `SameSite=Lax` e já não acompanha iframe
        // cross-site, mas isso depende do cookie e não impede o enquadramento
        // em si — a política impede.
        //
        // `X-Frame-Options: DENY` é só o encosto legado, para navegador que
        // não leia `frame-ancestors`; quem lê os dois ignora este. `DENY` e
        // não `SAMEORIGIN` porque não há caso legítimo de embutir a aplicação
        // nem pela própria origem: não existe iframe em lugar nenhum do
        // produto, e o painel da TV abre como página inteira.
        //
        // A CSP para em `frame-ancestors` de propósito. Restringir script e
        // estilo é outro problema: exige nonce por requisição e renderização
        // dinâmica, conforme o guia do Next, e teria de nascer em `proxy.ts`,
        // não aqui.
        source: "/:caminho*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
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
