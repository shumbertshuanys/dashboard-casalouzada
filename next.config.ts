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
