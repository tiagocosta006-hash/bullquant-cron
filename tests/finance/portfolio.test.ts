import { describe, it, expect } from "vitest"
import { mergePosition, calculatePositionPnl, aggregatePnl } from "@/lib/finance/portfolio"

describe("mergePosition — média ponderada do preço de compra", () => {
  it("10@100 + 10@200 ⇒ 20@150", () => {
    const merged = mergePosition(
      { quantity: 10, avgBuyPrice: 100 },
      { quantity: 10, avgBuyPrice: 200 }
    )
    expect(merged.quantity).toBe(20)
    expect(merged.avgBuyPrice).toBeCloseTo(150, 10)
  })

  it("pesos diferentes: 30@10 + 10@30 ⇒ 40@15", () => {
    const merged = mergePosition(
      { quantity: 30, avgBuyPrice: 10 },
      { quantity: 10, avgBuyPrice: 30 }
    )
    expect(merged.avgBuyPrice).toBeCloseTo(15, 10)
  })
})

describe("calculatePositionPnl — custo base inclui fees", () => {
  it("sem fees: 10@100, preço 120 ⇒ +200 (+20%)", () => {
    const pnl = calculatePositionPnl(10, 100, 120)
    expect(pnl.costBasis).toBe(1000)
    expect(pnl.marketValue).toBe(1200)
    expect(pnl.pnlAbsolute).toBe(200)
    expect(pnl.pnlPercent).toBeCloseTo(0.2, 10)
  })

  it("fees entram no custo base: 10@100 + 50 de taxas, preço 120 ⇒ +150", () => {
    const pnl = calculatePositionPnl(10, 100, 120, 50)
    expect(pnl.costBasis).toBe(1050)
    expect(pnl.pnlAbsolute).toBe(150)
    expect(pnl.pnlPercent).toBeCloseTo(150 / 1050, 10)
  })

  it("fees default 0 mantém comportamento antigo", () => {
    expect(calculatePositionPnl(5, 40, 40).pnlAbsolute).toBe(0)
  })
})

describe("aggregatePnl — soma de posições", () => {
  it("agrega custo, valor e P&L; percent sobre o custo total", () => {
    const total = aggregatePnl([
      calculatePositionPnl(10, 100, 120),        // +200 sobre 1000
      calculatePositionPnl(10, 100, 90, 100),    // -200 sobre 1100
    ])
    expect(total.costBasis).toBe(2100)
    expect(total.pnlAbsolute).toBe(0)
    expect(total.pnlPercent).toBeCloseTo(0, 10)
  })
})
