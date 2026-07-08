import { describe, it, expect } from "vitest"
import { deriveEffectiveTaxRate, deriveFcff, computeBaseFcf, type FcfSourceRecord } from "@/lib/finance/fcf"

describe("FCF Derivation", () => {
  describe("deriveEffectiveTaxRate", () => {
    it("calculates effective tax rate from operatingIncome/interestExpense/taxExpense", () => {
      // operatingIncome=100, interestExpense=5, taxExpense=20
      // pretax = 100 - 5 = 95; rate = 20 / 95 = 0.2105
      const result = deriveEffectiveTaxRate(100, 5, 20)
      expect(result.rate).toBeCloseTo(0.2105, 3)
      expect(result.usedFallback).toBe(false)
    })

    it("returns fallback when operatingIncome is null", () => {
      const result = deriveEffectiveTaxRate(null, 10, 20)
      expect(result.rate).toBe(0.21)
      expect(result.usedFallback).toBe(true)
    })

    it("returns fallback when pretax income ≤ 0", () => {
      // operatingIncome=100, interestExpense=200 → pretax = -100
      const result = deriveEffectiveTaxRate(100, 200, 50)
      expect(result.rate).toBe(0.21)
      expect(result.usedFallback).toBe(true)
    })

    it("clamps calculated rate to [0, 0.6]", () => {
      // operatingIncome=10, interestExpense=2, taxExpense=100 → rate=1.25
      const result = deriveEffectiveTaxRate(10, 2, 100)
      expect(result.rate).toBe(0.21)
      expect(result.usedFallback).toBe(true)
    })
  })

  describe("deriveFcff", () => {
    it("calculates FCFF = OCF + Interest×(1−taxRate) − CapEx", () => {
      // OCF=100, Interest=10, taxExpense=21, operatingIncome=131
      // pretax = 131 - 10 = 121; taxRate = 21 / 121 ≈ 0.1736
      // FCFF = 100 + 10×(1-0.1736) − 20 = 100 + 8.264 − 20 = 88.264
      const record: FcfSourceRecord = {
        fiscalYear: 2023,
        operatingCashFlow: 100,
        capex: 20,
        interestExpense: 10,
        taxExpense: 21,
        operatingIncome: 131,
      }
      const result = deriveFcff(record)
      expect(result.fcff).toBeCloseTo(88.26, 1)
      expect(result.usedFallbackTaxRate).toBe(false)
    })

    it("returns null fcff when operatingCashFlow is null", () => {
      const record: FcfSourceRecord = {
        fiscalYear: 2023,
        operatingCashFlow: null,
        capex: 20,
        interestExpense: 10,
        taxExpense: 21,
        operatingIncome: 131,
      }
      const result = deriveFcff(record)
      expect(result.fcff).toBe(null)
    })

    it("returns null fcff when capex is null", () => {
      const record: FcfSourceRecord = {
        fiscalYear: 2023,
        operatingCashFlow: 100,
        capex: null,
        interestExpense: 10,
        taxExpense: 21,
        operatingIncome: 131,
      }
      const result = deriveFcff(record)
      expect(result.fcff).toBe(null)
    })

    it("treats null interest expense as zero", () => {
      const record: FcfSourceRecord = {
        fiscalYear: 2023,
        operatingCashFlow: 100,
        capex: 20,
        interestExpense: null,
        taxExpense: 21,
        operatingIncome: 100,
      }
      const result = deriveFcff(record)
      // FCFF = 100 + 0×(1-tax) − 20 = 80
      expect(result.fcff).toBeCloseTo(80, 1)
    })
  })

  describe("computeBaseFcf", () => {
    it("returns latest FCF in LATEST mode", () => {
      const values = [70, 60, 50] // [2023, 2022, 2021]
      const result = computeBaseFcf(values, "LATEST")
      expect(result).toBe(70)
    })

    it("returns average of last 3 in AVG3 mode", () => {
      const values = [90, 60, 50] // [2023, 2022, 2021]
      const result = computeBaseFcf(values, "AVG3")
      // (90 + 60 + 50) / 3 = 66.67
      expect(result).toBeCloseTo(66.67, 1)
    })

    it("handles fewer than 3 records in AVG3 mode", () => {
      const values = [90, 60] // [2023, 2022]
      const result = computeBaseFcf(values, "AVG3")
      // (90 + 60) / 2 = 75
      expect(result).toBeCloseTo(75, 1)
    })

    it("returns median of last 3 in MEDIAN3 mode", () => {
      const values = [90, 60, 50] // [2023, 2022, 2021]
      const result = computeBaseFcf(values, "MEDIAN3")
      // Median of [50, 60, 90] = 60
      expect(result).toBe(60)
    })

    it("returns null for empty series", () => {
      const result = computeBaseFcf([], "LATEST")
      expect(result).toBe(null)
    })

    it("computes median correctly with even-length series", () => {
      const values = [100, 50] // 2 values
      const result = computeBaseFcf(values, "MEDIAN3")
      // Median of [50, 100] = (50 + 100) / 2 = 75
      expect(result).toBeCloseTo(75, 1)
    })
  })
})
