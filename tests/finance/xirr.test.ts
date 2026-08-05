import { describe, it, expect } from "vitest"
import {
  calculateXirr,
  calculatePortfolioReturn,
  isExternalCashFlow,
  type CashFlow,
  type BrokerMovement,
} from "@/lib/finance/xirr"

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe("calculateXirr — Σ amount/(1+r)^(dias/365) = 0", () => {
  it("caso trivial: −1000 → +1100 em 1 ano ≈ 10%", () => {
    // 2020 é bissexto (366 dias), logo actual/365 dá ligeiramente abaixo de 10%.
    const xirr = calculateXirr([
      { date: d("2020-01-01"), amount: -1000 },
      { date: d("2021-01-01"), amount: 1100 },
    ])
    expect(xirr).not.toBeNull()
    expect(xirr!).toBeCloseTo(0.0997, 4)
  })

  it("sem ganho ⇒ 0%", () => {
    const xirr = calculateXirr([
      { date: d("2020-01-01"), amount: -1000 },
      { date: d("2022-01-01"), amount: 1000 },
    ])
    expect(xirr!).toBeCloseTo(0, 6)
  })

  it("perda: −1000 → +500 em 1 ano ≈ −50%", () => {
    const xirr = calculateXirr([
      { date: d("2021-01-01"), amount: -1000 },
      { date: d("2022-01-01"), amount: 500 },
    ])
    expect(xirr!).toBeCloseTo(-0.5, 3)
    expect(xirr!).toBeLessThan(0)
  })

  it("pondera o momento: depósito tardio empurra o XIRR acima da anualização ingénua", () => {
    // 1000 há 2 anos + 1000 há 1 mês, valor final 2200 (ganho de 200 = 10% total).
    // Anualizar ingenuamente sobre 2 anos daria (2200/2000)^(1/2)−1 ≈ 4.88%,
    // como se os 2000 tivessem estado investidos o tempo todo — e não estiveram.
    // Metade do capital entrou há 1 mês, logo a taxa real tem de ser maior.
    const xirr = calculateXirr([
      { date: d("2024-01-01"), amount: -1000 },
      { date: d("2025-12-01"), amount: -1000 },
      { date: d("2026-01-01"), amount: 2200 },
    ])
    const naive = Math.pow(2200 / 2000, 1 / 2) - 1
    expect(naive).toBeCloseTo(0.0488, 4)
    expect(xirr!).toBeCloseTo(0.0919, 4)
    expect(xirr!).toBeGreaterThan(naive)
    // Mas abaixo do retorno total (10%), porque o período é superior a 1 ano.
    expect(xirr!).toBeLessThan(0.1)
  })

  it("ordem dos cash flows é irrelevante", () => {
    const flows: CashFlow[] = [
      { date: d("2026-01-01"), amount: 2200 },
      { date: d("2024-01-01"), amount: -1000 },
      { date: d("2025-12-01"), amount: -1000 },
    ]
    const reversed = [...flows].reverse()
    expect(calculateXirr(flows)).toBeCloseTo(calculateXirr(reversed)!, 10)
  })

  it("não muta o array recebido", () => {
    const flows: CashFlow[] = [
      { date: d("2026-01-01"), amount: 2200 },
      { date: d("2024-01-01"), amount: -1000 },
    ]
    const snapshot = flows.map(f => f.date.getTime())
    calculateXirr(flows)
    expect(flows.map(f => f.date.getTime())).toEqual(snapshot)
  })

  it("retornos extremos continuam a convergir (+900% num ano)", () => {
    const xirr = calculateXirr([
      { date: d("2025-01-01"), amount: -100 },
      { date: d("2026-01-01"), amount: 1000 },
    ])
    expect(xirr).not.toBeNull()
    expect(xirr!).toBeCloseTo(9, 1)
  })

  it("perda quase total converge sem estourar abaixo de −100%", () => {
    const xirr = calculateXirr([
      { date: d("2025-01-01"), amount: -1000 },
      { date: d("2026-01-01"), amount: 1 },
    ])
    expect(xirr).not.toBeNull()
    expect(xirr!).toBeGreaterThan(-1)
    expect(xirr!).toBeLessThan(-0.99)
  })

  it("muitos cash flows (120 depósitos mensais) converge", () => {
    const flows: CashFlow[] = []
    for (let i = 0; i < 120; i++) {
      const date = new Date(Date.UTC(2016, i, 1))
      flows.push({ date, amount: -100 })
    }
    flows.push({ date: new Date(Date.UTC(2026, 0, 1)), amount: 18_000 })
    const xirr = calculateXirr(flows)
    expect(xirr).not.toBeNull()
    expect(xirr!).toBeGreaterThan(0)
    expect(Number.isFinite(xirr!)).toBe(true)
  })

  // ── casos que devem devolver null, nunca NaN/Infinity ──
  it("menos de 2 cash flows ⇒ null", () => {
    expect(calculateXirr([])).toBeNull()
    expect(calculateXirr([{ date: d("2025-01-01"), amount: -100 }])).toBeNull()
  })

  it("todos negativos ou todos positivos ⇒ null (não há raiz)", () => {
    expect(calculateXirr([
      { date: d("2025-01-01"), amount: -100 },
      { date: d("2026-01-01"), amount: -100 },
    ])).toBeNull()
    expect(calculateXirr([
      { date: d("2025-01-01"), amount: 100 },
      { date: d("2026-01-01"), amount: 100 },
    ])).toBeNull()
  })

  it("todos no mesmo dia ⇒ null (não há período para anualizar)", () => {
    expect(calculateXirr([
      { date: d("2025-01-01"), amount: -100 },
      { date: d("2025-01-01"), amount: 110 },
    ])).toBeNull()
  })

  it("data inválida ou valor não-finito ⇒ null", () => {
    expect(calculateXirr([
      { date: new Date("nao-e-data"), amount: -100 },
      { date: d("2026-01-01"), amount: 110 },
    ])).toBeNull()
    expect(calculateXirr([
      { date: d("2025-01-01"), amount: Number.NaN },
      { date: d("2026-01-01"), amount: 110 },
    ])).toBeNull()
    expect(calculateXirr([
      { date: d("2025-01-01"), amount: Number.POSITIVE_INFINITY },
      { date: d("2026-01-01"), amount: 110 },
    ])).toBeNull()
  })
})

