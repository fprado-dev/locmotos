import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/setup/env.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Testes tocam um Postgres real e compartilhado; em paralelo eles brigam.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
