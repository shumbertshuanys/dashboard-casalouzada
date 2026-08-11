import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
