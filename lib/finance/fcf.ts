/**
 * Derivação de Free Cash Flow to Firm (FCFF) a partir dos dados de
 * `fundamentals` — usado para corrigir a inconsistência de metodologia do
 * motor DCF (ver lib/finance/dcf.ts): FCFE (OCF − CapEx, já líquido de juros)
 * descontado à WACC e com net debt subtraído duplica o efeito da dívida.
 *
 * FCFF = OperatingCashFlow + InterestExpense × (1 − taxaEfetiva) − CapEx
 */

/** Assunção de fallback quando a taxa de imposto efetiva não é calculável. */
export const DEFAULT_EFFECTIVE_TAX_RATE = 0.21

/** Intervalo aceitável para a taxa de imposto efetiva derivada dos dados. */
const MIN_TAX_RATE = 0
const MAX_TAX_RATE = 0.6

export interface EffectiveTaxRateResult {
  rate: number
  usedFallback: boolean
}

/**
 * Deriva a taxa de imposto efetiva de operatingIncome/interestExpense/taxExpense.
 * Cai para DEFAULT_EFFECTIVE_TAX_RATE sempre que o cálculo não é fiável
 * (pretax ≤ 0, dados em falta, ou resultado fora de [0, 60%]).
 */
export function deriveEffectiveTaxRate(
  operatingIncome: number | null,
  interestExpense: number | null,
  taxExpense: number | null
): EffectiveTaxRateResult {
  if (operatingIncome == null || interestExpense == null || taxExpense == null) {
    return { rate: DEFAULT_EFFECTIVE_TAX_RATE, usedFallback: true }
  }

  const pretaxIncome = operatingIncome - interestExpense
  if (!(pretaxIncome > 0)) {
    return { rate: DEFAULT_EFFECTIVE_TAX_RATE, usedFallback: true }
  }

  const rate = taxExpense / pretaxIncome
  if (!Number.isFinite(rate) || rate < MIN_TAX_RATE || rate > MAX_TAX_RATE) {
    return { rate: DEFAULT_EFFECTIVE_TAX_RATE, usedFallback: true }
  }

  return { rate, usedFallback: false }
}

export interface FcfSourceRecord {
  fiscalYear: number
  operatingCashFlow: number | null
  capex: number | null
  interestExpense: number | null
  taxExpense: number | null
  operatingIncome: number | null
}

export interface FcffResult {
  fcff: number | null
  effectiveTaxRate: number
  usedFallbackTaxRate: boolean
}

/** Deriva o FCFF de um registo anual. `fcff: null` se OCF/CapEx em falta. */
export function deriveFcff(record: FcfSourceRecord): FcffResult {
  const { rate, usedFallback } = deriveEffectiveTaxRate(
    record.operatingIncome,
    record.interestExpense,
    record.taxExpense
  )

  if (record.operatingCashFlow == null || record.capex == null) {
    return { fcff: null, effectiveTaxRate: rate, usedFallbackTaxRate: usedFallback }
  }

  const interest = record.interestExpense ?? 0
  const fcff = record.operatingCashFlow + interest * (1 - rate) - record.capex

  return { fcff, effectiveTaxRate: rate, usedFallbackTaxRate: usedFallback }
}

export type FcfBaseMode = "LATEST" | "AVG3" | "MEDIAN3"

/**
 * Calcula a base de FCF a partir de uma série (mais recente primeiro).
 * AVG3/MEDIAN3 usam até 3 valores mais recentes; com menos de 3 disponíveis,
 * degrada graciosamente para a média/mediana do que existir.
 */
export function computeBaseFcf(values: number[], mode: FcfBaseMode): number | null {
  if (values.length === 0) return null
  if (mode === "LATEST") return values[0]

  const sample = values.slice(0, 3)

  if (mode === "AVG3") {
    return sample.reduce((sum, v) => sum + v, 0) / sample.length
  }

  // MEDIAN3
  const sorted = [...sample].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
