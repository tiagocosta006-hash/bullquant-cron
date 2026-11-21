import * as fs from "node:fs/promises"
import * as path from "node:path"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { get } from "@/lib/fmp/mercado"
import { finnhubGet, simboloFinnhub } from "@/lib/finnhub"

/**
 * Calendário (resultados, dividendos, splits, macro) e insiders.
 *
 * Substitui as tabelas `earnings_events`, `corporate_events`, `market_events`
 * e `insider_transactions`, que eram cópias de outras fontes mantidas por
 * scripts. Agora:
 *   · Resultados (calendário e por empresa) → Finnhub `/calendar/earnings`
 *   · Insiders                             → Finnhub `/stock/insider-transactions`
 *   · Splits                               → catálogo local `scripts/splits_eventos.json`
 *                                            (Finnhub free tier devolve 403 em `/stock/split`)
 *   · Dividendos e macro                   → FMP (`dividends-calendar`, `economic-calendar`),
 *                                            pois ambos são pagos na Finnhub (HTTP 403).
 *
 * A Data Cache do Next (`revalidate`) evita pedidos repetidos.
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

// ─── Resultados (Finnhub /calendar/earnings) ───────────────────────────────
//
// Mapa de campos Finnhub → `Resultado`:
//   symbol          → ticker (ou `tickerForcado` em `resultadosDe`, porque
//                     para classes como BRK.B a Finnhub devolve symbol "BRK.A")
//   date            → date
//   epsEstimate     → epsEstimate      (na FMP era `epsEstimated`)
//   epsActual       → epsActual
//   revenueEstimate → revenueEstimate  (na FMP era `revenueEstimated`)
//   revenueActual   → revenueActual

type LinhaResultadoFinnhub = {
  symbol?: string
  date?: string
  epsActual?: number | null
  epsEstimate?: number | null
  revenueActual?: number | null
  revenueEstimate?: number | null
}

type RespostaEarningsFinnhub = {
  earningsCalendar?: LinhaResultadoFinnhub[]
}

export type Resultado = {
  ticker: string
  date: string
  epsEstimate: number | null
  epsActual: number | null
  revenueEstimate: number | null
  revenueActual: number | null
}

const numOuNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null

function extrairLinhasEarnings(dados: unknown): LinhaResultadoFinnhub[] {
  if (Array.isArray(dados)) return dados as LinhaResultadoFinnhub[]
  if (dados && typeof dados === "object" && Array.isArray((dados as RespostaEarningsFinnhub).earningsCalendar)) {
    return (dados as RespostaEarningsFinnhub).earningsCalendar!
  }
  return []
}

/**
 * Converte uma resposta de `/calendar/earnings` da Finnhub para `Resultado[]`,
 * deduplicando entradas repetidas para o mesmo `(ticker, date)` mantendo os
 * campos preenchidos (`Actual` ou estimativas).
 */
export function mapearResultadosFinnhub(dados: unknown, tickerForcado?: string): Resultado[] {
  const linhas = extrairLinhasEarnings(dados)
  const porChave = new Map<string, Resultado>()
  const forcado = tickerForcado ? simboloFinnhub(tickerForcado) : null

  for (const l of linhas) {
    if (!l || typeof l !== "object") continue
    const date = typeof l.date === "string" ? l.date.slice(0, 10) : ""
    const rawSym = typeof l.symbol === "string" ? l.symbol.trim().toUpperCase() : ""
    const ticker = forcado ?? rawSym
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const entrada: Resultado = {
      ticker,
      date,
      epsEstimate: numOuNull(l.epsEstimate),
      epsActual: numOuNull(l.epsActual),
      revenueEstimate: numOuNull(l.revenueEstimate),
      revenueActual: numOuNull(l.revenueActual),
    }

    const chave = `${ticker}|${date}`
    const existente = porChave.get(chave)
    if (!existente) {
      porChave.set(chave, entrada)
    } else {
      // A Finnhub devolve por vezes linhas duplicadas em que só uma tem os
      // valores reais ou as estimativas — preenche-se campo a campo.
      if (existente.epsActual === null && entrada.epsActual !== null) existente.epsActual = entrada.epsActual
      if (existente.epsEstimate === null && entrada.epsEstimate !== null) existente.epsEstimate = entrada.epsEstimate
      if (existente.revenueActual === null && entrada.revenueActual !== null) existente.revenueActual = entrada.revenueActual
      if (existente.revenueEstimate === null && entrada.revenueEstimate !== null) {
        existente.revenueEstimate = entrada.revenueEstimate
      }
    }
  }

  return [...porChave.values()]
}

/**
 * Resultados de todas as empresas entre duas datas (já filtrados pelas `tickers`).
 *
 * Medido na Finnhub a 2026-11-18: o endpoint `/calendar/earnings` trunca cada
 * resposta em 1 500 linhas (um pedido de 90 dias devolveu exactamente 1 500),
 * enquanto uma semana de pico em outubro devolveu 937. Pedir semana a semana
 * evita cortes silenciosos no calendário mensal.
 */
