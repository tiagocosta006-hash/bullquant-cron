import { describe, it, expect } from "vitest"
import { mergePosition, calculatePositionPnl, aggregatePnl, positionWeight } from "@/lib/finance/portfolio"

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

describe("positionWeight — peso da posição no portfólio", () => {
  it("quota simples: 2500 em 10000 ⇒ 25%", () => {
    expect(positionWeight(2500, 10000)).toBe(0.25)
  })

  it("os pesos de todas as posições somam 1", () => {
    const values = [2500, 6000, 1500]
    const total = values.reduce((s, v) => s + v, 0)
    const sum = values.reduce((s, v) => s + (positionWeight(v, total) ?? 0), 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it("posição sem valor de mercado ⇒ null (N/A), nunca 0", () => {
    expect(positionWeight(null, 10000)).toBeNull()
    expect(positionWeight(undefined, 10000)).toBeNull()
    expect(positionWeight(NaN, 10000)).toBeNull()
  })

  it("portfólio sem valor total (watchlist pura) ⇒ null, não divisão por zero", () => {
    expect(positionWeight(0, 0)).toBeNull()
    expect(positionWeight(100, 0)).toBeNull()
    expect(positionWeight(100, -5)).toBeNull()
  })

  it("uma posição a valer 0 tem peso 0, o que é diferente de N/A", () => {
    expect(positionWeight(0, 10000)).toBe(0)
  })
})
