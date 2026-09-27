import { describe, it, expect } from "vitest"
import { calcularCenario, cenariosIniciais, cagr, mediana } from "@/lib/finance/dcfSimples"

describe("DCF simples (retorno esperado, por ação)", () => {
  it("FCF/ação 10, +10%/ano 5 anos, 20x, retorno 10%, preço 150", () => {
    const r = calcularCenario(10, { crescimento: 0.1, multiploSaida: 20 }, 5, 0.1, 150)
    // métrica ano 5 = 10 × 1,1^5 = 16,1051; preço futuro = 322,102
    expect(r.metricaFutura).toBeCloseTo(16.1051, 4)
    expect(r.precoFuturo).toBeCloseTo(322.102, 3)
    // fair value = 322,102 ÷ 1,1^5 = 200 (crescimento = retorno desejado)
    expect(r.fairValue).toBeCloseTo(200, 6)
    expect(r.potencial).toBeCloseTo(200 / 150 - 1, 9)
    // CAGR = (322,102 ÷ 150)^(1/5) − 1
    expect(r.cagrEsperado).toBeCloseTo(Math.pow(322.102 / 150, 0.2) - 1, 9)
    expect(r.margemSeguranca).toBeCloseTo(0.25, 9)
    expect(r.projecao).toHaveLength(5)
  })

  it("métrica negativa ou múltiplo inválido: não se aplica", () => {
    expect(calcularCenario(-2, { crescimento: 0.1, multiploSaida: 20 }, 5, 0.1, 50).valido).toBe(false)
    expect(calcularCenario(2, { crescimento: 0.1, multiploSaida: 0 }, 5, 0.1, 50).valido).toBe(false)
  })

  it("cenários iniciais: consenso primeiro, múltiplo sem passar o atual", () => {
    const c = cenariosIniciais({ crescimentoConsenso: 0.12, crescimentoHistorico: 0.2, multiploMediano: 30, multiploAtual: 25 })
    expect(c.base.crescimento).toBeCloseTo(0.12, 9)
    expect(c.bear.crescimento).toBeCloseTo(0.072, 9)
    expect(c.bull.crescimento).toBeCloseTo(0.168, 9)
    expect(c.base.multiploSaida).toBe(25)
    expect(c.bear.multiploSaida).toBe(20)
    expect(c.bull.multiploSaida).toBe(30)
  })

  it("cenários iniciais: sem consenso usa histórico; limites", () => {
    const c = cenariosIniciais({ crescimentoConsenso: null, crescimentoHistorico: 0.5, multiploMediano: 80, multiploAtual: null })
    expect(c.base.crescimento).toBe(0.25)
    expect(c.base.multiploSaida).toBe(40)
    const baixo = cenariosIniciais({ crescimentoConsenso: 0.01, crescimentoHistorico: null, multiploMediano: null, multiploAtual: null })
    expect(baixo.bear.crescimento).toBe(0)
    expect(baixo.bull.crescimento).toBeCloseTo(0.03, 9)
  })

  it("utilitários", () => {
    expect(cagr(100, 200, 5)).toBeCloseTo(Math.pow(2, 0.2) - 1, 9)
    expect(cagr(-1, 200, 5)).toBeNull()
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
  })
})
