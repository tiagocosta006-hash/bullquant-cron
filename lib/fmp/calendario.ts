import * as fs from "node:fs/promises"
import * as path from "node:path"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { nasdaqGet, num, dataUs } from "@/lib/fontes/nasdaq"
import { eventosOficiais } from "@/lib/fontes/macroOficial"
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
 *   · Dividendos e macro                   → Nasdaq (`calendar/dividends`, `calendar/economicevents`),
 *                                            públicos e sem chave (na Finnhub são pagos: HTTP 403).
 *                                            Decisão do Costa (2026-11-21): sem FMP.
 *
 * A Data Cache do Next (`revalidate`) evita pedidos repetidos.
 */

const DIA = 86_400_000
const REVALIDATE_CALENDARIO = 6 * 3600
const REVALIDATE_INSIDERS = 6 * 3600

const iso = (d: Date) => d.toISOString().slice(0, 10)

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

/** Janelas de 7 dias (a Finnhub corta cada resposta em 1 500 linhas). */
function semanas(de: Date, ate: Date): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let ini = de.getTime(); ini <= ate.getTime(); ini += 7 * DIA) {
    out.push([iso(new Date(ini)), iso(new Date(Math.min(ini + 6 * DIA, ate.getTime())))])
  }
  return out
}

/** Um pedido por dia útil: o Nasdaq dá os calendários dia a dia. */
function diasUteis(de: Date, ate: Date): string[] {
  const out: string[] = []
  for (let t = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()); t <= ate.getTime(); t += DIA) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(iso(d))
  }
  return out
}

/**
 * Um pedido por dia útil, no máximo 3 em simultâneo: com muitos em paralelo o Nasdaq
 * responde `data: null` a alguns dias (medido a 2026-11-21). Um dia vazio repete-se
 * uma vez, meio segundo depois.
 */
async function nasdaqPorDia<T>(caminho: string, dias: string[]): Promise<Array<T | null>> {
  const out: Array<T | null> = new Array(dias.length).fill(null)
  let i = 0
  const trabalhador = async () => {
    while (i < dias.length) {
      const k = i++
      let r = await nasdaqGet<T>(caminho, { date: dias[k] }, REVALIDATE_CALENDARIO)
      if (r === null) {
        await new Promise((ok) => setTimeout(ok, 500))
        r = await nasdaqGet<T>(caminho, { date: dias[k] }, REVALIDATE_CALENDARIO)
      }
      out[k] = r
    }
  }
  await Promise.all([trabalhador(), trabalhador(), trabalhador()])
  return out
}

async function porDias<T>(caminho: string, de: Date, ate: Date, extrair: (dados: unknown) => T[]): Promise<T[]> {
  const blocos = await nasdaqPorDia<unknown>(caminho, diasUteis(de, ate))
  return blocos.flatMap((b) => (b ? extrair(b) : []))
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

type LinhaDividendo = {
  symbol?: string
  dividend_Ex_Date?: string
  payment_Date?: string
  dividend_Rate?: number | string
}

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
    porDias<LinhaDividendo>("calendar/dividends", de, ate,
      (d) => ((d as { calendar?: { rows?: LinhaDividendo[] | null } }).calendar?.rows ?? [])),
    lerSplitsLocais(de, ate, tickers),
  ])
  const out: EventoCorporativo[] = []
  for (const d of divs) {
    const ticker = (d.symbol ?? "").trim().toUpperCase().replace(/\//g, ".")
    const date = dataUs(d.dividend_Ex_Date)
    if (!tickers.has(ticker) || !date) continue
    out.push({
      ticker,
      type: "DIVIDEND",
      date,
      payDate: dataUs(d.payment_Date),
      amount: num(d.dividend_Rate),
      splitRatio: null,
    })
  }
  out.push(...splits)
  return out
}

// ─── Macro ─────────────────────────────────────────────────────────────────

type LinhaEconomica = {
  gmt?: string // "08:30" — apesar do nome, é a hora de Nova Iorque (os dados dos EUA saem às 8:30 ET)
  country?: string
  eventName?: string
  actual?: string
  consensus?: string
  previous?: string
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
  "fed interest rate decision": "FOMC",
  "fomc meeting minutes": "FOMC",
  "fomc minutes": "FOMC",
  "cpi": "CPI",
  "core cpi": "CPI",
  "nonfarm payrolls": "JOBS",
  "unemployment rate": "JOBS",
  "gdp": "GDP",
  "pce price index": "PCE",
  "pce prices": "PCE",
  "core pce price index": "PCE",
  "retail sales": "RETAIL_SALES",
}