export async function calendarioResultados(de: Date, ate: Date, tickers: Set<string>): Promise<Resultado[]> {
  const blocos = await Promise.all(
    semanas(de, ate).map(([from, to]) =>
      finnhubGet<RespostaEarningsFinnhub>("calendar/earnings", { from, to }, REVALIDATE_CALENDARIO),
    ),
  )
  const todos = blocos.flatMap((b) => extrairLinhasEarnings(b))
  return mapearResultadosFinnhub(todos).filter((r) => tickers.has(r.ticker))
}

/**
 * Histórico recente e próximos resultados de uma empresa, mais recentes primeiro.
 *
 * Sem `from`/`to`, `/calendar/earnings` devolve apenas o mês corrente; a janela
 * [-365 dias, +365 dias] garante que inclui o último trimestre reportado e os
 * próximos anúncios já calendarizados na Finnhub.
 */
export async function resultadosDe(ticker: string): Promise<Resultado[]> {
  const sym = simboloFinnhub(ticker)
  if (!sym) return []
  const hoje = new Date()
  const de = new Date(hoje.getTime() - 365 * DIA)
  const ate = new Date(hoje.getTime() + 365 * DIA)
  const dados = await finnhubGet<RespostaEarningsFinnhub>(
    "calendar/earnings",
    { symbol: sym, from: iso(de), to: iso(ate) },
    REVALIDATE_CALENDARIO,
  )
  return mapearResultadosFinnhub(dados, sym).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

// ─── Dividendos (FMP) e splits (catálogo local) ────────────────────────────

type LinhaDividendo = { symbol: string; date: string; paymentDate?: string; dividend?: number }

export type EntradaSplitLocal = {
  data: string
  fator: number
}

export type EventoCorporativo = {
  ticker: string
  type: "DIVIDEND" | "SPLIT"
  date: string
  payDate: string | null
  amount: number | null
  splitRatio: string | null
}

/**
 * Converte o fator numérico (`numerator / denominator`) num rácio legível
 * (ex.: `4` → `"4:1"`, `1.5` → `"3:2"`, `0.5` → `"1:2"`, `1.398` → `"1.398:1"`).
 */
export function formatarSplitRatio(fator: number): string {
  for (let den = 1; den <= 20; den++) {
    const num = Math.round(fator * den)
    if (num > 0 && Math.abs(fator * den - num) < 1e-4) {
      return `${num}:${den}`
    }
  }
  return `${Number(fator.toFixed(4))}:1`
}

/**
 * Filtra os splits de `scripts/splits_eventos.json` pelo conjunto de tickers
 * e janela `[de, ate]`. Extraído como função pura para testes sem disco.
 */
export function mapearSplitsLocais(
  catalogo: unknown,
  de: Date,
  ate: Date,
  tickers: Set<string>,
): EventoCorporativo[] {
  if (!catalogo || typeof catalogo !== "object" || Array.isArray(catalogo)) return []
  const inicio = iso(de)
  const fim = iso(ate)
  const out: EventoCorporativo[] = []

  for (const [tickerRaw, lista] of Object.entries(catalogo as Record<string, unknown>)) {
    const ticker = tickerRaw.trim().toUpperCase()
    if (!tickers.has(ticker) || !Array.isArray(lista)) continue
    for (const item of lista) {
      if (!item || typeof item !== "object") continue
      const ev = item as Partial<EntradaSplitLocal>
      const data = typeof ev.data === "string" ? ev.data.slice(0, 10) : ""
      const fator = typeof ev.fator === "number" && Number.isFinite(ev.fator) ? ev.fator : NaN
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(fator) || fator <= 0) continue
      if (data < inicio || data > fim) continue

      out.push({
        ticker,
        type: "SPLIT",
        date: data,
        payDate: null,
        amount: null,
        splitRatio: formatarSplitRatio(fator),
      })
    }
  }

  return out
}

async function lerSplitsLocais(de: Date, ate: Date, tickers: Set<string>): Promise<EventoCorporativo[]> {
  // A Finnhub não inclui `/stock/split` no plano gratuito (HTTP 403). Em vez de
  // chamar `splits-calendar` da FMP, lê-se o catálogo local gerado por
  // `scripts/construir_splits.py`; se não existir no ambiente (ex.: deploy
  // serverless sem `scripts/`), degrada silenciosamente para lista vazia.
  const caminho = path.join(process.cwd(), "scripts", "splits_eventos.json")
  try {
    const bruto = await fs.readFile(caminho, "utf8")
    return mapearSplitsLocais(JSON.parse(bruto), de, ate, tickers)
  } catch {
    return []
  }
}

