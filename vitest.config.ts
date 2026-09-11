import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/setup/local-supabase.ts"],
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    // Testes tocam um Postgres real; sem isolamento por arquivo eles brigam.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
