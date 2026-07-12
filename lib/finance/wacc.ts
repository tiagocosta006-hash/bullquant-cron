/**
 * Cálculo de WACC via CAPM (Capital Asset Pricing Model).
 *
 * CAPM: Re = Rf + β × (Rm − Rf)
 * WACC = (E/V × Re) + (D/V × Rd × (1 − Tc))
 *
 * Valores por defeito (retirados de dados históricos e recomendações de analistas):
 * - Risk-free rate (Rf): 2.5% (yield de T-bonds a 10 anos)
 * - Equity risk premium (Rm − Rf): 5.5% (retorno histórico acima do risk-free)
 */

export const DEFAULT_RISK_FREE_RATE = 0.025 // 2.5%
export const DEFAULT_EQUITY_RISK_PREMIUM = 0.055 // 5.5%
export const DEFAULT_EFFECTIVE_TAX_RATE = 0.21 // 21%

/**
 * Calcula o custo do capital próprio via CAPM.
 * Re = Rf + β × (Rm − Rf)
 */
export function costOfEquity(
  beta: number | null,
  riskFreeRate: number = DEFAULT_RISK_FREE_RATE,
  equityRiskPremium: number = DEFAULT_EQUITY_RISK_PREMIUM
): number | null {
  if (beta == null || !Number.isFinite(beta)) {
    return null
  }
  return riskFreeRate + beta * equityRiskPremium
}

/**
 * Calcula o custo da dívida após tax shield.
 * Rd_after_tax = (InterestExpense / TotalDebt) × (1 − Tc)
 *
 * Retorna null se a empresa não tem dívida ou se faltar dados.
 */
export function costOfDebt(
  interestExpense: number | null,
  totalDebt: number | null,
  effectiveTaxRate: number = DEFAULT_EFFECTIVE_TAX_RATE
): number | null {
  if (interestExpense == null || totalDebt == null || totalDebt <= 0) {
    return null
  }

  // Despesa com juros pode vir negativa da DRE, usamos o valor absoluto.
  const absInterestExpense = Math.abs(interestExpense)
  const costOfDebtPretax = absInterestExpense / totalDebt
  const costOfDebtAfterTax = costOfDebtPretax * (1 - effectiveTaxRate)
  return costOfDebtAfterTax
}

export interface WaccBreakdown {
  riskFreeRate: number
  beta: number | null
  equityRiskPremium: number
  costOfEquity: number | null
  interestExpense: number | null
  totalDebt: number | null
  costOfDebtPretax: number | null
  costOfDebtAfterTax: number | null
  effectiveTaxRate: number
  marketCap: number
  equityValue: number // market cap
  debtValue: number // net debt ou total debt (tipicamente net debt)
  totalValue: number // E + D
  weightEquity: number
  weightDebt: number
  wacc: number
}

/**
 * Calcula WACC completo com breakdown para display.
 *
 * @param opts.beta — sensibilidade ao mercado (vem do Finnhub)
 * @param opts.currentPrice — preço atual (USD)
 * @param opts.shares — ações em circulação (unidades)
 * @param opts.netDebt — dívida líquida (USD)
 * @param opts.interestExpense — despesa com juros anuais (USD)
 * @param opts.totalDebt — dívida total (USD), opcional (calcula-se de netDebt se possível)
 * @param opts.riskFreeRate — taxa sem risco (default 2.5%)
 * @param opts.equityRiskPremium — prémio de risco do mercado (default 5.5%)
 * @param opts.effectiveTaxRate — taxa de imposto efetiva (default 21%)
 */
export function computeWacc(opts: {
  beta: number | null
  currentPrice: number
  shares: number
  netDebt: number
  interestExpense: number | null
  totalDebt?: number | null
  riskFreeRate?: number
  equityRiskPremium?: number
  effectiveTaxRate?: number
}): WaccBreakdown | null {
  const rf = opts.riskFreeRate ?? DEFAULT_RISK_FREE_RATE
  const erp = opts.equityRiskPremium ?? DEFAULT_EQUITY_RISK_PREMIUM
  const tc = opts.effectiveTaxRate ?? DEFAULT_EFFECTIVE_TAX_RATE

  // Market cap = preço × ações
  const marketCap = opts.currentPrice * opts.shares
  if (!(marketCap > 0)) {
    return null
  }

  // Custo do equity via CAPM
  const re = costOfEquity(opts.beta, rf, erp)
  if (re == null) {
    // Se não temos beta, não conseguimos WACC via CAPM
    return null
  }

  // Custo da dívida
  const totalDebt = opts.totalDebt ?? opts.netDebt
  const rd = costOfDebt(opts.interestExpense, totalDebt > 0 ? totalDebt : null, tc)

  // Valores e pesos
  const E = marketCap
  const D = opts.netDebt
  const V = E + D
  const wE = E / V
  const wD = D / V

  // WACC ponderado
  let wacc = wE * re
  if (rd != null) {
    wacc += wD * rd
  }

  return {
    riskFreeRate: rf,
    beta: opts.beta,
    equityRiskPremium: erp,
    costOfEquity: re,
    interestExpense: opts.interestExpense != null ? Math.abs(opts.interestExpense) : null,
    totalDebt: totalDebt > 0 ? totalDebt : null,
    costOfDebtPretax: opts.interestExpense != null && totalDebt > 0 ? Math.abs(opts.interestExpense) / totalDebt : null,
    costOfDebtAfterTax: rd,
    effectiveTaxRate: tc,
    marketCap,
    equityValue: E,
    debtValue: D,
    totalValue: V,
    weightEquity: wE,
    weightDebt: wD,
    wacc,
  }
}