export async function calendarioCorporativo(de: Date, ate: Date, tickers: Set<string>): Promise<EventoCorporativo[]> {
  const [divs, splits] = await Promise.all([
    porSemanas<LinhaDividendo>("dividends-calendar", de, ate),
    lerSplitsLocais(de, ate, tickers),
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
  out.push(...splits)
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

// ─── Insiders (Finnhub /stock/insider-transactions) ────────────────────────
//
// Mapa de campos Finnhub → `TransacaoInsider` (substitui `insider-trading/search` da FMP):
//   name             → insiderName
//   (ausente)        → title: null (o endpoint Finnhub não fornece cargo; a FMP dava `typeOfOwner`)
//   transactionCode  → transactionCode (normalizado em maiúsculas; `""` → `null`)
//                      e `type` ("P" → BUY, "S" → SELL, restantes códigos SEC → OTHER)
//   change           → sharesChange (já vem assinado pela Finnhub: negativo em vendas/saídas,
//                      positivo em compras/entradas; na FMP vinha separado em acquisitionOrDisposition)
//   Math.abs(change) → shares (quantidade absoluta transacionada)
//   transactionPrice → price (`> 0` → número; `0`/nulo em prémios/exercícios → `null`)
//   price * shares   → value (ou `null` sem preço positivo)
//   share            → sharesOwnedAfter (ações detidas após a transação)
//   transactionDate  → transactionDate (YYYY-MM-DD)
//   filingDate       → filedAt (`""` → `null`)
//   id (+ índice)    → id (`${id || filingDate || transactionDate}#${i}`, pois o mesmo Form 4
//                      pode conter várias transações)

type LinhaInsiderFinnhub = {
  id?: string
  symbol?: string
  name?: string
  share?: number | null
  change?: number | null
  filingDate?: string
  transactionDate?: string
  transactionCode?: string
  transactionPrice?: number | null
}

type RespostaInsidersFinnhub = {
  data?: LinhaInsiderFinnhub[]
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
 * Converte a resposta de `/stock/insider-transactions` da Finnhub para
 * `TransacaoInsider[]`, ordenada da transação mais recente para a mais antiga
 * e truncada em `limite`. Extraída para testes sem rede.
 */
export function mapearInsidersFinnhub(dados: unknown, limite = 100): TransacaoInsider[] {
  const bruto = Array.isArray(dados)
    ? (dados as LinhaInsiderFinnhub[])
    : dados && typeof dados === "object" && Array.isArray((dados as RespostaInsidersFinnhub).data)
      ? (dados as RespostaInsidersFinnhub).data!
      : []

  const out: TransacaoInsider[] = []
  for (let i = 0; i < bruto.length; i++) {
    const l = bruto[i]
    if (!l || typeof l !== "object") continue
    const insiderName = typeof l.name === "string" ? l.name.trim() : ""
    const transactionDate = typeof l.transactionDate === "string" ? l.transactionDate.slice(0, 10) : ""
    if (!insiderName || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) continue

    const codigoRaw = typeof l.transactionCode === "string" ? l.transactionCode.trim().toUpperCase() : ""
    const codigo = codigoRaw || null
    const sharesChange = typeof l.change === "number" && Number.isFinite(l.change) ? l.change : null
    const shares = sharesChange !== null ? Math.abs(sharesChange) : 0
    const price =
      typeof l.transactionPrice === "number" && Number.isFinite(l.transactionPrice) && l.transactionPrice > 0
        ? l.transactionPrice
        : null
    const sharesOwnedAfter = typeof l.share === "number" && Number.isFinite(l.share) ? l.share : null
    const filedAt = typeof l.filingDate === "string" && l.filingDate.trim() ? l.filingDate.trim().slice(0, 10) : null
    const baseId = (typeof l.id === "string" && l.id.trim()) || filedAt || transactionDate

    out.push({
      id: `${baseId}#${i}`,
      insiderName,
      title: null,
      type: codigo === "P" ? "BUY" : codigo === "S" ? "SELL" : "OTHER",
      transactionCode: codigo,
      shares,
      sharesChange,
      price,
      value: price !== null ? price * shares : null,
      sharesOwnedAfter,
      transactionDate,
      filedAt,
    })
  }

  return out
    .sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) {
        return a.transactionDate < b.transactionDate ? 1 : -1
      }
      const fa = a.filedAt ?? ""
      const fb = b.filedAt ?? ""
      return fa < fb ? 1 : fa > fb ? -1 : 0
    })
    .slice(0, Math.max(0, limite))
}

/**
 * Transações de insiders (Form 4) de uma empresa, mais recentes primeiro.
 *
 * Vem da Finnhub (`/stock/insider-transactions`) com janela de 2 anos para
 * cobrir empresas menos ativas; só compras (P) e vendas (S) em mercado contam
 * como BUY/SELL — o resto (exercício de opções, prémios, doações) é OTHER.
 */
export async function insiders(ticker: string, limite = 100): Promise<TransacaoInsider[]> {
  const sym = simboloFinnhub(ticker)
  if (!sym) return []
  const hoje = new Date()
  const ha2Anos = new Date(hoje.getTime() - 2 * 365 * DIA)
  const dados = await finnhubGet<RespostaInsidersFinnhub>(
    "stock/insider-transactions",
    { symbol: sym, from: iso(ha2Anos), to: iso(hoje) },
    REVALIDATE_INSIDERS,
  )
  return mapearInsidersFinnhub(dados, limite)
}
