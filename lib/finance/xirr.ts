/**
 * XIRR — retorno anualizado ponderado pelo momento de cada entrada de dinheiro.
 * JS puro, sem dependências de UI nem de rede (CLAUDE.md §7).
 *
 * Ao contrário do retorno total (`aggregatePnl` em portfolio.ts), o XIRR sabe
 * *quando* cada euro entrou. Quem depositou 1000€ há 2 anos e 1000€ há 1 mês
 * não teve o mesmo retorno anual de quem depositou 2000€ há 2 anos, mesmo que
 * o valor final seja igual.
 *
 * Resolve a taxa r que anula o valor presente dos cash flows:
 *
 *   Σ  amount_i / (1 + r)^(dias_i / 365)  =  0
 *
 * Convenção de sinais (ótica do investidor):
 *   negativo = dinheiro que saiu do bolso  (depósitos)
 *   positivo = dinheiro que voltou         (levantamentos + valor atual)
 *
 * Devolve sempre `null` — nunca NaN/Infinity — quando não há solução, seguindo
 * a mesma semântica de `calculateCagr`.
 */

/** Um movimento externo de dinheiro. `date` é o dia em que ocorreu. */
export type CashFlow = {
  date: Date
  amount: number
}

const DAYS_PER_YEAR = 365
const MS_PER_DAY = 86_400_000

/** Taxa mínima admissível: −99.99%. Abaixo de −100% a potência não é definida. */
const MIN_RATE = -0.9999
/** Teto de 100 000%/ano — muito acima de qualquer retorno real; só limita a bisseção. */
const MAX_RATE = 1000

function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY / DAYS_PER_YEAR
}

/** Valor presente líquido dos cash flows a uma dada taxa. */
function npv(rate: number, years: number[], amounts: number[]): number {
  let total = 0
  for (let i = 0; i < amounts.length; i++) {
    total += amounts[i] / Math.pow(1 + rate, years[i])
  }
  return total
}

/** Derivada do NPV em ordem à taxa — usada pelo Newton-Raphson. */
function npvDerivative(rate: number, years: number[], amounts: number[]): number {
  let total = 0
  for (let i = 0; i < amounts.length; i++) {
    total -= (years[i] * amounts[i]) / Math.pow(1 + rate, years[i] + 1)
  }
  return total
}

/**
 * Calcula o XIRR de uma lista de cash flows.
 *
 * Devolve `null` quando o cálculo não faz sentido:
 *  - menos de 2 cash flows
 *  - todos os fluxos com o mesmo sinal (sem raiz: ou só se investe, ou só se recebe)
 *  - todos no mesmo dia (não há período para anualizar)
 *  - datas inválidas ou valores não-finitos
 *  - o método não converge
 *
 * O valor devolvido é decimal (0.3312 = 33.12%), coerente com o resto de
 * `lib/finance/` — a formatação para % é responsabilidade do frontend.
 */
export function calculateXirr(cashFlows: CashFlow[]): number | null {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null

  for (const flow of cashFlows) {
    if (!(flow?.date instanceof Date) || Number.isNaN(flow.date.getTime())) return null
    if (!Number.isFinite(flow.amount)) return null
  }

  const hasNegative = cashFlows.some(f => f.amount < 0)
  const hasPositive = cashFlows.some(f => f.amount > 0)
  if (!hasNegative || !hasPositive) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const start = sorted[0].date
  const end = sorted[sorted.length - 1].date
  if (end.getTime() === start.getTime()) return null

  const years = sorted.map(f => yearsBetween(start, f.date))
  const amounts = sorted.map(f => f.amount)

  const viaNewton = solveNewton(years, amounts)
  if (viaNewton !== null) return viaNewton
  return solveBisection(years, amounts)
}

/**
 * Newton-Raphson: rápido (poucas iterações) mas pode divergir se o palpite
 * inicial cair numa zona plana da curva. Por isso há sempre a bisseção atrás.
 */
function solveNewton(years: number[], amounts: number[]): number | null {
  // 0.1 é um palpite neutro; retornos reais de portfólio andam perto disto.
  let rate = 0.1

  for (let i = 0; i < 100; i++) {
    const value = npv(rate, years, amounts)
    if (!Number.isFinite(value)) return null
    if (Math.abs(value) < 1e-9) return Number.isFinite(rate) ? rate : null

    const slope = npvDerivative(rate, years, amounts)
    if (!Number.isFinite(slope) || Math.abs(slope) < 1e-12) return null

    const next = rate - value / slope
    if (!Number.isFinite(next) || next <= MIN_RATE) return null
    if (Math.abs(next - rate) < 1e-10) {
      return Math.abs(npv(next, years, amounts)) < 1e-6 ? next : null
    }
    rate = next
  }
  return null
}

/**
 * Bisseção: mais lenta mas garantida a convergir desde que haja mudança de
 * sinal no intervalo. É o que apanha os casos em que o Newton diverge.
 */
