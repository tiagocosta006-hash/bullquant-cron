/**
 * Comparação preço vs lucros por indexação a uma base comum (base 100).
 *
 * Duas medidas com unidades diferentes ($/ação e $ totais) NÃO podem partilhar
 * um gráfico com dois eixos Y: as duas escalas seriam arbitrárias e qualquer
 * conclusão ("o lucro acompanha o preço") seria um artefacto da escala
 * escolhida. A forma correta é reindexar ambas a 100 na mesma data-base e
 * mostrá-las num único eixo — aí a distância vertical entre as linhas é
 * informação real (expansão/compressão de múltiplo).
 *
 * JS puro, sem dependências de UI (CLAUDE.md §7).
 */
import { calculateCagr } from "./cagr"

export type PriceEarningsRow = {
  date: string
  price: number
  /** Lucro líquido TTM na data em que já era público (point-in-time). */
  netIncome?: number | null
}

export type IndexedPoint = {
  date: string
  /** Preço reindexado a 100 na data-base. */
  priceIdx: number
  /** Lucro TTM reindexado a 100 na data-base. */
  earningsIdx: number
  price: number
  netIncome: number
}

export type PriceVsEarningsResult = {
  data: IndexedPoint[]
  /** CAGR do preço na janela; `null` com menos de ~1 ano. */
  priceCagr: number | null
  /** CAGR do lucro na janela; `null` com menos de ~1 ano ou lucro final ≤ 0. */
  earningsCagr: number | null
  /** Variação total do preço (fração, não %), sempre disponível. */
  priceTotal: number | null
  earningsTotal: number | null
  years: number
  baseDate: string | null
  /** true quando a base não é o início da janela (havia prejuízos antes). */
  baseShifted: boolean
  /** Escala log só é possível com todos os índices > 0. */
  logAvailable: boolean
  /** Amplitude grande (>20x) — a escala log passa a ser a leitura sensata. */
  logSuggested: boolean
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
}

/**
 * @param rows       série point-in-time (preço + lucro TTM já público), ascendente por data
 * @param windowYears anos de janela a partir do último ponto; `null` = tudo
 * @param maxPoints  limite de pontos desenhados (downsample uniforme)
 */
export function buildPriceVsEarnings(
  rows: PriceEarningsRow[],
  windowYears: number | null,
  maxPoints = 400,
): PriceVsEarningsResult {
  // Só pontos com ambas as séries — indexar cada série a uma data-base
  // diferente tornaria a comparação inválida.
  const paired = rows.filter(
    (r): r is PriceEarningsRow & { netIncome: number } =>
      typeof r.price === "number" && Number.isFinite(r.price) && r.price > 0 &&
      typeof r.netIncome === "number" && Number.isFinite(r.netIncome),
  )
  if (paired.length < 2) return EMPTY

  const lastTime = new Date(paired[paired.length - 1].date).getTime()
  const windowed = windowYears === null
    ? paired
    : paired.filter(r => new Date(r.date).getTime() >= lastTime - windowYears * YEAR_MS)
  if (windowed.length < 2) return EMPTY

  // A base tem de ter lucro POSITIVO: indexar a um prejuízo inverte a série
  // (recuperar o lucro faria o índice descer). Se a empresa dava prejuízo no
  // início da janela, ancoramos no primeiro TTM lucrativo dentro dela.
  const baseIdx = windowed.findIndex(r => r.netIncome > 0)
  if (baseIdx === -1 || baseIdx >= windowed.length - 1) return EMPTY

  const sliced = windowed.slice(baseIdx)
  const basePrice = sliced[0].price
  const baseNi = sliced[0].netIncome

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
    earningsIdx: (r.netIncome / baseNi) * 100,
    price: r.price,
    netIncome: r.netIncome,
  }))

  const last = sliced[sliced.length - 1]
  const years = (new Date(last.date).getTime() - new Date(sliced[0].date).getTime()) / YEAR_MS

  // CAGR só com pelo menos ~1 ano; calculateCagr devolve null (nunca NaN) para
  // lucro final negativo, que anularia a raiz de ordem fracionária.
  const canCagr = years >= 1
  const priceCagr = canCagr ? calculateCagr(basePrice, last.price, years) : null
  const earningsCagr = canCagr ? calculateCagr(baseNi, last.netIncome, years) : null

  const idxValues = data.flatMap(d => [d.priceIdx, d.earningsIdx])
  const minIdx = Math.min(...idxValues)
  const maxIdx = Math.max(...idxValues)

  return {
    data,
    priceCagr,
    earningsCagr,
    priceTotal: last.price / basePrice - 1,
    earningsTotal: last.netIncome / baseNi - 1,
    years,
    baseDate: sliced[0].date,
    baseShifted: baseIdx > 0,
    logAvailable: minIdx > 0,
    logSuggested: minIdx > 0 && maxIdx / minIdx > 20,
  }
}
