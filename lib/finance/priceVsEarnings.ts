/**
 * Comparação preço vs lucros por indexação a uma base comum (base 100).
 *
 * Ambas as séries são POR AÇÃO (preço e EPS diluído TTM), o que torna a
 * comparação direta: recompras de ações entram nos dois lados, e a distância
 * vertical entre as linhas é exatamente a variação do P/E desde a data-base.
 *
 * Mesmo com a mesma unidade não se usa eixo duplo. Duas escalas independentes
 * escondem um múltiplo implícito (o rácio entre elas) que ninguém declara: com
 * os mesmos dados, esticar um dos eixos faz a ação parecer cara ou barata à
 * vontade. Reindexar a 100 num único eixo elimina esse grau de liberdade.
 *
 * JS puro, sem dependências de UI (CLAUDE.md §7).
 */
import { calculateCagr } from "./cagr"

export type PriceEarningsRow = {
  date: string
  price: number
  /**
   * EPS diluído TTM point-in-time. A API OMITE este campo quando a base de
   * splits do emitente é inconsistente, porque aí qualquer métrica por ação
   * está errada por um fator inteiro (ver a guarda em /api/valuation).
   */
  epsTtm?: number | null
  /** Lucro líquido TTM point-in-time — imune a splits, é o plano B. */
  netIncome?: number | null
}

/** Série usada no eixo dos lucros. `eps` é a preferida; `netIncome` é o plano B. */
export type EarningsBasis = "eps" | "netIncome"

export type IndexedPoint = {
  date: string
  /** Preço reindexado a 100 na data-base. */
  priceIdx: number
  /** EPS TTM reindexado a 100 na data-base. */
  earningsIdx: number
  price: number
  /** Valor da série de lucros neste ponto, na unidade indicada por `basis`. */
  earnings: number
}

export type PriceVsEarningsResult = {
  data: IndexedPoint[]
  /** CAGR do preço na janela; `null` com menos de ~1 ano. */
  priceCagr: number | null
  /** CAGR do EPS na janela; `null` com menos de ~1 ano ou EPS final ≤ 0. */
  earningsCagr: number | null
  /** Variação total do preço (fração, não %), sempre disponível. */
  priceTotal: number | null
  earningsTotal: number | null
  years: number
  baseDate: string | null
  /** true quando a base não é o início da janela (havia EPS negativo antes). */
  baseShifted: boolean
  /** Escala log só é possível com todos os índices > 0. */
  logAvailable: boolean
  /** Amplitude grande (>20x) — a escala log passa a ser a leitura sensata. */
  logSuggested: boolean
  /** Qual das séries foi usada — determina rótulo e formatação na UI. */
  basis: EarningsBasis
}

const DAY_MS = 24 * 3600 * 1000
const YEAR_MS = 365.25 * DAY_MS

const EMPTY: PriceVsEarningsResult = {
  data: [],
  priceCagr: null,
  earningsCagr: null,
  priceTotal: null,
  earningsTotal: null,
  years: 0,
  baseDate: null,
  baseShifted: false,
  logAvailable: false,
  logSuggested: false,
  basis: "eps",
}

/**
 * @param rows       série point-in-time (preço + EPS TTM já público), ascendente por data
 * @param windowYears anos de janela a partir do último ponto; `null` = tudo
 * @param maxPoints  limite de pontos desenhados (downsample uniforme)
 */
export function buildPriceVsEarnings(
  rows: PriceEarningsRow[],
  windowYears: number | null,
  maxPoints = 400,
): PriceVsEarningsResult {
  // EPS é a série preferida (é por ação, como o preço, logo a distância
  // vertical entre as linhas é a variação do P/E). Quando a API não a envia,
  // a base de splits do emitente não é de confiar e usa-se net income, que é
  // imune a splits — pior conceptualmente, mas correto.
  const usable = (r: PriceEarningsRow, key: "epsTtm" | "netIncome") =>
    typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0 &&
    typeof r[key] === "number" && Number.isFinite(r[key] as number)

  const epsRows = rows.filter(r => usable(r, "epsTtm"))
  const niRows = rows.filter(r => usable(r, "netIncome"))
  const basis: EarningsBasis = epsRows.length >= 2 ? "eps" : "netIncome"
  const key = basis === "eps" ? "epsTtm" : "netIncome"
  const paired = (basis === "eps" ? epsRows : niRows).map(r => ({
    date: r.date,
    price: r.price,
    earnings: r[key] as number,
  }))
  if (paired.length < 2) return EMPTY

  const lastTime = new Date(paired[paired.length - 1].date).getTime()
  const windowed = windowYears === null
    ? paired
    : paired.filter(r => new Date(r.date).getTime() >= lastTime - windowYears * YEAR_MS)
  if (windowed.length < 2) return EMPTY

  // A base tem de ter EPS POSITIVO: indexar a um prejuízo inverte a série
  // (recuperar o lucro faria o índice descer). Se a empresa dava prejuízo no
  // início da janela, ancoramos no primeiro TTM lucrativo dentro dela.
  const baseIdx = windowed.findIndex(r => r.earnings > 0)
  if (baseIdx === -1 || baseIdx >= windowed.length - 1) return EMPTY

  const sliced = windowed.slice(baseIdx)
  const basePrice = sliced[0].price
  const baseEarnings = sliced[0].earnings

  // Downsample: 10 anos de preços diários são ~2500 pontos para ~800px.
  // O primeiro e o último ponto são sempre preservados.
  const step = Math.max(1, Math.ceil(sliced.length / maxPoints))
  const sampled = sliced.filter((_, i) => i % step === 0)
  if (sampled[sampled.length - 1] !== sliced[sliced.length - 1]) {
    sampled.push(sliced[sliced.length - 1])
  }

  const data: IndexedPoint[] = sampled.map(r => ({
    date: r.date,
    priceIdx: (r.price / basePrice) * 100,
    earningsIdx: (r.earnings / baseEarnings) * 100,
    price: r.price,
    earnings: r.earnings,
  }))

  const last = sliced[sliced.length - 1]
  const years = (new Date(last.date).getTime() - new Date(sliced[0].date).getTime()) / YEAR_MS

  // CAGR só com pelo menos ~1 ano; calculateCagr devolve null (nunca NaN) para
  // EPS final negativo, que anularia a raiz de ordem fracionária.
  const canCagr = years >= 1
  const priceCagr = canCagr ? calculateCagr(basePrice, last.price, years) : null
  const earningsCagr = canCagr ? calculateCagr(baseEarnings, last.earnings, years) : null

  const idxValues = data.flatMap(d => [d.priceIdx, d.earningsIdx])
  const minIdx = Math.min(...idxValues)
  const maxIdx = Math.max(...idxValues)

  return {
    data,
    priceCagr,
    earningsCagr,
    priceTotal: last.price / basePrice - 1,
    earningsTotal: last.earnings / baseEarnings - 1,
    years,
    baseDate: sliced[0].date,
    baseShifted: baseIdx > 0,
    logAvailable: minIdx > 0,
    logSuggested: minIdx > 0 && maxIdx / minIdx > 20,
    basis,
  }
}
