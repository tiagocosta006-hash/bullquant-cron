import { describe, it, expect } from "vitest"
import { modeloFcffAplicavel } from "@/lib/finance/modelo/aplicabilidade"
import {
  projetar, avaliar, grelhaWaccG, grelhaWaccMultiplo, grelhaCrescimentoMargem, valorComAjuste, aplicarAjuste, cenariosIniciais, mudarHorizonteCenarios, valorEsperado, racios, resumo, fracaoAno1, pressupostosIniciais, segmentosIniciais, mudarHorizonte, interpolar,
  type AnoHistorico, type Pressupostos,
} from "@/lib/finance/modelo"

// Último ano real: receita 1000, custo das vendas 600, clientes 100,
// inventário 50, fornecedores 80 → fundo de maneio 70.
const base: AnoHistorico = {
  fiscalYear: 2025, periodEnd: "2025-12-31", revenue: 1000, costOfRevenue: 600, grossProfit: 400,
  operatingExpenses: 200, operatingIncome: 200, ebitda: 250, depreciationAndAmortization: 50, capex: 60,
  accountsReceivable: 100, inventory: 50, accountsPayable: 80, taxExpense: 50, incomeBeforeTax: 200,
  stockBasedCompensation: null, operatingCashFlow: 230, freeCashFlow: 170,
}

const p: Pressupostos = {
  anos: 2,
  drivers: {
    crescimentoReceita: [0.1, 0.1], margemBruta: [0.4, 0.4], margemEbit: [0.2, 0.2],
    daPctReceita: [0.05, 0.05], capexPctReceita: [0.06, 0.06],
    dso: [36.5, 36.5], dio: [(50 / 600) * 365, (50 / 600) * 365], dpo: [(80 / 600) * 365, (80 / 600) * 365],
    taxaImposto: [0.25, 0.25],
  },
  avaliacao: {
    rf: 0.04, erp: 0.05, beta: 1, custoDivida: 0.05, taxaImpostoWacc: 0.25, waccManual: 0.1,
    g: 0.02, multiploSaida: 10, metodoTerminal: "gordon", meioDoAno: false,
  },
}
const mercado = { preco: 15, acoes: 100, dividaTotal: 200, caixa: 50, interessesMinoritarios: 10 }

describe("modelo DCF — projeções (schedules → FCFF)", () => {
  const proj = projetar(base, p)

  it("ano 1: receita 1100, EBIT 220, NOPAT 165, Δ fundo de maneio 7, FCFF 147", () => {
    const a = proj[0]
    expect(a.fiscalYear).toBe(2026)
    expect(a.receita).toBeCloseTo(1100, 6)
    expect(a.cogs).toBeCloseTo(660, 6)
    expect(a.ebit).toBeCloseTo(220, 6)
    expect(a.ebitda).toBeCloseTo(275, 6)
    expect(a.nopat).toBeCloseTo(165, 6)
    // clientes 110 + inventário 55 − fornecedores 88 = 77; 77 − 70 = 7
    expect(a.fundoManeio).toBeCloseTo(77, 6)
    expect(a.variacaoFundoManeio).toBeCloseTo(7, 6)
    expect(a.fcff).toBeCloseTo(147, 6)
  })

  it("ano 2: FCFF 161,7", () => {
    expect(proj[1].receita).toBeCloseTo(1210, 6)
    expect(proj[1].fcff).toBeCloseTo(161.7, 6)
  })

  it("EBIT negativo não gera imposto negativo", () => {
    const perda = projetar(base, { ...p, drivers: { ...p.drivers, margemEbit: [-0.1, -0.1] } })
    expect(perda[0].impostosOperacionais).toBe(0)
    expect(perda[0].nopat).toBeCloseTo(-110, 6)
  })
})

