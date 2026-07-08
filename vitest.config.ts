import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    // Espelha o alias "@/*" do tsconfig.json (raiz do projeto).
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // O teste do screener consulta o Supabase real — margem para latência.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
