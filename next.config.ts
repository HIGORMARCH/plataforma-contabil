import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mantém Prisma e o motor de PDF fora do bundle do Turbopack (rodam só no server).
  serverExternalPackages: ["@prisma/client", "prisma", "@react-pdf/renderer", "pdfjs-dist"],

  // Libera o acesso em desenvolvimento pelo IP da rede local (não só por localhost).
  // Sem isto, abrir http://192.168.10.138:3000 renderiza a tela mas os CLIQUES NÃO
  // FUNCIONAM: o WebSocket de hot-reload é recusado e o React não hidrata.
  // Só afeta `next dev` — em produção (next build/start) não existe HMR.
  allowedDevOrigins: ["192.168.10.138", "localhost", "127.0.0.1"],

  // Aumenta o limite de body de Server Actions (padrão: 1MB). SPED-ECF, SPED-ECD e
  // outros arquivos fiscais grandes precisam de mais. 100MB cobre com folga.
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