describe("modelo DCF — avaliação", () => {
  const proj = projetar(base, p)

  it("sem meio do ano nem período parcial: EV 1971,13 e 18,11 por ação", () => {
    const { avaliacao: a } = avaliar(proj, p.avaliacao, mercado, 1)
    // VP: 147/1,1 + 161,7/1,21 = 267,27; TV = 161,7 × 1,02 / 0,08 = 2061,68; VP(TV) = 1703,86
    expect(a.somaVpFcff).toBeCloseTo(267.2727, 3)
    expect(a.terminalGordon).toBeCloseTo(2061.675, 3)
    expect(a.enterpriseValue).toBeCloseTo(1971.13, 1)
    // EV − dívida 200 + caixa 50 − minoritários 10 = 1811,13 → ÷ 100 ações
    expect(a.valorPorAcao).toBeCloseTo(18.1113, 3)
    expect(a.potencial).toBeCloseTo(18.1113 / 15 - 1, 4)
  })

  it("período parcial e meio do ano: só um quarto do ano 1 conta, descontado a 0,125 anos", () => {
    const { projecoes } = avaliar(proj, { ...p.avaliacao, meioDoAno: true }, mercado, 0.25)
    expect(projecoes[0].fracao).toBe(0.25)
    expect(projecoes[0].periodoDesconto).toBeCloseTo(0.125, 9)
    expect(projecoes[1].periodoDesconto).toBeCloseTo(0.75, 9)
    expect(projecoes[0].valorPresente).toBeCloseTo((147 * 0.25) / Math.pow(1.1, 0.125), 6)
  })

  it("verificações cruzadas: o múltiplo implícito no Gordon devolve o mesmo g", () => {
    const { avaliacao: a } = avaliar(proj, p.avaliacao, mercado, 1)
    const multiplo = a.multiploImplicitoNoGordon!
    const { avaliacao: b } = avaliar(proj, { ...p.avaliacao, multiploSaida: multiplo }, mercado, 1)
    expect(b.gImplicitoNoMultiplo!).toBeCloseTo(0.02, 9)
  })

  it("WACC ≤ g com Gordon é inválido; com múltiplo de saída continua válido", () => {
    const mau = { ...p.avaliacao, waccManual: 0.02 }
    expect(avaliar(proj, mau, mercado, 1).avaliacao.erro).toBe("WACC_MENOR_QUE_G")
    expect(avaliar(proj, { ...mau, metodoTerminal: "multiplo" }, mercado, 1).avaliacao.valido).toBe(true)
  })

  it("WACC por CAPM com pesos de mercado", () => {
    const { avaliacao: a } = avaliar(proj, { ...p.avaliacao, waccManual: null }, mercado, 1)
    // Re = 4% + 1 × 5% = 9%; Rd = 5% × 0,75 = 3,75%; E = 1500, D = 200
    expect(a.wacc.wacc).toBeCloseTo((1500 / 1700) * 0.09 + (200 / 1700) * 0.0375, 9)
  })
})

