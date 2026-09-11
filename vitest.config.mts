import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O mesmo `@/` do tsconfig, para o teste importar igual ao resto do código.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    globalSetup: ["./tests/setup/env.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Testes tocam um Postgres real e compartilhado; em paralelo eles brigam.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
