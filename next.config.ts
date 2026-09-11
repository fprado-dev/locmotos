import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Foto de celular e CRLV escaneado passam de 1 MB, que é o corte padrão
      // da Server Action. O teto de verdade é o do bucket, 10 MB: esta folga
      // existe para o arquivo grande demais ser recusado pelo Storage, com a
      // frase que o gestor entende, em vez de morrer aqui com um erro do Next.
      bodySizeLimit: "11mb",
    },
  },
};

export default nextConfig;
