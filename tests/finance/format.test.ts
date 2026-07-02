import { describe, it, expect } from "vitest"
import { formatLargeNumber, formatPercent, formatPrice } from "@/lib/finance/format"

describe("formatLargeNumber", () => {
  it("biliões: 383_285_000_000 → \"$383.29B\"", () => {
    expect(formatLargeNumber(383_285_000_000)).toBe("$383.29B")
  })

  it("milhões: 1_500_000 → \"$1.50M\"", () => {
    expect(formatLargeNumber(1_500_000)).toBe("$1.50M")
  })

  it("triliões e milhares", () => {
    expect(formatLargeNumber(2_500_000_000_000)).toBe("$2.50T")
    expect(formatLargeNumber(1_500)).toBe("$1.50K")
    expect(formatLargeNumber(999)).toBe("$999.00")
  })

  it("negativos mantêm o sinal antes da moeda", () => {
    expect(formatLargeNumber(-1_500_000_000)).toBe("-$1.50B")
  })

  it("moeda customizada", () => {
    expect(formatLargeNumber(1_500_000, "€")).toBe("€1.50M")
  })

  it("null/undefined/NaN/Infinity → \"N/A\" — NUNCA \"0\" nem \"undefined\"", () => {
    for (const bad of [null, undefined, NaN, Infinity, -Infinity]) {
      const out = formatLargeNumber(bad as never)
      expect(out).toBe("N/A")
      expect(out).not.toBe("0")
      expect(out).not.toContain("undefined")
    }
  })
})

describe("formatPercent", () => {
  it("0.4413 com 2 casas → \"44.13%\"", () => {
    expect(formatPercent(0.4413, 2)).toBe("44.13%")
  })

  it("default é 1 casa decimal: 0.1 → \"10.0%\"", () => {
    expect(formatPercent(0.1)).toBe("10.0%")
  })

  it("negativos: −0.052 → \"-5.2%\"", () => {
    expect(formatPercent(-0.052)).toBe("-5.2%")
  })

  it("null/NaN → \"N/A\"", () => {
    expect(formatPercent(null)).toBe("N/A")
    expect(formatPercent(NaN)).toBe("N/A")
    expect(formatPercent(undefined)).toBe("N/A")
  })
})

describe("formatPrice", () => {
  it("187.42 → \"$187.42\"", () => {
    expect(formatPrice(187.42)).toBe("$187.42")
  })

  it("null/undefined/NaN → \"N/A\"", () => {
    expect(formatPrice(null)).toBe("N/A")
    expect(formatPrice(undefined)).toBe("N/A")
    expect(formatPrice(NaN)).toBe("N/A")
  })
})
