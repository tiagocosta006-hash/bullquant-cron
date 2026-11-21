/**
 * Datas dos grandes dados macro dos EUA, tiradas de quem os publica (decisão do Costa,
 * 2026-11-21: fontes oficiais e públicas em vez de agregadores).
 *
 *   FOMC (decisão, atas)          → Fed, federalreserve.gov/json/calendar.json (sem chave)
 *   PIB, PCE                      → BEA, calendário ICS de subscrição (sem chave)
 *   Vendas a retalho              → Census, tabela de datas de divulgação (sem chave)
 *   CPI, emprego (BLS)            → FRED `release/dates` (chave gratuita FRED_API_KEY; o
 *                                   calendário do próprio BLS recusa pedidos automáticos)
 *
 * Só dão DATAS (e hora). Os valores (atual, consenso, anterior) juntam-se depois, quando
 * o Nasdaq os tem para o mesmo dia — ver lib/fmp/calendario.ts.
 *
 * Funções puras de leitura (lerFed, lerBea, lerCensus) para testes sem rede.
 */

export type TipoOficial = "FOMC" | "CPI" | "JOBS" | "GDP" | "PCE" | "RETAIL_SALES"

export type EventoOficial = {
  type: TipoOficial
  /** YYYY-MM-DD, no dia de Nova Iorque. */
  date: string
  /** "14:00 ET" ou null. */
  time: string | null
  title: string
  importance: "HIGH" | "MEDIUM"
  fonte: "Fed" | "BEA" | "Census" | "BLS"
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
const REVALIDATE = 12 * 3600

async function texto(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      next: { revalidate: REVALIDATE, tags: ["macro-oficial"] },
      signal: AbortSignal.timeout(15_000),
    })
    return r.ok ? await r.text() : null
  } catch {
    return null
  }
}

const horaEt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const diaEt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" })

/** "2:00 p.m." → "14:00 ET" */
function hora12(v: string | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i)
  if (!m) return null
  let h = Number(m[1]) % 12
  if (m[3].toLowerCase() === "p") h += 12
  return `${String(h).padStart(2, "0")}:${m[2]} ET`
}

// ─── Fed ──────────────────────────────────────────────────────────────────

type EventoFed = { month?: string; days?: string; time?: string; title?: string; type?: string }

export function lerFed(json: string): EventoOficial[] {
  let d: { events?: EventoFed[] }
  try {
    d = JSON.parse(json.replace(/^﻿/, ""))
  } catch {
    return []
  }
  const out: EventoOficial[] = []
  for (const e of d.events ?? []) {
    if (e.type !== "FOMC" || !e.month) continue
    const titulo = (e.title ?? "").trim()
    const decisao = /^FOMC Meeting$/i.test(titulo)
    const atas = /^FOMC Minutes$/i.test(titulo)
    if (!decisao && !atas) continue
    // "days" pode ser "17-18" (reunião de dois dias): a decisão sai no último.
    const dias = (e.days ?? "").split(/[-–,]/).map((x) => x.trim()).filter(Boolean)
    const dia = dias[dias.length - 1]
    if (!dia || !/^\d{1,2}$/.test(dia)) continue
    out.push({
      type: "FOMC",
      date: `${e.month}-${dia.padStart(2, "0")}`,
      time: hora12(e.time),
      title: decisao ? "Fed Interest Rate Decision" : "FOMC Minutes",
      importance: decisao ? "HIGH" : "MEDIUM",
      fonte: "Fed",
    })
  }
  return out
}

// ─── BEA (ICS) ────────────────────────────────────────────────────────────

/** Eventos do ICS do BEA: PIB (estimativas trimestrais) e rendimento/despesa pessoal (PCE). */
export function lerBea(ics: string): EventoOficial[] {
  const out: EventoOficial[] = []
  // As linhas longas do ICS continuam na seguinte começando por espaço.
  const linhas = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)
  let resumo = ""
  let inicio = ""
  for (const l of linhas) {
    if (l.startsWith("BEGIN:VEVENT")) { resumo = ""; inicio = "" }
    else if (l.startsWith("SUMMARY")) resumo = l.slice(l.indexOf(":") + 1).replace(/\\,/g, ",").trim()
    else if (l.startsWith("DTSTART")) inicio = l.slice(l.indexOf(":") + 1).trim()
    else if (l.startsWith("END:VEVENT")) {
      const m = inicio.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
      if (!m) continue
      const quando = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
      let type: TipoOficial | null = null
      if (/^(GDP \(|Gross Domestic Product,)/i.test(resumo)) type = "GDP"
      else if (/^Personal Income and Outlays/i.test(resumo)) type = "PCE"
      if (!type) continue
      out.push({
        type,
        date: diaEt(quando),
        time: `${horaEt.format(quando)} ET`,
        // "GDP (Second Estimate) and Corporate Profits, 3rd Quarter 2026" → "GDP (Second Estimate)"
        title: type === "GDP" ? resumo.replace(/,.*$/, "").replace(/\s+and\s+.*$/i, "") : "PCE Price Index (Personal Income and Outlays)",
        importance: "HIGH",
        fonte: "BEA",
      })
    }
  }
  return out
}

