import { describe, it, expect } from "vitest"
import {
  costOfEquity,
  costOfDebt,
  computeWacc,
  DEFAULT_RISK_FREE_RATE,
  DEFAULT_EQUITY_RISK_PREMIUM,
  DEFAULT_EFFECTIVE_TAX_RATE,
} from "@/lib/finance/wacc"

describe("WACC via CAPM", () => {
  describe("costOfEquity", () => {
    it("calculates Re = Rf + β × (Rm − Rf)", () => {
      // Rf=2.5%, β=1.2, ERP=5.5%
      // Re = 2.5% + 1.2 × 5.5% = 2.5% + 6.6% = 9.1%
      const re = costOfEquity(1.2, 0.025, 0.055)
      expect(re).toBeCloseTo(0.091, 3)
    })

    it("uses defaults when not provided", () => {
      const re = costOfEquity(1.0)
      // Re = 0.025 + 1.0 × 0.055 = 0.08
      expect(re).toBeCloseTo(0.08, 3)
    })

    it("returns null when beta is null", () => {
      const re = costOfEquity(null)
      expect(re).toBe(null)
    })

    it("handles beta=0 (defensive stock)", () => {
      const re = costOfEquity(0, 0.025, 0.055)
      expect(re).toBeCloseTo(0.025, 3) // Just Rf
    })

    it("handles negative beta", () => {
      // Raro, mas alguns ativos podem ter β negativo (inverse correlation)
      const re = costOfEquity(-0.5, 0.025, 0.055)
      expect(re).toBeCloseTo(0.025 - 0.5 * 0.055, 3)
    })
  })

  describe("costOfDebt", () => {
    it("calculates Rd_after_tax = (Interest / Debt) × (1 − Tc)", () => {
      // Interest=2.5B, Debt=100B, Tc=21%
      // Rd_pretax = 2.5% / 100 = 2.5%
      // Rd_after_tax = 2.5% × (1 − 0.21) = 2.5% × 0.79 = 1.975%
      const rd = costOfDebt(2.5e9, 100e9, 0.21)
      expect(rd).toBeCloseTo(0.01975, 4)
    })

    it("returns null when debt is zero", () => {
      const rd = costOfDebt(10, 0)
      expect(rd).toBe(null)
    })

    it("returns null when debt is negative", () => {
      const rd = costOfDebt(10, -50)
      expect(rd).toBe(null)
    })

    it("returns null when interest is negative", () => {
      const rd = costOfDebt(-10, 100)
      expect(rd).toBe(null)
    })

    it("returns null when interest expense is null", () => {
      const rd = costOfDebt(null, 100)
      expect(rd).toBe(null)
    })

    it("uses default tax rate when not provided", () => {
      // Interest=2.5, Debt=100, default Tc=0.21
      // Rd = (2.5 / 100) × 0.79 = 0.01975
      const rd = costOfDebt(2.5, 100)
      expect(rd).toBeCloseTo(0.01975, 4)
    })
  })

  describe("computeWacc", () => {
    it("calculates WACC for a levered company", () => {
      // AAPL-like: β=1.2, price=$150, shares=15.5B, netDebt=$100B, interest=$2.5B
      // E = 150 × 15.5B = 2,325B
      // D = 100B
      // V = 2,425B
      // wE = 2325/2425 = 0.9587, wD = 100/2425 = 0.0413
      // Re = 2.5% + 1.2 × 5.5% = 9.1%
      // Rd = (2.5B / 100B) × (1 - 0.21) = 1.975%
      // WACC = 0.9587 × 9.1% + 0.0413 × 1.975% = 8.745% + 0.0816% = 8.827%
      const breakdown = computeWacc({
        beta: 1.2,
        currentPrice: 150,
        shares: 15.5e9,
        netDebt: 100e9,
        interestExpense: 2.5e9,
        riskFreeRate: 0.025,
        equityRiskPremium: 0.055,
        effectiveTaxRate: 0.21,
      })
      expect(breakdown).not.toBe(null)
      expect(breakdown!.costOfEquity).toBeCloseTo(0.091, 3)
      expect(breakdown!.costOfDebtAfterTax).toBeCloseTo(0.01975, 4)
      expect(breakdown!.wacc).toBeCloseTo(0.08827, 3)
    })

    it("handles unlevered company (no debt)", () => {
      // Company with netDebt=0
      // WACC = 100% × Re (só equity)
      const breakdown = computeWacc({
        beta: 1.0,
        currentPrice: 100,
        shares: 1e9,
        netDebt: 0,
        interestExpense: null,
        riskFreeRate: 0.025,
        equityRiskPremium: 0.055,
      })
      expect(breakdown).not.toBe(null)
      expect(breakdown!.weightEquity).toBeCloseTo(1.0, 3)
      expect(breakdown!.weightDebt).toBeCloseTo(0, 3)
      expect(breakdown!.wacc).toBeCloseTo(0.08, 3) // Just Re
    })

    it("returns null when beta is null (can't compute CAPM)", () => {
      const breakdown = computeWacc({
        beta: null,
        currentPrice: 100,
        shares: 1e9,
        netDebt: 50e9,
        interestExpense: 1e9,
      })
      expect(breakdown).toBe(null)
    })

    it("returns null when currentPrice or shares result in 0 market cap", () => {
      const breakdown = computeWacc({
        beta: 1.0,
        currentPrice: 0,
        shares: 1e9,
        netDebt: 50e9,
        interestExpense: 1e9,
      })
      expect(breakdown).toBe(null)
    })

    it("uses default values when not provided", () => {
      // Unlevered, just equity
      const breakdown = computeWacc({
        beta: 1.0,
        currentPrice: 100,
        shares: 1e9,
        netDebt: 0,
        interestExpense: null,
      })
      expect(breakdown).not.toBe(null)
      expect(breakdown!.riskFreeRate).toBe(DEFAULT_RISK_FREE_RATE)
      expect(breakdown!.equityRiskPremium).toBe(DEFAULT_EQUITY_RISK_PREMIUM)
      expect(breakdown!.effectiveTaxRate).toBe(DEFAULT_EFFECTIVE_TAX_RATE)
    })

    it("handles defensive stock (β < 1)", () => {
      // Utility company with β=0.7
      // Re = 2.5% + 0.7 × 5.5% = 6.35%
      const breakdown = computeWacc({
        beta: 0.7,
        currentPrice: 50,
        shares: 2e9,
        netDebt: 10e9,
        interestExpense: null,
      })
      expect(breakdown).not.toBe(null)
      expect(breakdown!.costOfEquity).toBeCloseTo(0.0635, 4)
    })

    it("handles growth stock (β > 1)", () => {
      // Tech company with β=1.8
      // Re = 2.5% + 1.8 × 5.5% = 12.4%
      const breakdown = computeWacc({
        beta: 1.8,
        currentPrice: 500,
        shares: 1e9,
        netDebt: 0,
        interestExpense: null,
      })
      expect(breakdown).not.toBe(null)
      expect(breakdown!.costOfEquity).toBeCloseTo(0.124, 3)
      expect(breakdown!.wacc).toBeCloseTo(0.124, 3) // Unlevered
    })
  })
})
