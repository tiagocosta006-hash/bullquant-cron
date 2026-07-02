import { describe, it, expect } from "vitest"
import { calculateCagr } from "@/lib/finance/cagr"

describe("calculateCagr — CAGR = (fim/início)^(1/n) − 1", () => {
  it("revenue 1B → 2B em 5 anos ≈ 14.87%", () => {
    const cagr = calculateCagr(1_000_000_000, 2_000_000_000, 5)
    expect(cagr).not.toBeNull()
    expect(cagr!).toBeCloseTo(0.1487, 4) // 2^(1/5) − 1 = 0.148698…
  })

  it("valores flat ⇒ 0%", () => {
    expect(calculateCagr(1_000_000_000, 1_000_000_000, 5)).toBeCloseTo(0, 10)
  })

  it("decrescimento: 2B → 1B em 5 anos ≈ −12.94%", () => {
    const cagr = calculateCagr(2_000_000_000, 1_000_000_000, 5)
    expect(cagr!).toBeCloseTo(Math.pow(0.5, 1 / 5) - 1, 10)
    expect(cagr!).toBeLessThan(0)
  })

  it("início = 0 ⇒ null (nunca Infinity)", () => {
    expect(calculateCagr(0, 2_000_000_000, 5)).toBeNull()
  })

  it("início negativo ⇒ null (potência fracionária de negativo daria NaN)", () => {
    expect(calculateCagr(-500, 1000, 5)).toBeNull()
  })

  it("fim ≤ 0 ⇒ null", () => {
    expect(calculateCagr(1000, 0, 5)).toBeNull()
    expect(calculateCagr(1000, -100, 5)).toBeNull()
  })

  it("anos ≤ 0 ⇒ null", () => {
    expect(calculateCagr(1000, 2000, 0)).toBeNull()
    expect(calculateCagr(1000, 2000, -3)).toBeNull()
  })

  it("inputs null/undefined/NaN/Infinity ⇒ null", () => {
    expect(calculateCagr(null, 2000, 5)).toBeNull()
    expect(calculateCagr(1000, undefined, 5)).toBeNull()
    expect(calculateCagr(NaN, 2000, 5)).toBeNull()
    expect(calculateCagr(1000, Infinity, 5)).toBeNull()
  })

  it("nunca devolve NaN nem Infinity para qualquer combinação problemática", () => {
    const weird = [0, -1, NaN, Infinity, -Infinity, null, undefined, 1e-9, 1e15]
    for (const a of weird) for (const b of weird) for (const n of weird) {
      const r = calculateCagr(a as never, b as never, n as never)
      if (r !== null) {
        expect(Number.isFinite(r), `cagr(${a}, ${b}, ${n}) = ${r}`).toBe(true)
      }
    }
  })
})
