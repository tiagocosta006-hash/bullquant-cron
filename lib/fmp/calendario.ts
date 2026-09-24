import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { get } from "@/lib/fmp/mercado"

/**
 * Calendário (resultados, dividendos, splits, macro) e insiders, da FMP.
 *
 * Substitui as tabelas `earnings_events`, `corporate_events`, `market_events`
 * e `insider_transactions`, que eram cópias de outras fontes mantidas por
 * scripts. A FMP é a fonte; a Data Cache do Next evita pedidos repetidos.
 *
 * ── Limites da FMP (medidos a 2026-09-24) ────────────────────────────────
 *
 * Os calendários cobrem o mundo inteiro e cortam em 4 000 linhas por pedido.
 * Dois meses de resultados batem no tecto; uma semana fica abaixo de 2 000.
 * Por isso pede-se semana a semana e filtra-se para as nossas empresas.
 */

const DIA = 86_400_000
const REVALIDATE_CALENDARIO = 6 * 3600
const REVALIDATE_INSIDERS = 6 * 3600

const iso = (d: Date) => d.toISOString().slice(0, 10)
/** A FMP escreve BRK-B, a base BRK.B. */
const daFmp = (s: string) => s.replace(/-/g, ".")

// ─── Empresas cobertas ─────────────────────────────────────────────────────

export type EmpresaMeta = {
  id: string
  ticker: string
  name: string
  logoUrl: string | null
  employees: number | null
}

/** As empresas da base, por ticker. Muda raramente: cache de um dia. */
export const empresasPorTicker = unstable_cache(
  async (): Promise<Record<string, EmpresaMeta>> => {
    const linhas = await prisma.company.findMany({
      where: { isActive: true, ticker: { not: { startsWith: "^" } } },
      select: { id: true, ticker: true, name: true, logoUrl: true, employees: true },
    })
    return Object.fromEntries(linhas.map((l) => [l.ticker, l]))
  },
  ["fmp-empresas-meta"],
  { revalidate: 86_400, tags: ["empresas"] },
)

// ─── Janelas ───────────────────────────────────────────────────────────────

function semanas(de: Date, ate: Date): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let ini = de.getTime(); ini <= ate.getTime(); ini += 7 * DIA) {
    out.push([iso(new Date(ini)), iso(new Date(Math.min(ini + 6 * DIA, ate.getTime())))])
  }
  return out
}

async function porSemanas<T>(endpoint: string, de: Date, ate: Date): Promise<T[]> {
  const blocos = await Promise.all(
    semanas(de, ate).map(([from, to]) => get<T[]>(endpoint, { from, to }, REVALIDATE_CALENDARIO)),
  )
  return blocos.flatMap((b) => (Array.isArray(b) ? b : []))
}

// ─── Resultados ────────────────────────────────────────────────────────────

type LinhaResultado = {
  symbol: string
  date: string
  epsActual: number | null
  epsEstimated: number | null
  revenueActual: number | null
  revenueEstimated: number | null
}

export type Resultado = {
  ticker: string
  date: string
  epsEstimate: number | null
  epsActual: number | null
  revenueEstimate: number | null
  revenueActual: number | null
}

const paraResultado = (l: LinhaResultado): Resultado => ({
  ticker: daFmp(l.symbol),
  date: l.date,
  epsEstimate: l.epsEstimated ?? null,
  epsActual: l.epsActual ?? null,
  revenueEstimate: l.revenueEstimated ?? null,
  revenueActual: l.revenueActual ?? null,
})

/** Resultados de todas as empresas entre duas datas (já filtrados pelas `tickers`). */
export async function calendarioResultados(de: Date, ate: Date, tickers: Set<string>): Promise<Resultado[]> {
  const linhas = await porSemanas<LinhaResultado>("earnings-calendar", de, ate)
  return linhas.map(paraResultado).filter((r) => tickers.has(r.ticker))
}