// ─── Census (vendas a retalho) ────────────────────────────────────────────

const MESES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

/** Tabela "Data Month | Release Date at 8:30 am" da página de datas do Census. */
export function lerCensus(html: string): EventoOficial[] {
  // Só a primeira tabela (Advance Monthly Retail Trade); as seguintes são outros relatórios.
  const ini = html.search(/Advance Monthly Retail/i)
  const fim = ini >= 0 ? html.indexOf("</table>", ini) : -1
  const parte = ini >= 0 ? html.slice(ini, fim > ini ? fim : undefined) : html
  const limpo = parte.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")
  const out: EventoOficial[] = []
  const vistos = new Set<string>()
  // "September 2026 October 15, 2026" — mês dos dados seguido da data de divulgação
  const re = /([A-Z][a-z]+) (\d{4}) ([A-Z][a-z]+) (\d{1,2}), (\d{4})/g
  for (let m = re.exec(limpo); m; m = re.exec(limpo)) {
    const mesDados = MESES.indexOf(m[1].toLowerCase())
    const mes = MESES.indexOf(m[3].toLowerCase())
    if (mesDados < 0 || mes < 0) continue
    const date = `${m[5]}-${String(mes + 1).padStart(2, "0")}-${m[4].padStart(2, "0")}`
    if (vistos.has(date)) continue
    vistos.add(date)
    out.push({ type: "RETAIL_SALES", date, time: "08:30 ET", title: "Retail Sales", importance: "MEDIUM", fonte: "Census" })
  }
  return out
}

// ─── BLS via FRED ─────────────────────────────────────────────────────────

/** Séries de divulgação da FRED: 10 = Consumer Price Index, 50 = Employment Situation. */
const FRED_RELEASES: Array<{ id: number; type: TipoOficial; title: string }> = [
  { id: 10, type: "CPI", title: "CPI" },
  { id: 50, type: "JOBS", title: "Nonfarm Payrolls" },
]

async function datasBls(de: string, ate: string): Promise<EventoOficial[]> {
  const chave = process.env.FRED_API_KEY?.trim()
  if (!chave) return []
  const out: EventoOficial[] = []
  for (const r of FRED_RELEASES) {
    const url = new URL("https://api.stlouisfed.org/fred/release/dates")
    url.searchParams.set("release_id", String(r.id))
    url.searchParams.set("api_key", chave)
    url.searchParams.set("file_type", "json")
    url.searchParams.set("realtime_start", de)
    url.searchParams.set("realtime_end", "9999-12-31")
    url.searchParams.set("include_release_dates_with_no_data", "true")
    const t = await texto(url.toString())
    if (!t) continue
    try {
      const d = JSON.parse(t) as { release_dates?: Array<{ date: string }> }
      for (const x of d.release_dates ?? []) {
        if (x.date >= de && x.date <= ate) {
          out.push({ type: r.type, date: x.date, time: "08:30 ET", title: r.title, importance: "HIGH", fonte: "BLS" })
        }
      }
    } catch {
      /* sem datas do BLS: o Nasdaq cobre */
    }
  }
  return out
}

/** Todos os eventos oficiais entre duas datas (YYYY-MM-DD, inclusive). */
export async function eventosOficiais(de: string, ate: string): Promise<EventoOficial[]> {
  const [fed, bea, census, bls] = await Promise.all([
    texto("https://www.federalreserve.gov/json/calendar.json"),
    texto("https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics"),
    texto("https://www.census.gov/retail/release_schedule.html"),
    datasBls(de, ate),
  ])
  const todos = [
    ...(fed ? lerFed(fed) : []),
    ...(bea ? lerBea(bea) : []),
    ...(census ? lerCensus(census) : []),
    ...bls,
  ]
  return todos.filter((e) => e.date >= de && e.date <= ate)
}
