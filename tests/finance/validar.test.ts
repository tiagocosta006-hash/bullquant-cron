import { describe, it, expect } from "vitest"
import { guardarSchema, conjuntoSchema } from "@/lib/finance/modelo/validar"
import { cenariosIniciais, pressupostosIniciais, racios, type AnoHistorico } from "@/lib/finance/modelo"

const h = (ano: number): AnoHistorico => ({
  fiscalYear: ano, periodEnd: `${ano}-12-31`, revenue: 1000, costOfRevenue: 600, grossProfit: 400, operatingExpenses: 200,
  operatingIncome: 200, ebitda: 250, depreciationAndAmortization: 50, capex: 60, accountsReceivable: 100, inventory: 50,
  accountsPayable: 80, deferredRevenue: 40, taxExpense: 50, incomeBeforeTax: 200, stockBasedCompensation: null,
  operatingCashFlow: 230, freeCashFlow: 170,
})
const hist = [h(2023), h(2024), h(2025)]
const conjunto = () => cenariosIniciais(pressupostosIniciais(hist, racios(hist), [], { rf: 0.04, beta: 1, custoDivida: 0.05, evEbitdaAtual: 10 } as never))

describe("modelo guardado — validação", () => {
  it("aceita o conjunto que o próprio modelo produz", () => {
    expect(conjuntoSchema.safeParse(conjunto()).success).toBe(true)
    expect(guardarSchema.safeParse({ ticker: "MSCI", conjunto: conjunto(), valorPorAcao: 100, preco: 90 }).success).toBe(true)
  })
  it("rejeita séries com comprimento diferente do horizonte", () => {
    const c = conjunto(); c.cenarios.base.drivers.margemEbit = [0.1, 0.2]
    expect(conjuntoSchema.safeParse(c).success).toBe(false)
  })
  it("rejeita números absurdos e não finitos", () => {
    const c = conjunto(); c.cenarios.bull.avaliacao.g = 0.9
    expect(conjuntoSchema.safeParse(c).success).toBe(false)
    const d = conjunto(); d.cenarios.base.avaliacao.beta = Number.NaN
    expect(conjuntoSchema.safeParse(d).success).toBe(false)
    const e = conjunto(); e.probabilidades.bear = 2
    expect(conjuntoSchema.safeParse(e).success).toBe(false)
  })
  it("limita a tese e o título", () => {
    expect(conjuntoSchema.safeParse({ ...conjunto(), tese: "x".repeat(3001) }).success).toBe(false)
    expect(guardarSchema.safeParse({ ticker: "MSCI", titulo: "x".repeat(81), conjunto: conjunto() }).success).toBe(false)
  })
})
