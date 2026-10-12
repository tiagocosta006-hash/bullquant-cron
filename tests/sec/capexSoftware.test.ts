import { describe, it, expect } from "vitest"
import { extrairSeries, valorAnual, valorTrimestral, decidir, acrescimo, type FatoSec } from "@/lib/sec/capexSoftware"

const M = 1e6
const f = (start: string, end: string, val: number): FatoSec => ({ start, end, val })

describe("capex com software capitalizado (SEC)", () => {
  it("decide pelos números reais da MSCI: 2025 e 2024 só PP&E (somar), 2023 já incluído", () => {
    const receita = (x: number) => x * M
    // 2025: FMP 39,3 = PP&E 39,3; software 90,5
    expect(decidir({ capexFmp: 39.3 * M, ppe: 39.3 * M, software: 90.5 * M, receita: receita(3134) })).toBe("somar")
    // 2024: FMP 33,8 = PP&E 33,8; software 81,4
    expect(decidir({ capexFmp: 33.8 * M, ppe: 33.8 * M, software: 81.4 * M, receita: receita(2856) })).toBe("somar")
    // 2023: FMP 90,9 = 22,8 + 68,1
    expect(decidir({ capexFmp: 90.9 * M, ppe: 22.8 * M, software: 68.1 * M, receita: receita(2529) })).toBe("incluido")
  })

  it("MSCI Q1 2026 já tinha tudo; Q2 2026 só parte: completa-se até ao total da SEC (44,4)", () => {
    const rev = 850 * M
    expect(decidir({ capexFmp: 28.8 * M, ppe: 2.8 * M, software: 26 * M, receita: rev })).toBe("incluido")
    const d = decidir({ capexFmp: 15 * M, ppe: 11 * M, software: 33.4 * M, receita: rev })
    expect(d).toBe("completar")
    expect(acrescimo(d, { capexFmp: 15 * M, ppe: 11 * M, software: 33.4 * M }) / M).toBeCloseTo(29.4, 6)
    expect(acrescimo("somar", { capexFmp: 39.3 * M, ppe: 39.3 * M, software: 90.5 * M })).toBe(90.5 * M)
    expect(acrescimo("incluido", { capexFmp: 1, ppe: 1, software: 1 })).toBe(0)
  })

  it("capex da FMP acima do total da SEC, ou muito abaixo do PP&E: não se toca", () => {
    expect(decidir({ capexFmp: 200 * M, ppe: 100 * M, software: 50 * M, receita: 5000 * M })).toBe("incerto")
    expect(decidir({ capexFmp: 50 * M, ppe: 100 * M, software: 50 * M, receita: 5000 * M })).toBe("incerto")
  })

  it("software imaterial ou sem dados não altera nada; o que não se explica fica como veio", () => {
    expect(decidir({ capexFmp: 1000 * M, ppe: 1000 * M, software: 10 * M, receita: 50_000 * M })).toBe("imaterial")
    expect(decidir({ capexFmp: 100 * M, ppe: null, software: 50 * M, receita: 5000 * M })).toBe("sem_dado")
    expect(decidir({ capexFmp: 100 * M, ppe: 100 * M, software: 0, receita: 5000 * M })).toBe("sem_dado")
    expect(decidir({ capexFmp: 300 * M, ppe: 100 * M, software: 50 * M, receita: 5000 * M })).toBe("incerto")
  })

  it("valor anual: só factos de ~1 ano que acabam perto da data", () => {
    const fatos = [f("2025-01-01", "2025-12-31", 90.5 * M), f("2025-01-01", "2025-09-30", 66 * M), f("2024-01-01", "2024-12-31", 81.4 * M)]
    expect(valorAnual(fatos, "2025-12-31")).toBe(90.5 * M)
    expect(valorAnual(fatos, "2024-12-30")).toBe(81.4 * M)
    expect(valorAnual(fatos, "2023-12-31")).toBeNull()
  })

  it("trimestres do XBRL são acumulados: cada um é a diferença para o anterior; o Q4 vem do ano", () => {
    const fatos = [
      f("2025-01-01", "2025-03-31", 20), f("2025-01-01", "2025-06-30", 44), f("2025-01-01", "2025-09-30", 66), f("2025-01-01", "2025-12-31", 90),
    ]
    expect(valorTrimestral(fatos, "2025-03-31")).toBe(20) // Q1: o próprio
    expect(valorTrimestral(fatos, "2025-06-30")).toBe(24) // 44 − 20
    expect(valorTrimestral(fatos, "2025-09-30")).toBe(22) // 66 − 44
    expect(valorTrimestral(fatos, "2025-12-31")).toBe(24) // 90 − 66 (Q4)
    // os quatro trimestres somam o ano
    expect(20 + 24 + 22 + 24).toBe(90)
  })

  it("quando a empresa dá o trimestre isolado (3 meses) usa-o; sem o acumulado anterior não inventa", () => {
    expect(valorTrimestral([f("2025-04-01", "2025-06-30", 24)], "2025-06-30")).toBe(24)
    expect(valorTrimestral([f("2025-01-01", "2025-06-30", 44)], "2025-06-30")).toBeNull()
  })

  it("extrai do companyfacts: PP&E pela primeira etiqueta, software somando linhas distintas, ignora formulários que não são 10-K/10-Q", () => {
    const cf = {
      facts: { "us-gaap": {
        PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
          { start: "2025-01-01", end: "2025-12-31", val: 39.3 * M, form: "10-K" },
          { start: "2025-01-01", end: "2025-12-31", val: 39.3 * M, form: "10-K/A" }, // repetido: uma só entrada
        ] } },
        PaymentsForSoftware: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 60 * M, form: "10-K" }] } },
        PaymentsToDevelopSoftware: { units: { USD: [{ start: "2025-01-01", end: "2025-12-31", val: 30.5 * M, form: "10-K" }, { start: "2025-01-01", end: "2025-12-31", val: 999, form: "8-K" }] } },
      } },
    }
    const s = extrairSeries(cf)
    expect(s.ppe).toHaveLength(1)
    expect(s.ppe[0].val).toBe(39.3 * M)
    expect(valorAnual(s.software, "2025-12-31")).toBeCloseTo(90.5 * M, 0)
  })
})
