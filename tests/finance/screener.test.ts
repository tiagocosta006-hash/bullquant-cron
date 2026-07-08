import { describe, it, expect } from "vitest"
import {
  SCREENER_CATEGORIES,
  CURATED_LISTS,
  DEFAULT_CATEGORY,
  isValidCategory,
} from "@/lib/finance/screener"

// Categorias com lista curada ("sp500" representa o universo inteiro, sem lista).
const CURATED_CATEGORIES = SCREENER_CATEGORIES.filter((c) => c !== "sp500")

describe("screener — integridade das listas curadas", () => {
  it("a categoria default existe e é válida", () => {
    expect(SCREENER_CATEGORIES).toContain(DEFAULT_CATEGORY)
    expect(isValidCategory(DEFAULT_CATEGORY)).toBe(true)
    expect(isValidCategory("nope")).toBe(false)
    expect(isValidCategory(undefined)).toBe(false)
  })

  it("todas as categorias curadas têm lista não-vazia", () => {
    for (const category of CURATED_CATEGORIES) {
      const list = CURATED_LISTS[category]
      expect(list, `categoria "${category}" sem lista`).toBeDefined()
      expect(list!.length, `categoria "${category}" vazia`).toBeGreaterThan(0)
    }
  })

  it("todos os tickers são strings não-vazias, em maiúsculas e sem espaços", () => {
    for (const category of CURATED_CATEGORIES) {
      for (const ticker of CURATED_LISTS[category]!) {
        expect(typeof ticker).toBe("string")
        expect(ticker.trim().length, `ticker vazio em "${category}"`).toBeGreaterThan(0)
        expect(ticker, `ticker "${ticker}" em "${category}" não está normalizado`).toBe(
          ticker.trim().toUpperCase(),
        )
      }
    }
  })

  it("nenhuma categoria tem tickers duplicados", () => {
    for (const category of CURATED_CATEGORIES) {
      const list = CURATED_LISTS[category]!
      const unique = new Set(list)
      expect(unique.size, `duplicados em "${category}": ${list.join(", ")}`).toBe(list.length)
    }
  })
})

// Teste de integração contra a BD real (Supabase). Faz skip se não houver
// DATABASE_URL (ex: CI sem secrets) — em dev carrega de .env.local via tests/setup.ts.
describe.skipIf(!process.env.DATABASE_URL)("screener — tickers existem na tabela companies", () => {
  it("todos os tickers curados existem na BD", async () => {
    const { prisma } = await import("@/lib/prisma")
    try {
      const allTickers = [...new Set(CURATED_CATEGORIES.flatMap((c) => CURATED_LISTS[c]!))]

      const found = await prisma.company.findMany({
        where: { ticker: { in: allTickers } },
        select: { ticker: true },
      })
      const foundSet = new Set(found.map((c) => c.ticker))
      const missing = allTickers.filter((t) => !foundSet.has(t))

      expect(
        missing,
        `tickers curados sem registo em companies: ${missing.join(", ")}`,
      ).toEqual([])
    } finally {
      await prisma.$disconnect()
    }
  })
})
