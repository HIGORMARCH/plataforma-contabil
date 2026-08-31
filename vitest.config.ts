import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Config do vitest.
 *
 * O único motivo de existir é o alias `@/` — o mesmo que o Next.js usa. Sem ele,
 * qualquer módulo testado que importe `@/lib/...` quebra a suíte com "Cannot
 * find package", e o teste acaba escrito com caminho relativo só pra agradar o
 * runner.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