describe("modelo DCF — histórico e pressupostos iniciais", () => {
  const hist: AnoHistorico[] = [
    { ...base, fiscalYear: 2023, revenue: 800, costOfRevenue: 480, grossProfit: 320, operatingIncome: 150, capex: 48 },
    { ...base, fiscalYear: 2024, revenue: 900, costOfRevenue: 540, grossProfit: 360, operatingIncome: 175, capex: 54 },
    base,
  ]
  const rs = racios(hist)

  it("rácios: crescimento, margens, dias", () => {
    expect(rs[0].crescimentoReceita).toBeNull()
    expect(rs[1].crescimentoReceita).toBeCloseTo(0.125, 9)
    expect(rs[2].margemEbit).toBeCloseTo(0.2, 9)
    expect(rs[2].dso).toBeCloseTo(36.5, 9)
    expect(resumo(rs, "margemBruta", 3).media).toBeCloseTo(0.4, 9)
  })

  it("com consenso: anos 1-2 seguem o consenso, depois desce até g + 1,5 pp", () => {
    const ini = pressupostosIniciais(hist, rs, [
      { fiscalYear: 2026, revenueAvg: 1150, ebitAvg: 253, analistas: 10 },
      { fiscalYear: 2027, revenueAvg: 1265, ebitAvg: 290.95, analistas: 8 },
    ], { rf: 0.045, beta: 1.2, custoDivida: 0.05, evEbitdaAtual: 14 }, 5)
    expect(ini.drivers.crescimentoReceita[0]).toBeCloseTo(0.15, 9)
    expect(ini.drivers.crescimentoReceita[1]).toBeCloseTo(0.1, 9)
    expect(ini.drivers.crescimentoReceita[4]).toBeCloseTo(0.04, 9)
    expect(ini.drivers.margemEbit[0]).toBeCloseTo(0.22, 9)
    expect(ini.drivers.margemEbit[4]).toBeCloseTo(0.23, 9)
    expect(ini.avaliacao.rf).toBe(0.045)
    expect(ini.avaliacao.beta).toBeCloseTo(0.67 * 1.2 + 0.33, 2)
    expect(ini.avaliacao.multiploSaida).toBe(14)
  })

  it("horizonte e interpolação preservam o que já foi escrito", () => {
    const ini = pressupostosIniciais(hist, rs, [], { rf: null, beta: null, custoDivida: null, evEbitdaAtual: null }, 5)
    expect(pressupostosIniciais(hist, rs, [], { rf: null, beta: null, custoDivida: null, evEbitdaAtual: null }).anos).toBe(10)
    const dez = mudarHorizonte(ini, 10)
    expect(dez.drivers.margemEbit).toHaveLength(10)
    expect(dez.drivers.margemEbit[0]).toBe(ini.drivers.margemEbit[0])
    expect(interpolar([0.2, 0.2, 0.2, 0.2], 1, 0.26)).toEqual([0.2, 0.2, 0.23, 0.26])
  })

  it("margem do consenso limitada ao histórico ± 5 pp", () => {
    const ini = pressupostosIniciais(hist, rs, [{ fiscalYear: 2026, revenueAvg: 1100, ebitAvg: 440, analistas: 5 }],
      { rf: null, beta: null, custoDivida: null, evEbitdaAtual: null })
    // histórico: 18,75%, 19,4%, 20% → máximo 20% + 5 pp = 25%, não 40%
    expect(ini.drivers.margemEbit[0]).toBeCloseTo(0.25, 9)
  })

  it("desconto a partir de hoje quando o balanço é anterior (d0 ≠ f)", () => {
    const proj = projetar(base, p)
    const { projecoes } = avaliar(proj, { ...p.avaliacao, meioDoAno: false }, mercado, 0.5, 0.25)
    expect(projecoes[0].fracao).toBe(0.5)
    expect(projecoes[0].periodoDesconto).toBeCloseTo(0.25, 9)
    expect(projecoes[1].periodoDesconto).toBeCloseTo(1.25, 9)
  })

  it("fração do ano 1: último ano fechado há 9 meses → falta 1/4", () => {
    const f = fracaoAno1("2025-12-31", new Date("2026-10-01T00:00:00Z"))
    expect(f).toBeGreaterThan(0.24)
    expect(f).toBeLessThan(0.26)
  })
})

describe("modelo DCF — a que empresas se aplica", () => {
  it("financeiras de balanço ficam de fora; negócios leves do setor entram", () => {
    expect(modeloFcffAplicavel("Financials", "Diversified Banks", "JPM")).toBe(false)
    expect(modeloFcffAplicavel("Financials", "Property & Casualty Insurance", "PGR")).toBe(false)
    expect(modeloFcffAplicavel("Financials", "Investment Banking & Brokerage", "IBKR")).toBe(false)
    expect(modeloFcffAplicavel("Financials", "Asset Management & Custody Banks", "BNY")).toBe(false)
    expect(modeloFcffAplicavel("Financials", null, "HSBC")).toBe(false)
    expect(modeloFcffAplicavel("Financials", "Financial Exchanges & Data", "MSCI")).toBe(true)
    expect(modeloFcffAplicavel("Financials", "Transaction & Payment Processing Services", "V")).toBe(true)
    expect(modeloFcffAplicavel("Financials", "Insurance Brokers", "AON")).toBe(true)
    expect(modeloFcffAplicavel("Financials", "Asset Management & Custody Banks", "BLK")).toBe(true)
    expect(modeloFcffAplicavel("Information Technology", "Software", "MSFT")).toBe(true)
  })
})