/** Os mais importantes para quem investe a longo prazo; os outros ficam "médios". */
const ALTO = new Set(["fed interest rate decision", "cpi", "nonfarm payrolls", "gdp", "core pce price index"])

function chaveEvento(evento: string): string {
  return evento.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase()
}

function tipoDe(evento: string): TipoMacro | null {
  return EVENTOS[chaveEvento(evento)] ?? null
}

/** Valores (atual, consenso, anterior) do Nasdaq — as datas oficiais vêm de macroOficial. */
async function macroNasdaq(de: Date, ate: Date): Promise<EventoMacro[]> {
  // O `date=D` do Nasdaq devolve os eventos do dia ANTERIOR (medido a 2026-11-21 contra a
  // Fed e o BEA: FOMC 10/12 em vez de 9/12, PIB 26/11 em vez de 25/11). Pede-se cada dia
  // seguinte — fins de semana incluídos, senão as sextas-feiras perdiam-se — e atribui-se
  // ao dia anterior.
  const pedidos: string[] = []
  const dias: string[] = []
  for (let t = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()); t <= ate.getTime(); t += DIA) {
    dias.push(iso(new Date(t)))
    pedidos.push(iso(new Date(t + DIA)))
  }
  const respostas = await nasdaqPorDia<{ rows?: LinhaEconomica[] | null }>("calendar/economicevents", pedidos)
  const out: EventoMacro[] = []
  const vistos = new Set<string>()
  respostas.forEach((r, i) => {
    const date = dias[i]
    for (const l of r?.rows ?? []) {
      if (l.country !== "United States" || !l.eventName) continue
      const type = tipoDe(l.eventName)
      if (!type) continue
      const id = `${date}|${l.eventName}`
      if (vistos.has(id)) continue // o mesmo nome repetido (ex.: CPI mensal e anual) — fica o primeiro
      vistos.add(id)
      const hora = (l.gmt ?? "").trim()
      const limpo = (v?: string) => {
        const x = (v ?? "").replace(/&nbsp;/gi, " ").trim()
        return x ? x : null
      }
      out.push({
        id,
        type,
        date,
        time: /^\d{1,2}:\d{2}$/.test(hora) ? `${hora} ET` : null,
        title: l.eventName,
        importance: ALTO.has(chaveEvento(l.eventName)) ? "HIGH" : "MEDIUM",
        country: "US",
        actual: limpo(l.actual),
        estimate: limpo(l.consensus),
        previous: limpo(l.previous),
      })
    }
  })
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Eventos macro dos EUA (FOMC, inflação, emprego, PIB, PCE, vendas a retalho).
 *
 * DATAS e horas de quem publica (Fed, BEA, Census, BLS via FRED — lib/fontes/macroOficial.ts):
 * oficiais e já conhecidas para os meses seguintes. O calendário do Nasdaq dava respostas
 * diferentes ao mesmo pedido (56 eventos e depois "No record found", 2026-11-21), por isso
 * só entra para os VALORES (atual, consenso, anterior) do mesmo dia e tipo, e para o que as
 * fontes oficiais não cobrirem (ex.: CPI e emprego sem FRED_API_KEY).
 */
export async function calendarioMacro(de: Date, ate: Date): Promise<EventoMacro[]> {
  const [oficiais, nasdaq] = await Promise.all([
    eventosOficiais(iso(de), iso(ate)).catch(() => []),
    macroNasdaq(de, ate).catch(() => [] as EventoMacro[]),
  ])
  const porDiaTipo = new Map<string, EventoMacro[]>()
  for (const n of nasdaq) {
    const k = `${n.date}|${n.type}`
    porDiaTipo.set(k, [...(porDiaTipo.get(k) ?? []), n])
  }
  const usados = new Set<string>()
  const out: EventoMacro[] = []
  for (const o of oficiais) {
    const k = `${o.date}|${o.type}`
    // O valor do Nasdaq com o nome mais parecido (ex.: "CPI" e não "Core CPI").
    const cand = porDiaTipo.get(k) ?? []
    const v =
      cand.find((c) => c.title.toLowerCase() === o.title.toLowerCase()) ??
      cand.find((c) => !/^core\b/i.test(c.title)) ??
      cand[0] ??
      null
    if (cand.length) usados.add(k)
    out.push({
      id: `${o.date}|${o.title}`,
      type: o.type,
      date: o.date,
      time: o.time,
      title: o.title,
      importance: o.importance,
      country: "US",
      actual: v?.actual ?? null,
      estimate: v?.estimate ?? null,
      previous: v?.previous ?? null,
    })
  }
  for (const [k, lista] of porDiaTipo) {
    if (!usados.has(k)) out.push(...lista)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
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
