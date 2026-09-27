import { describe, it, expect } from "vitest"
import { construirLinha, tipoFinanceira } from "@/lib/fmp/mapear"
import type { FmpIncomeStatement } from "@/lib/fmp/tipos"

// Linha de resultados mínima; cada teste muda só o que interessa.
function inc(p: Partial<FmpIncomeStatement>): FmpIncomeStatement {
  return {
    date: "2016-12-31", symbol: "X", reportedCurrency: "USD", cik: null, filingDate: null, acceptedDate: null,
    fiscalYear: 2016, period: "FY",
    revenue: 1000, costOfRevenue: 600, grossProfit: 400, researchAndDevelopmentExpenses: null,
    sellingGeneralAndAdministrativeExpenses: null, operatingExpenses: null, netInterestIncome: null,
    interestExpense: null, depreciationAndAmortization: null, ebitda: 250, operatingIncome: 200,
    nonOperatingIncomeExcludingInterest: null, incomeBeforeTax: 180, incomeTaxExpense: 40,
    netIncome: 140, bottomLineNetIncome: 140, netIncomeDeductions: null, eps: 1.4, epsDiluted: 1.4,
    weightedAverageShsOut: 100, weightedAverageShsOutDil: 100,
    ...p,
  }
}

describe("construirLinha — zeros da FMP e EPS incoerente", () => {
  it("EPS não ajustado a um split (Cooper 2016: 5,59 para 1,40) é recalculado", () => {
    const l = construirLinha(inc({ epsDiluted: 5.59 }), undefined, undefined, undefined, undefined)
    expect(l.epsDiluted).toBeCloseTo(1.4, 4)
  })

  it("diferença pequena e legítima (classes de ações, ~10%) fica como reportada", () => {
    const l = construirLinha(inc({ epsDiluted: 1.54 }), undefined, undefined, undefined, undefined)
    expect(l.epsDiluted).toBe(1.54)
  })

  it("EPS 0 com lucro real (TotalEnergies 2016) é recalculado", () => {
    const l = construirLinha(inc({ epsDiluted: 0 }), undefined, undefined, undefined, undefined)
    expect(l.epsDiluted).toBeCloseTo(1.4, 4)
  })

  it("lucro 0 (Costco FY2026 incompleto) passa a sem dado, e a margem também", () => {
    const l = construirLinha(inc({ netIncome: 0, bottomLineNetIncome: 0, epsDiluted: 0 }), undefined, undefined,
      { netProfitMargin: 0 } as never, undefined)
    expect(l.netIncome).toBeNull()
    expect(l.netMargin).toBeNull()
    expect(l.epsDiluted).toBeNull()
  })

  it("seguradora sem custo das vendas: custo e lucro bruto a sem dado, não 0", () => {
    const l = construirLinha(inc({ costOfRevenue: 0, grossProfit: 0 }), undefined, undefined,
      { grossProfitMargin: 0 } as never, undefined)
    expect(l.costOfRevenue).toBeNull()
    expect(l.grossProfit).toBeNull()
    expect(l.grossMargin).toBeNull()
  })

  it("FCF é sempre OCF − capex, mesmo que a FMP diga outra coisa", () => {
    const l = construirLinha(inc({}), undefined,
      { operatingCashFlow: 500, capitalExpenditure: -120, freeCashFlow: 450 } as never, undefined, undefined)
    expect(l.freeCashFlow).toBe(380)
    expect(l.capex).toBe(120)
  })

  it("um prejuízo real continua negativo (só o zero exato é tratado)", () => {
    const l = construirLinha(inc({ netIncome: -50, bottomLineNetIncome: -50, epsDiluted: -0.5 }), undefined, undefined, undefined, undefined)
    expect(l.netIncome).toBe(-50)
    expect(l.epsDiluted).toBe(-0.5)
  })
})

describe("tipoFinanceira e receita — só bancos descontam juros", () => {
  it("classifica pela indústria, não pelo setor", () => {
    expect(tipoFinanceira("Financials", "Diversified Banks", "JPM")).toBe("banco")
    expect(tipoFinanceira("Financials", "Investment Banking & Brokerage", "GS")).toBe("banco")
    expect(tipoFinanceira("Financials", "Consumer Finance", "AXP")).toBe("banco")
    expect(tipoFinanceira("Financials", "Asset Management & Custody Banks", "BNY")).toBe("banco")
    expect(tipoFinanceira("Financials", null, "HSBC")).toBe("banco")
    expect(tipoFinanceira("Financials", "Property & Casualty Insurance", "PGR")).toBe("seguradora")
    expect(tipoFinanceira("Financials", "Multi-Sector Holdings", "BRK.B")).toBe("seguradora")
    expect(tipoFinanceira("Financials", "Financial Exchanges & Data", "MSCI")).toBeNull()
    expect(tipoFinanceira("Financials", "Transaction & Payment Processing Services", "V")).toBeNull()
    expect(tipoFinanceira("Financials", "Insurance Brokers", "AON")).toBeNull()
    expect(tipoFinanceira("Financials", "Asset Management & Custody Banks", "BLK")).toBeNull()
    expect(tipoFinanceira("Information Technology", "Software", "MSFT")).toBeNull()
  })

  it("MSCI 2025: receita da FMP tal como vem (3,134 mM), sem tirar os juros da dívida", () => {
    const l = construirLinha(inc({ revenue: 3134e6, interestExpense: 210e6 }), undefined, undefined, undefined, undefined,
      "Financials", "Financial Exchanges & Data", "MSCI")
    expect(l.revenue).toBe(3134e6)
  })

  it("banco: receita líquida de juros pagos", () => {
    const l = construirLinha(inc({ revenue: 279.745e9, interestExpense: 97.898e9 }), undefined, undefined, undefined, undefined,
      "Financials", "Diversified Banks", "JPM")
    expect(l.revenue).toBeCloseTo(181.847e9, -3)
  })
})