describe("modelo DCF — Revenue Build por segmento", () => {
  // Dois segmentos: A cresceu 20%/ano (100 → 172,8 em 3 anos), B 0% (200 → 200).
  const h = (fy: number, a: number, b: number): AnoHistorico => ({
    ...base, fiscalYear: fy, revenue: a + b + 10, segmentos: { product: { A: a, B: b } },
  })
  const hist = [h(2022, 100, 200), h(2023, 120, 200), h(2024, 144, 200), h(2025, 172.8, 200)]

  it("calibrado ao crescimento total do ano 1 e converge para o destino", () => {
    const rs = segmentosIniciais(hist, [0.1, 0.07, 0.04])!
    expect(rs.eixo).toBe("product")
    expect(rs.outros).toBeCloseTo(10, 9)
    const [A, B] = rs.segmentos
    // média ponderada dos CAGR: (172,8×20% + 200×0%)/372,8 = 9,27%; ajuste = 10% − 9,27%
    const media = (172.8 * 0.2) / 372.8
    expect(A.crescimento[0]).toBeCloseTo(0.2 + (0.1 - media), 9)
    expect(B.crescimento[0]).toBeCloseTo(0 + (0.1 - media), 9)
    expect(A.crescimento[2]).toBeCloseTo(0.04, 9)
    // soma ponderada dos crescimentos do ano 1 = crescimento total
    expect((172.8 * A.crescimento[0] + 200 * B.crescimento[0]) / 372.8).toBeCloseTo(0.1, 9)
  })

  it("no modo por segmento a receita é a soma dos segmentos mais a reconciliação", () => {
    const rs = segmentosIniciais(hist, [0.1, 0.1])!
    const ult = hist[hist.length - 1]
    const pp = { ...p, anos: 2, modoReceita: "segmentos" as const, receitaSegmentos: rs }
    const proj = projetar(ult, pp)
    const a1 = 172.8 * (1 + rs.segmentos[0].crescimento[0])
    const b1 = 200 * (1 + rs.segmentos[1].crescimento[0])
    expect(proj[0].segmentos!.A).toBeCloseTo(a1, 9)
    expect(proj[0].receita).toBeCloseTo(a1 + b1 + 10 * ((a1 + b1) / 372.8), 9)
    // calibrado: o total cresce ~10% como no modo total
    expect(proj[0].receita / ult.revenue! - 1).toBeCloseTo(0.1, 6)
  })

  it("sem segmentos (ou só um) não há Revenue Build por segmento", () => {
    expect(segmentosIniciais([{ ...base, segmentos: { product: { Único: 1000 } } }], [0.1])).toBeNull()
    expect(segmentosIniciais([base], [0.1])).toBeNull()
  })
})

describe("modelo DCF — sensibilidade e cenários", () => {
  const ctx = { base, pressupostos: p, mercado, f: 1, d0: 1 }

  it("o centro das grelhas é o valor do modelo (18,11)", () => {
    const g = grelhaWaccG(ctx)
    expect(g.valores[2][2]).toBeCloseTo(18.1113, 3)
    expect(grelhaCrescimentoMargem(ctx).valores[2][2]).toBeCloseTo(18.1113, 3)
  })

  it("WACC 11%, g 2%: 15,91 por ação (à mão: EV 1751,07 − dívida líquida 160)", () => {
    expect(valorComAjuste(ctx, { wacc: 0.01 })).toBeCloseTo(15.911, 2)
  })

  it("mais WACC vale menos, mais g vale mais", () => {
    const g = grelhaWaccG(ctx)
    expect(g.valores[3][2]!).toBeLessThan(g.valores[2][2]!)
    expect(g.valores[2][3]!).toBeGreaterThan(g.valores[2][2]!)
  })

  it("WACC ≤ g dá célula vazia (null), não um valor absurdo", () => {
    expect(valorComAjuste(ctx, { wacc: -0.09, g: 0.02 })).toBeNull()
  })

  it("margem EBIT +2 pp em todos os anos: ano 1 passa de 220 para 242 de EBIT", () => {
    const aj = aplicarAjuste(p, { margemEbit: 0.02 }, 0.1)
    expect(projetar(base, aj)[0].ebit).toBeCloseTo(242, 6)
    expect(valorComAjuste(ctx, { margemEbit: 0.02 })!).toBeGreaterThan(18.1113)
  })



  it("WACC × exit multiple: o centro é o modelo com exit multiple, e mais múltiplo vale mais", () => {
    const pm = { ...p, avaliacao: { ...p.avaliacao, metodoTerminal: "multiplo" as const } }
    const cm = { ...ctx, pressupostos: pm }
    const proj = projetar(base, pm)
    const centro = avaliar(proj, pm.avaliacao, mercado, 1, 1).avaliacao.valorPorAcao
    const g = grelhaWaccMultiplo(cm)
    expect(g.valores[2][2]).toBeCloseTo(centro, 6)
    expect(g.valores[2][3]!).toBeGreaterThan(g.valores[2][2]!)
    expect(g.valores[3][2]!).toBeLessThan(g.valores[2][2]!)
    // Com exit multiple, o g não mexe no valor: era por isso que a WACC × g não servia.
    expect(valorComAjuste(cm, { g: 0.04 })).toBeCloseTo(centro, 6)
  })
})

