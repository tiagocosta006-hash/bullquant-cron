import { describe, it, expect } from "vitest"
import { homologa } from "@/lib/finance/seriesMacro"

describe("séries macro — variação homóloga", () => {
  it("compara com o mesmo mês do ano anterior", () => {
    const r = homologa([
      { date: "2025-08-01", value: 323.291 },
      { date: "2026-08-01", value: 334.131 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].value).toBeCloseTo(3.353, 2)
  })

  it("um mês em falta na série (CPI de outubro de 2025) não desloca a comparação", () => {
    // Jul/25, Ago/25, Set/25, (Out/25 em falta), Nov/25 … Jul/26, Ago/26
    const meses = ["2025-07", "2025-08", "2025-09", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]
    const valores = [322.169, 323.291, 324.245, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334.131]
    const r = homologa(meses.map((m, i) => ({ date: `${m}-01`, value: valores[i] })))
    // Só Jul/26 e Ago/26 têm o ponto de há um ano
    expect(r.map((p) => p.date)).toEqual(["2026-07-01", "2026-08-01"])
    expect(r[1].value).toBeCloseTo((334.131 / 323.291 - 1) * 100, 6)
  })

  it("sem ponto de há um ano não inventa variação", () => {
    expect(homologa([{ date: "2026-08-01", value: 334 }])).toEqual([])
  })
})
