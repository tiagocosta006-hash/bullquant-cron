import { describe, it, expect } from "vitest"
import {
  raciosFin, pressupostosFinIniciais, projetarFin, avaliarFin, grelhaKeRoe, keDe,
  type AnoFin, type PressupostosFin,
} from "@/lib/finance/modelo"

// Capital 1000, ROE 15% constante, payout 50%, Ke 9% (rf 4% + β 1 × 5%), g 2%, 2 anos, 100 ações.
const p: PressupostosFin = { anos: 2, roeInicial: 0.15, roeFinal: 0.15, payout: 0.5, rf: 0.04, erp: 0.05, beta: 1, g: 0.02 }
const mercado = { preco: 15, acoes: 100, capitalProprio: 1000 }

describe("financeiras — retorno em excesso", () => {
  const proj = projetarFin(1000, p)

  it("projeção: lucro 150 e 161,25; capital 1075 e 1155,625; excesso 60 e 64,5", () => {
    expect(proj[0].lucro).toBeCloseTo(150, 6)
    expect(proj[0].capitalFim).toBeCloseTo(1075, 6)
    expect(proj[0].retornoExcesso).toBeCloseTo(60, 6)
    expect(proj[1].lucro).toBeCloseTo(161.25, 6)
    expect(proj[1].capitalFim).toBeCloseTo(1155.625, 6)
    expect(proj[1].retornoExcesso).toBeCloseTo(64.5, 6)
  })

  it("avaliação: VP do excesso 109,334; terminal 990,536 (VP 833,714); valor 1943,048 → 19,43 por ação", () => {
    const a = avaliarFin(proj, p, mercado)
    expect(a.valido).toBe(true)
    expect(a.ke).toBeCloseTo(0.09, 10)
    expect(a.somaVp).toBeCloseTo(109.3342, 3)
    expect(a.valorTerminal).toBeCloseTo(990.5357, 3)
    expect(a.vpTerminal).toBeCloseTo(833.7141, 3)
    expect(a.valorCapital).toBeCloseTo(1943.0483, 3)
    expect(a.valorPorAcao).toBeCloseTo(19.4305, 3)
    expect(a.pbImplicito).toBeCloseTo(1.9430, 3)
    expect(a.peImplicito).toBeCloseTo(12.9537, 3)
    expect(a.potencial).toBeCloseTo(19.4305 / 15 - 1, 4)
    // 15% × (1 − 50%) = 7,5% de crescimento financiado
    expect(a.crescimentoSustentavel).toBeCloseTo(0.075, 10)
  })

  it("ROE igual ao Ke: não cria valor, o capital vale o capital próprio", () => {
    const q = { ...p, roeInicial: 0.09, roeFinal: 0.09 }
    const a = avaliarFin(projetarFin(1000, q), q, mercado)
    expect(a.valorCapital).toBeCloseTo(1000, 6)
    expect(a.pbImplicito).toBeCloseTo(1, 6)
  })

  it("ROE abaixo do Ke destrói valor: vale menos que o capital próprio", () => {
    const q = { ...p, roeInicial: 0.06, roeFinal: 0.06 }
    expect(avaliarFin(projetarFin(1000, q), q, mercado).valorCapital).toBeLessThan(1000)
  })

  it("ROE desce em linha reta do ano 1 ao último", () => {
    const q = { ...p, anos: 5, roeInicial: 0.2, roeFinal: 0.12 }
    expect(projetarFin(1000, q).map((x) => x.roe)).toEqual([0.2, 0.18, 0.16, 0.14, 0.12].map((v) => expect.closeTo(v, 10)))
  })

  it("Ke ≤ g, sem ações e sem capital são inválidos", () => {
    expect(avaliarFin(proj, { ...p, g: 0.09 }, mercado).erro).toBe("KE_MENOR_QUE_G")
    expect(avaliarFin(proj, p, { ...mercado, acoes: 0 }).erro).toBe("SEM_ACOES")
    expect(avaliarFin(proj, p, { ...mercado, capitalProprio: 0 }).erro).toBe("SEM_DADOS")
  })

  it("grelha Ke × ROE: o centro é o valor do modelo; mais Ke vale menos, mais ROE vale mais", () => {
    const g = grelhaKeRoe(mercado, p)
    expect(g.valores[2][2]).toBeCloseTo(19.4305, 3)
    expect(g.valores[3][2]!).toBeLessThan(g.valores[2][2]!)
    expect(g.valores[2][3]!).toBeGreaterThan(g.valores[2][2]!)
    expect(g.ke[2]).toBeCloseTo(keDe(p), 10)
  })
})

describe("financeiras — histórico e pressupostos iniciais", () => {
  const h = (fy: number, ni: number, eq: number, div: number, rec: number): AnoFin => ({
    fiscalYear: fy, periodEnd: `${fy}-12-31`, netIncome: ni, totalEquity: eq, dividendos: div, recompras: rec,
  })
  const hist = [h(2022, 90, 1000, 30, 20), h(2023, 100, 1050, 30, 30), h(2024, 120, 1100, 40, 40), h(2025, 130, 1200, 50, 40)]

  it("ROE sobre o capital do início do ano e payout sobre o lucro", () => {
    const r = raciosFin(hist)
    expect(r[0].roe).toBeNull() // sem ano anterior
    expect(r[1].roe).toBeCloseTo(100 / 1000, 10)
    expect(r[3].roe).toBeCloseTo(130 / 1100, 10)
    expect(r[3].payout).toBeCloseTo(90 / 130, 10)
  })

  it("dividendos e recompras com sinal negativo contam como valor absoluto", () => {
    const r = raciosFin([h(2024, 100, 1000, -30, -20), h(2025, 100, 1000, -30, -20)])
    expect(r[1].payout).toBeCloseTo(0.5, 10)
  })

  it("iniciais: ROE e payout são a mediana de 3 anos; ROE final mantém metade do excesso; g não passa do sustentável", () => {
    const ini = pressupostosFinIniciais(hist, { rf: 0.04, beta: 1 })
    // ROE (2023, 2024, 2025) = 0,1; 0,1143; 0,1182 → mediana 0,1143
    expect(ini.roeInicial).toBeCloseTo(120 / 1050, 6)
    const ke = keDe(ini)
    expect(ini.roeFinal).toBeCloseTo(ke + (ini.roeInicial - ke) / 2, 10)
    expect(ini.g).toBeLessThanOrEqual(ini.roeFinal * (1 - ini.payout) + 1e-12)
    expect(ini.g).toBeLessThanOrEqual(0.025)
  })

  it("sem histórico usa valores neutros em vez de rebentar", () => {
    const ini = pressupostosFinIniciais([], { rf: null, beta: null })
    expect(Number.isFinite(ini.roeInicial) && Number.isFinite(ini.payout) && Number.isFinite(ini.g)).toBe(true)
  })
})
