import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mantém Prisma e o motor de PDF fora do bundle do Turbopack (rodam só no server).
  serverExternalPackages: ["@prisma/client", "prisma", "@react-pdf/renderer", "pdfjs-dist"],
};

export default nextConfig;