/** Histórico e próximos resultados de uma empresa, mais recentes primeiro. */
export async function resultadosDe(ticker: string): Promise<Resultado[]> {
  const linhas = await get<LinhaResultado[]>(
    "earnings",
    { symbol: ticker.toUpperCase().replace(/\./g, "-"), limit: "12" },
    REVALIDATE_CALENDARIO,
  )
  return (Array.isArray(linhas) ? linhas : []).map(paraResultado).sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ─── Dividendos e splits ───────────────────────────────────────────────────

type LinhaDividendo = { symbol: string; date: string; paymentDate?: string; dividend?: number }
type LinhaSplit = { symbol: string; date: string; numerator: number; denominator: number }

export type EventoCorporativo = {
  ticker: string
  type: "DIVIDEND" | "SPLIT"
  date: string
  payDate: string | null
  amount: number | null
  splitRatio: string | null
}

export async function calendarioCorporativo(de: Date, ate: Date, tickers: Set<string>): Promise<EventoCorporativo[]> {
  const [divs, splits] = await Promise.all([
    porSemanas<LinhaDividendo>("dividends-calendar", de, ate),
    // Splits são poucos (~260 em 5 meses no mundo inteiro): um pedido chega.
    get<LinhaSplit[]>("splits-calendar", { from: iso(de), to: iso(ate) }, REVALIDATE_CALENDARIO),
  ])
  const out: EventoCorporativo[] = []
  for (const d of divs) {
    const ticker = daFmp(d.symbol)
    if (!tickers.has(ticker)) continue
    out.push({
      ticker,
      type: "DIVIDEND",
      date: d.date,
      payDate: d.paymentDate || null,
      amount: d.dividend ?? null,
      splitRatio: null,
    })
  }
  for (const s of Array.isArray(splits) ? splits : []) {
    const ticker = daFmp(s.symbol)
    if (!tickers.has(ticker)) continue
    out.push({
      ticker,
      type: "SPLIT",
      date: s.date,
      payDate: null,
      amount: null,
      splitRatio: `${s.numerator}:${s.denominator}`,
    })
  }
  return out
}

// ─── Macro ─────────────────────────────────────────────────────────────────

type LinhaEconomica = {
  date: string // "2026-10-10 12:30:00", UTC
  country: string
  event: string
  previous: number | null
  estimate: number | null
  actual: number | null
  impact: "Low" | "Medium" | "High" | string
  unit?: string | null
}

export type TipoMacro = "FOMC" | "CPI" | "JOBS" | "GDP" | "PCE" | "RETAIL_SALES" | "OTHER"

export type EventoMacro = {
  id: string
  type: TipoMacro
  date: string
  time: string | null
  title: string
  importance: "LOW" | "MEDIUM" | "HIGH"
  country: string
  actual: string | null
  estimate: string | null
  previous: string | null
}

/**
 * Os eventos que a página mostra, pelo nome exato na FMP (sem o período entre
 * parêntesis). O calendário dos EUA tem ~70 eventos por mês — discursos de
 * cada membro da Fed, índices regionais, leilões. Para quem investe a longo
 * prazo, estes são os que movem o mercado; o calendário antigo também era
 * curado assim.
 */
const EVENTOS: Record<string, TipoMacro> = {
  "Fed Interest Rate Decision": "FOMC",
  "FOMC Minutes": "FOMC",
  "Inflation Rate YoY": "CPI",
  "Core Inflation Rate YoY": "CPI",
  "Non Farm Payrolls": "JOBS",
  "Unemployment Rate": "JOBS",
  "GDP Growth Rate QoQ": "GDP",
  "PCE Price Index YoY": "PCE",
  "Core PCE Price Index YoY": "PCE",
  "Retail Sales MoM": "RETAIL_SALES",
}

function tipoDe(evento: string): TipoMacro | null {
  return EVENTOS[evento.replace(/\s*\(.*?\)\s*/g, "").trim()] ?? null
}

const horaEt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function valor(v: number | null, unidade?: string | null): string | null {
  if (v == null) return null
  return unidade === "%" ? `${v}%` : String(v)
}

/**
 * Eventos macro dos EUA: só os de `EVENTOS` (FOMC, inflação, emprego, PIB,
 * PCE, vendas a retalho). Horas da FMP em UTC, mostradas em hora de Nova
 * Iorque (confirmado: decisão da Fed às 18:00 UTC = 14:00 ET).
 */
export async function calendarioMacro(de: Date, ate: Date): Promise<EventoMacro[]> {
  const linhas = await porSemanas<LinhaEconomica>("economic-calendar", de, ate)
  const out: EventoMacro[] = []
  const vistos = new Set<string>()
  for (const l of linhas) {
    if (l.country !== "US") continue
    const type = tipoDe(l.event)
    if (!type) continue
    const quando = new Date(l.date.replace(" ", "T") + "Z")
    const id = `${l.date}|${l.event}`
    if (vistos.has(id)) continue
    vistos.add(id)
    // Hora "00:00" UTC é como a FMP marca eventos sem hora.
    const semHora = l.date.endsWith("00:00:00")
    out.push({
      id,
      type,
      // Data no fuso de Nova Iorque, que é o dia em que o evento acontece lá.
      date: semHora ? l.date.slice(0, 10) : quando.toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
      time: semHora ? null : `${horaEt.format(quando)} ET`,
      title: l.event,
      importance: l.impact === "High" ? "HIGH" : l.impact === "Medium" ? "MEDIUM" : "LOW",
      country: "US",
      actual: valor(l.actual, l.unit),
      estimate: valor(l.estimate, l.unit),
      previous: valor(l.previous, l.unit),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Insiders ──────────────────────────────────────────────────────────────

type LinhaInsider = {
  filingDate: string
  transactionDate: string
  reportingName: string
  typeOfOwner?: string
  transactionType?: string // "P-Purchase", "S-Sale", "M-Exempt", ...
  acquisitionOrDisposition?: "A" | "D"
  securitiesTransacted?: number
  securitiesOwned?: number
  price?: number
  url?: string
}

export type TransacaoInsider = {
  id: string
  insiderName: string
  title: string | null
  type: "BUY" | "SELL" | "OTHER"
  transactionCode: string | null
  shares: number
  sharesChange: number | null
  price: number | null
  value: number | null
  sharesOwnedAfter: number | null
  transactionDate: string
  filedAt: string | null
}

/**
 * Transações de insiders (Form 4) de uma empresa, mais recentes primeiro.
 * Só compras (P) e vendas (S) em mercado contam como BUY/SELL — o resto
 * (exercício de opções, prémios em ações, doações) é OTHER, como no SEC.
 */
export async function insiders(ticker: string, limite = 100): Promise<TransacaoInsider[]> {
  const linhas = await get<LinhaInsider[]>(
    "insider-trading/search",
    { symbol: ticker.toUpperCase().replace(/\./g, "-"), page: "0", limit: String(limite) },
    REVALIDATE_INSIDERS,
  )
  return (Array.isArray(linhas) ? linhas : [])
    .map((l, i): TransacaoInsider => {
      const codigo = l.transactionType?.split("-")[0] ?? null
      const shares = l.securitiesTransacted ?? 0
      const price = l.price && l.price > 0 ? l.price : null
      return {
        id: `${l.url ?? l.filingDate}#${i}`,
        insiderName: l.reportingName,
        title: l.typeOfOwner ?? null,
        type: codigo === "P" ? "BUY" : codigo === "S" ? "SELL" : "OTHER",
        transactionCode: codigo,
        shares,
        sharesChange: l.acquisitionOrDisposition === "D" ? -shares : shares,
        price,
        value: price !== null ? price * shares : null,
        sharesOwnedAfter: l.securitiesOwned ?? null,
        transactionDate: l.transactionDate,
        filedAt: l.filingDate || null,
      }
    })
    .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1))
}