describe("modelo DCF — cenários Bear/Base/Bull (conjuntos completos)", () => {
  const ctx = { base, pressupostos: p, mercado, f: 1, d0: 1 }

  it("o Base é o modelo do analista; o Bear e o Bull partem dele com ±3 pp, ±2x e ±0,5 pp no g", () => {
    const c = cenariosIniciais(p)
    expect(c.ativo).toBe("base")
    expect(c.cenarios.base).toBe(p)
    expect(c.cenarios.bear.drivers.crescimentoReceita[0]).toBeCloseTo(p.drivers.crescimentoReceita[0] - 0.03, 9)
    expect(c.cenarios.bull.drivers.margemEbit[0]).toBeCloseTo(p.drivers.margemEbit[0] + 0.03, 9)
    expect(c.cenarios.bear.avaliacao.multiploSaida).toBeCloseTo(p.avaliacao.multiploSaida - 2, 9)
    expect(c.cenarios.bull.avaliacao.g).toBeCloseTo(p.avaliacao.g + 0.005, 9)
    // A WACC não muda: continua calculada (não passa a manual).
    expect(c.cenarios.bear.avaliacao.waccManual).toBe(p.avaliacao.waccManual)
  })

  it("cada cenário vale o modelo inteiro com os seus pressupostos: Bear < Base < Bull", () => {
    const c = cenariosIniciais(p)
    const v = (q: typeof p) => valorComAjuste({ ...ctx, pressupostos: q })!
    expect(v(c.cenarios.base)).toBeCloseTo(18.1113, 3)
    expect(v(c.cenarios.bear)).toBeLessThan(v(c.cenarios.base))
    expect(v(c.cenarios.bull)).toBeGreaterThan(v(c.cenarios.base))
  })

  it("um cenário editado é independente dos outros", () => {
    const c = cenariosIniciais(p)
    const bear = { ...c.cenarios.bear, drivers: { ...c.cenarios.bear.drivers, margemEbit: c.cenarios.bear.drivers.margemEbit.map(() => 0.05) } }
    const c2 = { ...c, cenarios: { ...c.cenarios, bear } }
    expect(c2.cenarios.base.drivers.margemEbit[0]).toBe(p.drivers.margemEbit[0])
    expect(c2.cenarios.bear.drivers.margemEbit[0]).toBe(0.05)
  })

  it("o horizonte muda nos três cenários", () => {
    const c = mudarHorizonteCenarios(cenariosIniciais(p), 7)
    for (const n of ["bear", "base", "bull"] as const) {
      expect(c.cenarios[n].anos).toBe(7)
      expect(c.cenarios[n].drivers.crescimentoReceita).toHaveLength(7)
    }
  })

  it("valor esperado: média ponderada, normalizada se as probabilidades não somam 100%", () => {
    expect(valorEsperado({ bear: 10, base: 20, bull: 40 }, { bear: 0.25, base: 0.5, bull: 0.25 })).toBeCloseTo(22.5, 9)
    expect(valorEsperado({ bear: 10, base: 20, bull: 40 }, { bear: 0, base: 0.3, bull: 0.3 })).toBeCloseTo(30, 9)
    expect(valorEsperado({ bear: null, base: 20, bull: 40 }, { bear: 0.5, base: 0.25, bull: 0.25 })).toBeCloseTo(30, 9)
    expect(valorEsperado({ bear: null, base: null, bull: null }, { bear: 1, base: 1, bull: 1 })).toBeNull()
  })
})