function solveBisection(years: number[], amounts: number[]): number | null {
  let low = MIN_RATE
  let high = MAX_RATE
  let valueLow = npv(low, years, amounts)
  let valueHigh = npv(high, years, amounts)

  if (!Number.isFinite(valueLow) || !Number.isFinite(valueHigh)) return null
  // Sem mudança de sinal nos extremos não há raiz dentro do intervalo.
  if (valueLow * valueHigh > 0) return null

  for (let i = 0; i < 400; i++) {
    const mid = (low + high) / 2
    const valueMid = npv(mid, years, amounts)
    if (!Number.isFinite(valueMid)) return null
    if (Math.abs(valueMid) < 1e-9 || high - low < 1e-12) return mid

    if (valueLow * valueMid < 0) {
      high = mid
      valueHigh = valueMid
    } else {
      low = mid
      valueLow = valueMid
    }
  }
  const result = (low + high) / 2
  return Number.isFinite(result) ? result : null
}

// ── Construção dos cash flows a partir de movimentos de corretora ──────────

/**
 * Tipos de movimento da Trading212 que representam dinheiro a entrar ou sair
 * DA CONTA (fluxos externos). Ver enum `type` em
 * GET /api/v0/equity/history/transactions.
 *
 * FEE, INTEREST_ON_FREE_CASH e LENDING_INTEREST são movimentos *internos*:
 * já estão refletidos no valor atual da conta. Incluí-los contá-los-ia a
 * dobrar e inflacionaria o retorno.
 */
export const EXTERNAL_CASH_FLOW_TYPES = ["DEPOSIT", "WITHDRAW", "TRANSFER"] as const
export const INTERNAL_CASH_FLOW_TYPES = ["FEE", "INTEREST_ON_FREE_CASH", "LENDING_INTEREST"] as const

export type BrokerMovement = {
  type: string
  amount: number
  date: Date
}

export function isExternalCashFlow(type: string): boolean {
  return (EXTERNAL_CASH_FLOW_TYPES as readonly string[]).includes(type)
}

export type PortfolioReturn = {
  /** Decimal (0.3312 = 33.12%). `null` se não houver solução. */
  xirr: number | null
  /** Soma dos depósitos, em valor absoluto. */
  totalDeposited: number
  /** Soma dos levantamentos, em valor absoluto. */
  totalWithdrawn: number
  /** Valor atual da conta (cash + posições). */
  currentValue: number
  /** currentValue + levantado − depositado. */
  absoluteGain: number
  /** Retorno total NÃO anualizado, decimal. `null` se não houve investimento líquido. */
  totalReturn: number | null
  /** Os fluxos usados, ordenados — para a UI poder mostrá-los ao utilizador. */
  cashFlows: CashFlow[]
  /** Nº de movimentos internos ignorados (taxas/juros). */
  ignoredInternal: number
}

/**
 * Constrói os cash flows a partir dos movimentos da corretora e do valor atual,
 * e devolve o XIRR já calculado junto com os totais de contexto.
 *
 * `asOf` é a data a que o `currentValue` se refere (normalmente hoje) — fica
 * explícito em vez de `new Date()` interno para o cálculo ser determinístico
 * e testável.
 */
export function calculatePortfolioReturn(
  movements: BrokerMovement[],
  currentValue: number,
  asOf: Date,
): PortfolioReturn {
  const cashFlows: CashFlow[] = []
  let totalDeposited = 0
  let totalWithdrawn = 0
  let ignoredInternal = 0

  for (const movement of movements) {
    if (!isExternalCashFlow(movement.type)) {
      ignoredInternal++
      continue
    }
    if (!Number.isFinite(movement.amount) || movement.amount === 0) continue
    if (!(movement.date instanceof Date) || Number.isNaN(movement.date.getTime())) continue

    // Normalizamos pelo tipo em vez de confiar no sinal que a API devolve:
    // um DEPOSIT é sempre saída do bolso, um WITHDRAW é sempre entrada.
    // TRANSFER (e tipos futuros ainda não documentados) só têm o sinal da API
    // para nos guiar, invertido para a ótica do investidor.
    let amount: number
    if (movement.type === "DEPOSIT") {
      amount = -Math.abs(movement.amount)
    } else if (movement.type === "WITHDRAW") {
      amount = Math.abs(movement.amount)
    } else {
      amount = -movement.amount
    }

    if (amount < 0) totalDeposited += -amount
    else totalWithdrawn += amount

    cashFlows.push({ date: movement.date, amount })
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())
  cashFlows.push({ date: asOf, amount: currentValue })

  const netInvested = totalDeposited - totalWithdrawn
  const absoluteGain = currentValue + totalWithdrawn - totalDeposited

  return {
    xirr: calculateXirr(cashFlows),
    totalDeposited,
    totalWithdrawn,
    currentValue,
    absoluteGain,
    totalReturn: netInvested > 0 ? absoluteGain / netInvested : null,
    cashFlows,
    ignoredInternal,
  }
}
