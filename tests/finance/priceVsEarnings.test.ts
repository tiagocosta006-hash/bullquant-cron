import { describe, it, expect } from "vitest"
import { buildPriceVsEarnings, type PriceEarningsRow } from "@/lib/finance/priceVsEarnings"

/** Série trimestral sintética: `quarters` pontos espaçados ~91 dias. */
function series(
  quarters: number,
  price: (i: number) => number,
  netIncome: (i: number) => number | null,
  start = "2016-01-01",
): PriceEarningsRow[] {
  const startMs = new Date(start).getTime()
  return Array.from({ length: quarters }, (_, i) => ({
    date: new Date(startMs + i * 91 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    price: price(i),
    netIncome: netIncome(i),
  }))
}

describe("buildPriceVsEarnings", () => {
  it("indexa as duas séries a 100 na mesma data-base", () => {
    const r = buildPriceVsEarnings(series(20, i => 100 + i, i => 1_000 + i * 10), null)
    expect(r.data[0].priceIdx).toBe(100)
    expect(r.data[0].earningsIdx).toBe(100)
    expect(r.baseDate).toBe("2016-01-01")
    expect(r.baseShifted).toBe(false)
  })

  it("preço a duplicar e lucro a triplicar dão índices 200 e 300 no fim", () => {
    const r = buildPriceVsEarnings(series(21, i => 100 * (1 + i / 20), i => 1_000 * (1 + (2 * i) / 20)), null)
    const last = r.data[r.data.length - 1]
    expect(last.priceIdx).toBeCloseTo(200, 6)
    expect(last.earningsIdx).toBeCloseTo(300, 6)
    expect(r.priceTotal).toBeCloseTo(1, 6)
    expect(r.earningsTotal).toBeCloseTo(2, 6)
  })

  it("o gap de CAGR identifica expansão de múltiplo", () => {
    // 5 anos: preço ×4 (CAGR ~32%), lucro ×2 (CAGR ~14.9%) → gap positivo
    const q = 21
    const r = buildPriceVsEarnings(
      series(q, i => 100 * Math.pow(4, i / (q - 1)), i => 1_000 * Math.pow(2, i / (q - 1))),
      null,
    )
    expect(r.priceCagr).not.toBeNull()
    expect(r.earningsCagr).not.toBeNull()
    expect(r.priceCagr! - r.earningsCagr!).toBeGreaterThan(0.1)
  })

  it("ancora no primeiro trimestre lucrativo quando houve prejuízos antes", () => {
    // 8 trimestres de prejuízo, depois lucro a crescer
    const r = buildPriceVsEarnings(
      series(24, i => 50 + i, i => (i < 8 ? -500 + i * 10 : 100 * (i - 7))),
      null,
    )
    expect(r.baseShifted).toBe(true)
    expect(r.baseDate).toBe(r.data[0].date)
    // A base é o 9.º ponto (índice 8) e tem lucro positivo
    expect(r.data[0].earningsIdx).toBe(100)
    expect(r.data.every(d => d.netIncome > 0)).toBe(true)
  })

  it("devolve vazio quando a empresa nunca teve lucro na janela", () => {
    const r = buildPriceVsEarnings(series(20, i => 50 + i, () => -1_000), null)
    expect(r.data).toEqual([])
    expect(r.baseDate).toBeNull()
  })

  it("devolve vazio quando só o último ponto é lucrativo (nada para comparar)", () => {
    const r = buildPriceVsEarnings(series(12, i => 50 + i, i => (i === 11 ? 500 : -500)), null)
    expect(r.data).toEqual([])
  })

  it("ignora pontos sem lucro TTM ou com preço inválido", () => {
    const rows = series(12, i => 100 + i, i => 1_000 + i)
    rows[3].netIncome = null
    rows[5].price = 0
    rows[7].netIncome = Number.NaN
    const r = buildPriceVsEarnings(rows, null)
    expect(r.data.length).toBe(9)
    expect(r.data.every(d => Number.isFinite(d.priceIdx) && Number.isFinite(d.earningsIdx))).toBe(true)
  })

  it("nunca devolve NaN no CAGR quando o lucro final é negativo", () => {
    // Lucro parte positivo e cai para prejuízo: a raiz fracionária de um
    // negativo daria NaN — tem de ser null.
    const r = buildPriceVsEarnings(series(21, i => 100 + i, i => 1_000 - i * 100), null)
    expect(r.earningsCagr).toBeNull()
    expect(r.priceCagr).not.toBeNull()
    // A variação total continua a ser informativa
    expect(r.earningsTotal).toBeLessThan(-1)
  })

  it("sem 1 ano completo não calcula CAGR, só variação total", () => {
    const r = buildPriceVsEarnings(series(3, i => 100 + i, i => 1_000 + i), null)
    expect(r.years).toBeLessThan(1)
    expect(r.priceCagr).toBeNull()
    expect(r.earningsCagr).toBeNull()
    expect(r.priceTotal).not.toBeNull()
  })

  it("a janela em anos corta a série a contar do último ponto", () => {
    const all = buildPriceVsEarnings(series(41, i => 100 + i, i => 1_000 + i), null)
    const fiveY = buildPriceVsEarnings(series(41, i => 100 + i, i => 1_000 + i), 5)
    expect(all.years).toBeGreaterThan(9.5)
    expect(fiveY.years).toBeGreaterThan(4.5)
    expect(fiveY.years).toBeLessThan(5.1)
    // A base da janela de 5 anos é mais recente que a da série completa
    expect(new Date(fiveY.baseDate!).getTime()).toBeGreaterThan(new Date(all.baseDate!).getTime())
  })

  it("faz downsample mas preserva o primeiro e o último ponto", () => {
    const rows = series(1_000, i => 100 + i, i => 1_000 + i)
    const r = buildPriceVsEarnings(rows, null, 100)
    expect(r.data.length).toBeLessThanOrEqual(101)
    expect(r.data[0].date).toBe(rows[0].date)
    expect(r.data[r.data.length - 1].date).toBe(rows[rows.length - 1].date)
  })

  it("sugere escala log quando uma das séries se multiplica muito", () => {
    // Lucro a partir de perto de zero e a crescer 100x (caso UBER)
    const big = buildPriceVsEarnings(series(21, i => 100 + i, i => 10 * Math.pow(100, i / 20)), null)
    expect(big.logAvailable).toBe(true)
    expect(big.logSuggested).toBe(true)

    const calm = buildPriceVsEarnings(series(21, i => 100 + i, i => 1_000 + i * 10), null)
    expect(calm.logSuggested).toBe(false)
  })

  it("desativa a escala log quando algum índice não é positivo", () => {
    // Prejuízo depois da base → earningsIdx negativo, log impossível
    const r = buildPriceVsEarnings(series(21, i => 100 + i, i => 1_000 - i * 100), null)
    expect(r.data.some(d => d.earningsIdx < 0)).toBe(true)
    expect(r.logAvailable).toBe(false)
    expect(r.logSuggested).toBe(false)
  })

  it("uma série demasiado curta devolve vazio em vez de explodir", () => {
    expect(buildPriceVsEarnings([], null).data).toEqual([])
    expect(buildPriceVsEarnings(series(1, () => 100, () => 1_000), null).data).toEqual([])
  })
})
