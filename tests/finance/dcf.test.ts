import { describe, it, expect } from "vitest"
import { runDcf, type DcfInputs, type DcfResult } from "@/lib/finance/dcf"

/**
 * Implementação de referência da fórmula do spec (CLAUDE.md §10):
 *   FCF_n = FCF_{n-1} × (1 + g_n) ;  PV = FCF_n / (1 + WACC)^n
 *   TV = FCF_10 × (1 + gT) / (WACC − gT) ;  PV(TV) = TV / (1 + WACC)^10
 *   Fair Value = (Σ PV + PV(TV) − netDebt) / shares
 * Escrita de forma independente para validar runDcf contra o spec.
 */
function referenceFairValue(i: DcfInputs): number {
  let fcf = i.fcf0
  let sumPv = 0
  for (let year = 1; year <= 10; year++) {
    fcf *= 1 + (year <= 5 ? i.growthStage1 : i.growthStage2)
    sumPv += fcf / Math.pow(1 + i.wacc, year)
  }
  const tv = (fcf * (1 + i.terminalGrowth)) / (i.wacc - i.terminalGrowth)
  const pvTv = tv / Math.pow(1 + i.wacc, 10)
  return (sumPv + pvTv - i.netDebt) / i.shares
}

function expectAllFinite(r: DcfResult) {
  const numericFields = [
    r.sumPvFcf, r.terminalValue, r.pvTerminalValue,
    r.enterpriseValue, r.equityValue, r.fairValue,
    r.currentPrice, r.marginOfSafety,
  ]
  for (const v of numericFields) {
    expect(Number.isFinite(v), `campo numérico deve ser finito, obtido: ${v}`).toBe(true)
    expect(Number.isNaN(v)).toBe(false)
  }
  for (const p of r.projections) {
    expect(Number.isFinite(p.fcf)).toBe(true)
    expect(Number.isFinite(p.presentValue)).toBe(true)
  }
}

const BASE: DcfInputs = {
  fcf0: 1_000_000_000,      // $1B
  growthStage1: 0.05,
  growthStage2: 0.05,
  wacc: 0.08,
  terminalGrowth: 0.025,
  shares: 1_000_000_000,     // 1000M ações
  netDebt: 0,
  currentPrice: 20,
}

describe("runDcf — casos matemáticos", () => {
  it("caso exato: FCF constante e gT=0 ⇒ EV = FCF/WACC (perpetuidade)", () => {
    // Com crescimento 0 em ambas as fases e terminal growth 0, a soma
    // anuidade(10 anos) + perpetuidade descontada colapsa exatamente em FCF/WACC.
    const r = runDcf({
      fcf0: 100, growthStage1: 0, growthStage2: 0,
      wacc: 0.10, terminalGrowth: 0,
      shares: 10, netDebt: 0, currentPrice: 80,
    })
    expect(r.valid).toBe(true)
    expect(r.enterpriseValue).toBeCloseTo(1000, 6) // 100 / 0.10
    expect(r.fairValue).toBeCloseTo(100, 6)        // 1000 / 10 ações
    expect(r.marginOfSafety).toBeCloseTo(0.20, 6)  // (100 − 80) / 100
  })

  it("crescimento +5% anual, WACC 8%, 1000M ações — bate com a fórmula do spec", () => {
    const r = runDcf(BASE)
    expect(r.valid).toBe(true)
    expect(r.fairValue).toBeCloseTo(referenceFairValue(BASE), 6)
    // Sanidade: FCF do ano 1 = 1B × 1.05; ano 10 = 1B × 1.05^10
    expect(r.projections[0].fcf).toBeCloseTo(1_050_000_000, 0)
    expect(r.projections[9].fcf).toBeCloseTo(1_000_000_000 * Math.pow(1.05, 10), 0)
    expect(r.projections).toHaveLength(10)
    expectAllFinite(r)
  })

  it("crescimento −2% anual — FCF decresce e o resultado continua válido", () => {
    const inputs: DcfInputs = { ...BASE, growthStage1: -0.02, growthStage2: -0.02 }
    const r = runDcf(inputs)
    expect(r.valid).toBe(true)
    expect(r.fairValue).toBeCloseTo(referenceFairValue(inputs), 6)
    expect(r.projections[9].fcf).toBeLessThan(BASE.fcf0)
    expect(r.fairValue).toBeGreaterThan(0)
    expectAllFinite(r)
  })

  it("desconta PV = FCF_n / (1+WACC)^n em cada ano", () => {
    const r = runDcf(BASE)
    for (const p of r.projections) {
      expect(p.presentValue).toBeCloseTo(p.fcf / Math.pow(1.08, p.year), 4)
    }
  })

  it("subtrai a dívida líquida ao enterprise value", () => {
    const withDebt = runDcf({ ...BASE, netDebt: 5_000_000_000 })
    const noDebt = runDcf(BASE)
    expect(withDebt.equityValue).toBeCloseTo(noDebt.enterpriseValue - 5_000_000_000, 2)
    expect(withDebt.fairValue).toBeLessThan(noDebt.fairValue)
  })

  it("margem de segurança = (FV − preço) / FV; negativa quando sobreavaliada", () => {
    const r = runDcf(BASE)
    expect(r.marginOfSafety).toBeCloseTo((r.fairValue - 20) / r.fairValue, 8)

    const overpriced = runDcf({ ...BASE, currentPrice: r.fairValue * 2 })
    expect(overpriced.marginOfSafety).toBeLessThan(0)
  })
})

describe("runDcf — inputs inválidos nunca produzem NaN/Infinity", () => {
  it("WACC ≤ terminal growth ⇒ valid=false, INVALID_WACC (TV de Gordon divergiria)", () => {
    const r = runDcf({ ...BASE, wacc: 0.02, terminalGrowth: 0.025 })
    expect(r.valid).toBe(false)
    expect(r.error).toBe("INVALID_WACC")
    expectAllFinite(r)
  })

  it("WACC igual ao terminal growth também é rejeitado (divisão por zero)", () => {
    const r = runDcf({ ...BASE, wacc: 0.025, terminalGrowth: 0.025 })
    expect(r.valid).toBe(false)
    expectAllFinite(r)
  })

  it("shares = 0 ⇒ valid=false, INVALID_SHARES", () => {
    const r = runDcf({ ...BASE, shares: 0 })
    expect(r.valid).toBe(false)
    expect(r.error).toBe("INVALID_SHARES")
    expectAllFinite(r)
  })

  it("fcf0 = NaN ⇒ valid=false, INVALID_FCF", () => {
    const r = runDcf({ ...BASE, fcf0: NaN })
    expect(r.valid).toBe(false)
    expect(r.error).toBe("INVALID_FCF")
    expectAllFinite(r)
  })

  it("resultado válido também é sempre finito (caso extremo de crescimento alto)", () => {
    const r = runDcf({ ...BASE, growthStage1: 0.5, growthStage2: 0.25 })
    expect(r.valid).toBe(true)
    expectAllFinite(r)
  })
})