describe("isExternalCashFlow — só depósitos/levantamentos entram no XIRR", () => {
  it("movimentos externos", () => {
    expect(isExternalCashFlow("DEPOSIT")).toBe(true)
    expect(isExternalCashFlow("WITHDRAW")).toBe(true)
    expect(isExternalCashFlow("TRANSFER")).toBe(true)
  })

  it("movimentos internos ficam de fora (já estão no valor atual)", () => {
    expect(isExternalCashFlow("FEE")).toBe(false)
    expect(isExternalCashFlow("INTEREST_ON_FREE_CASH")).toBe(false)
    expect(isExternalCashFlow("LENDING_INTEREST")).toBe(false)
  })

  it("tipo desconhecido não é assumido como externo", () => {
    expect(isExternalCashFlow("QUALQUER_COISA_NOVA")).toBe(false)
  })
})

describe("calculatePortfolioReturn", () => {
  it("exclui taxas e juros dos cash flows", () => {
    const movements: BrokerMovement[] = [
      { type: "DEPOSIT", amount: 1000, date: d("2025-01-01") },
      { type: "FEE", amount: -2.5, date: d("2025-02-01") },
      { type: "INTEREST_ON_FREE_CASH", amount: 0.42, date: d("2025-03-01") },
      { type: "LENDING_INTEREST", amount: 0.1, date: d("2025-04-01") },
    ]
    const result = calculatePortfolioReturn(movements, 1100, d("2026-01-01"))
    expect(result.ignoredInternal).toBe(3)
    expect(result.cashFlows).toHaveLength(2) // 1 depósito + valor atual
    expect(result.totalDeposited).toBe(1000)
  })

  it("normaliza o sinal: DEPOSIT sempre negativo, WITHDRAW sempre positivo", () => {
    // A API pode devolver o WITHDRAW já negativo; o resultado não deve depender disso.
    const positivo = calculatePortfolioReturn(
      [{ type: "WITHDRAW", amount: 500, date: d("2025-06-01") }], 100, d("2026-01-01"))
    const negativo = calculatePortfolioReturn(
      [{ type: "WITHDRAW", amount: -500, date: d("2025-06-01") }], 100, d("2026-01-01"))
    expect(positivo.cashFlows[0].amount).toBe(500)
    expect(negativo.cashFlows[0].amount).toBe(500)
    expect(positivo.totalWithdrawn).toBe(500)
  })

  it("ignora movimentos de valor zero ou com data inválida", () => {
    const result = calculatePortfolioReturn([
      { type: "DEPOSIT", amount: 0, date: d("2025-01-01") },
      { type: "DEPOSIT", amount: 100, date: new Date("lixo") },
      { type: "DEPOSIT", amount: Number.NaN, date: d("2025-01-01") },
      { type: "DEPOSIT", amount: 1000, date: d("2025-01-01") },
    ], 1100, d("2026-01-01"))
    expect(result.cashFlows).toHaveLength(2)
    expect(result.totalDeposited).toBe(1000)
  })

  it("o valor atual é sempre o último cash flow, na data `asOf`", () => {
    const asOf = d("2026-08-03")
    const result = calculatePortfolioReturn(
      [{ type: "DEPOSIT", amount: 1000, date: d("2024-01-01") }], 1500, asOf)
    const last = result.cashFlows[result.cashFlows.length - 1]
    expect(last.amount).toBe(1500)
    expect(last.date.getTime()).toBe(asOf.getTime())
  })

  it("sem movimentos ⇒ xirr null, sem rebentar", () => {
    const result = calculatePortfolioReturn([], 1000, d("2026-01-01"))
    expect(result.xirr).toBeNull()
    expect(result.totalReturn).toBeNull()
    expect(result.totalDeposited).toBe(0)
  })

  it("só watchlist (valor 0, sem depósitos) ⇒ null em vez de NaN", () => {
    const result = calculatePortfolioReturn([], 0, d("2026-01-01"))
    expect(result.xirr).toBeNull()
    expect(Number.isNaN(result.absoluteGain)).toBe(false)
  })

  it("conta real: 16 depósitos de 3025€ → 4663.57€ em 2.3 anos ≈ 33%", () => {
    // Dados reais de uma conta Trading212 (validados contra pyxirr e contra
    // uma implementação independente em Python: ambos deram 33.12%).
    const movements: BrokerMovement[] = [
      { type: "DEPOSIT", amount: 1000, date: d("2024-04-28") },
      { type: "DEPOSIT", amount: 10, date: d("2024-05-20") },
      { type: "DEPOSIT", amount: 100, date: d("2024-11-25") },
      { type: "DEPOSIT", amount: 300, date: d("2025-01-02") },
      { type: "DEPOSIT", amount: 30, date: d("2025-02-26") },
      { type: "DEPOSIT", amount: 20, date: d("2025-03-03") },
      { type: "DEPOSIT", amount: 100, date: d("2025-03-25") },
      { type: "DEPOSIT", amount: 50, date: d("2025-04-08") },
      { type: "DEPOSIT", amount: 50, date: d("2025-04-22") },
      { type: "DEPOSIT", amount: 50, date: d("2025-05-08") },
      { type: "DEPOSIT", amount: 50, date: d("2025-06-18") },
      { type: "DEPOSIT", amount: 50, date: d("2025-07-22") },
      { type: "DEPOSIT", amount: 22, date: d("2025-08-01") },
      { type: "DEPOSIT", amount: 1000, date: d("2025-09-29") },
      { type: "DEPOSIT", amount: 73, date: d("2026-02-05") },
      { type: "DEPOSIT", amount: 120, date: d("2026-02-12") },
    ]
    const result = calculatePortfolioReturn(movements, 4663.57, d("2026-08-03"))

    expect(result.totalDeposited).toBe(3025)
    expect(result.totalWithdrawn).toBe(0)
    expect(result.absoluteGain).toBeCloseTo(1638.57, 2)
    expect(result.totalReturn!).toBeCloseTo(0.5417, 4)
    expect(result.xirr!).toBeCloseTo(0.3312, 4)
    // O XIRR tem de ser inferior ao retorno total: o período é > 1 ano.
    expect(result.xirr!).toBeLessThan(result.totalReturn!)
  })
})
