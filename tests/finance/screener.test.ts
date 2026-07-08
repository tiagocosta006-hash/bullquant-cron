import { describe, it, expect } from "vitest"
import {
  SCREENER_CATEGORIES,
  DEFAULT_CATEGORY,
  isValidCategory,
} from "@/lib/finance/screener"

describe("screener — categorias", () => {
  it("a categoria default existe e é válida", () => {
    expect(SCREENER_CATEGORIES).toContain(DEFAULT_CATEGORY)
    expect(isValidCategory(DEFAULT_CATEGORY)).toBe(true)
    expect(isValidCategory("nope")).toBe(false)
    expect(isValidCategory(undefined)).toBe(false)
  })

  it("todas as categorias são chaves estáveis conhecidas", () => {
    for (const category of SCREENER_CATEGORIES) {
      expect(["marketCap", "gainers", "losers", "sp500"]).toContain(category)
    }
  })
})

// Testes de integração contra a BD real (Supabase). Fazem skip se não houver
// DATABASE_URL (ex: CI sem secrets) — em dev carrega de .env.local via tests/setup.ts.
describe.skipIf(!process.env.DATABASE_URL)("screener — dados dinâmicos reais", () => {
  it("getAvailableSectors devolve setores não-vazios", async () => {
    const { getAvailableSectors } = await import("@/lib/finance/screener")
    const { prisma } = await import("@/lib/prisma")
    try {
      const sectors = await getAvailableSectors()
      expect(sectors.length).toBeGreaterThan(0)
      for (const sector of sectors) {
        expect(typeof sector).toBe("string")
        expect(sector.length).toBeGreaterThan(0)
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it("marketCap devolve empresas ordenadas por capitalização decrescente", async () => {
    const { getCategoryCompanies } = await import("@/lib/finance/screener")
    const { prisma } = await import("@/lib/prisma")
    try {
      const companies = await getCategoryCompanies("marketCap", 10)
      expect(companies.length).toBeGreaterThan(0)

      const marketCaps = companies.map((c) =>
        c.sharesOutstanding !== null && c.lastClose !== null
          ? c.sharesOutstanding * c.lastClose
          : null,
      )
      for (let i = 1; i < marketCaps.length; i++) {
        if (marketCaps[i] !== null && marketCaps[i - 1] !== null) {
          expect(marketCaps[i]!).toBeLessThanOrEqual(marketCaps[i - 1]!)
        }
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it("gainers devolve empresas ordenadas por variação % decrescente", async () => {
    const { getCategoryCompanies } = await import("@/lib/finance/screener")
    const { prisma } = await import("@/lib/prisma")
    try {
      const companies = await getCategoryCompanies("gainers", 10)
      for (let i = 1; i < companies.length; i++) {
        const prev = companies[i - 1].lastChangePercent
        const curr = companies[i].lastChangePercent
        if (prev !== null && curr !== null) {
          expect(curr).toBeLessThanOrEqual(prev)
        }
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it("filtro por setor devolve só empresas desse setor", async () => {
    const { getCategoryCompanies, getAvailableSectors } = await import("@/lib/finance/screener")
    const { prisma } = await import("@/lib/prisma")
    try {
      const sectors = await getAvailableSectors()
      if (sectors.length === 0) return

      const targetSector = sectors[0]
      const companies = await getCategoryCompanies("marketCap", 50, targetSector)
      for (const company of companies) {
        expect(company.sector).toBe(targetSector)
      }
    } finally {
      await prisma.$disconnect()
    }
  })

  it("paginação (offset) devolve empresas diferentes e reporta hasMore corretamente", async () => {
    const { getCategoryCompaniesPage } = await import("@/lib/finance/screener")
    const { prisma } = await import("@/lib/prisma")
    try {
      const firstPage = await getCategoryCompaniesPage("marketCap", 10, 0)
      const secondPage = await getCategoryCompaniesPage("marketCap", 10, 10)

      expect(firstPage.companies.length).toBe(10)
      expect(firstPage.hasMore).toBe(true)

      const firstTickers = new Set(firstPage.companies.map((c) => c.ticker))
      for (const company of secondPage.companies) {
        expect(firstTickers.has(company.ticker)).toBe(false)
      }
    } finally {
      await prisma.$disconnect()
    }
  })
})
