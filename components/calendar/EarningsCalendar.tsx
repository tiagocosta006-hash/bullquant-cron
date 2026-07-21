"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Sunrise, Moon, TrendingUp, TrendingDown, HelpCircle, Sun, Banknote, Layers, Landmark, CalendarClock, Percent, Users, BarChart3, ShoppingCart, Gauge } from "lucide-react"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CompanyLogo } from "@/components/ui/CompanyLogo"
import { cn } from "@/lib/utils"

interface EarningsItem {
  kind: "earnings"
  id: string
  date: string // YYYY-MM-DD
  hour: "BMO" | "AMC" | "DMH" | "UNKNOWN"
  fiscalYear: number
  fiscalQuarter: number
  epsEstimate: number | null
  epsActual: number | null
  revenueEstimate: number | null
  revenueActual: number | null
  ticker: string
  name: string
  logoUrl: string | null
  employees?: number | null
}

interface CorporateItem {
  kind: "corporate"
  id: string
  type: "DIVIDEND" | "SPLIT" | "AGM" | "INVESTOR_DAY" | "IPO"
  date: string // ex-date para dividendos
  payDate: string | null
  amount: number | null
  splitRatio: string | null
  note: string | null
  ticker: string
  name: string
  logoUrl: string | null
  employees?: number | null
}

interface MacroItem {
  kind: "macro"
  id: string
  type: "FOMC" | "CPI" | "JOBS" | "GDP" | "PCE" | "RETAIL_SALES" | "OTHER"
  date: string
  time: string | null
  title: string
  importance: "LOW" | "MEDIUM" | "HIGH"
  country: string
  actual: string | null
  estimate: string | null
  previous: string | null
}

type CalendarItem = EarningsItem | CorporateItem | MacroItem

type Scope = "all" | "watchlist" | "portfolio"
type ViewMode = "month" | "week" | "day"
type EventFilter = "earnings" | "dividend" | "split" | "macro"
const ALL_FILTERS: EventFilter[] = ["earnings", "dividend", "split", "macro"]
const FILTERS_STORAGE_KEY = "bq_calendar_filters"

function matchesFilter(e: CalendarItem, filters: Set<EventFilter>): boolean {
  if (e.kind === "earnings") return filters.has("earnings")
  if (e.kind === "macro") return filters.has("macro")
  // corporate
  if (e.type === "DIVIDEND") return filters.has("dividend")
  if (e.type === "SPLIT") return filters.has("split")
  return filters.has("split") // AGM/INVESTOR_DAY/IPO agrupados com "outros corporativos"
}

const fmtDate = (d: Date) => {
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
const addMonths = (d: Date, m: number) => new Date(d.getFullYear(), d.getMonth() + m, d.getDate())

// ─────────────────────────────────────────────────────────────
// DEV DEMO: dados ilustrativos para ver o calendário sem BD/ingest.
// Só ativa em `next dev` (NODE_ENV !== production) e só quando a API
// não devolve nada. Em produção, ou com dados reais, isto nunca corre.
// ─────────────────────────────────────────────────────────────
const DEMO_TICKERS = [
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "MSFT", name: "Microsoft Corp." },
  { ticker: "GOOGL", name: "Alphabet Inc." },
  { ticker: "AMZN", name: "Amazon.com Inc." },
  { ticker: "NVDA", name: "NVIDIA Corp." },
  { ticker: "META", name: "Meta Platforms Inc." },
  { ticker: "TSLA", name: "Tesla Inc." },
  { ticker: "JPM", name: "JPMorgan Chase & Co." },
  { ticker: "V", name: "Visa Inc." },
  { ticker: "KO", name: "The Coca-Cola Company" },
  { ticker: "WMT", name: "Walmart Inc." },
  { ticker: "O", name: "Realty Income Corp." },
]

function makeDemoEvents(monthStart: Date): EarningsItem[] {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const daysInMonth = endOfMonth(monthStart).getDate()
  const todayStr = fmtDate(new Date())
  const hours: EarningsItem["hour"][] = ["BMO", "AMC", "AMC", "BMO"]
  const picks = [3, 6, 6, 9, 13, 16, 20, 23, 27, 29]

  return picks.map((dayNum, i) => {
    const day = Math.min(dayNum, daysInMonth)
    const date = new Date(year, month, day)
    const dateStr = fmtDate(date)
    const co = DEMO_TICKERS[i % DEMO_TICKERS.length]
    const reported = dateStr < todayStr
    const epsEstimate = 0.8 + (i % 5) * 0.35
    const epsActual = reported ? epsEstimate + (i % 2 === 0 ? 0.12 : -0.07) : null
    return {
      kind: "earnings" as const,
      id: `demo-${dateStr}-${co.ticker}`,
      date: dateStr,
      hour: hours[i % hours.length],
      fiscalYear: year,
      fiscalQuarter: Math.floor(month / 3) + 1,
      epsEstimate,
      epsActual,
      revenueEstimate: null,
      revenueActual: null,
      ticker: co.ticker,
      name: co.name,
      logoUrl: null,
    }
  })
}

function loadStoredFilters(): Set<EventFilter> {
  if (typeof window === "undefined") return new Set(ALL_FILTERS)
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw) return new Set(ALL_FILTERS)
    const parsed = JSON.parse(raw)
    const valid = Array.isArray(parsed) ? parsed.filter((f): f is EventFilter => ALL_FILTERS.includes(f)) : []
    return valid.length > 0 ? new Set(valid) : new Set(ALL_FILTERS)
  } catch {
    return new Set(ALL_FILTERS)
  }
}

export function EarningsCalendar() {
  const t = useTranslations("calendar")
  const [cursor, setCursor] = useState(() => new Date())
  const [scope, setScope] = useState<Scope>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [events, setEvents] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Set<EventFilter>>(() => loadStoredFilters())

  const toggleFilter = (f: EventFilter) => {
    setFilters(prev => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      const toStore = next.size > 0 ? next : new Set(ALL_FILTERS)
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify([...toStore]))
      return next
    })
  }

  // Fetch block is always monthly based on cursor's month
  const monthStart = useMemo(() => startOfMonth(cursor), [cursor])
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const params = new URLSearchParams({ from: fmtDate(monthStart), to: fmtDate(monthEnd) })
      if (scope !== "all") params.set("scope", scope)
      const isDev = process.env.NODE_ENV !== "production"
      try {
        const res = await fetch(`/api/calendar?${params.toString()}`)
        const data: CalendarItem[] = res.ok ? await res.json() : []
        const real = Array.isArray(data) ? data : []
        // Demo fallback só faz sentido no scope "all" — em "watchlist" um
        // resultado vazio é um estado real (sem itens seguidos ou sem
        // resultados agendados) e não deve ser mascarado com dados fictícios.
        if (active) setEvents(real.length === 0 && isDev && scope === "all" ? makeDemoEvents(monthStart) : real)
      } catch {
        if (active) setEvents(isDev ? makeDemoEvents(monthStart) : [])
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [monthStart, monthEnd, scope])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const e of events) {
      if (!matchesFilter(e, filters)) continue
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }

    // Ordenar por relevância (macro primeiro, depois por nº de empregados)
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.kind === "macro" && b.kind !== "macro") return -1
        if (b.kind === "macro" && a.kind !== "macro") return 1
        const empA = a.kind !== "macro" ? (a.employees ?? 0) : 0
        const empB = b.kind !== "macro" ? (b.employees ?? 0) : 0
        return empB - empA
      })
    }

    return map
  }, [events, filters])

  const todayStr = fmtDate(new Date())

  const goPrev = () => {
    if (viewMode === "month") setCursor(addMonths(cursor, -1))
    else if (viewMode === "week") setCursor(addDays(cursor, -7))
    else setCursor(addDays(cursor, -1))
  }
  
  const goNext = () => {
    if (viewMode === "month") setCursor(addMonths(cursor, 1))
    else if (viewMode === "week") setCursor(addDays(cursor, 7))
    else setCursor(addDays(cursor, 1))
  }
  
  const goToday = () => setCursor(new Date())

  const scopeBtn = (value: Scope, label: string) => (
    <button
      onClick={() => setScope(value)}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        scope === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )

  const viewBtn = (value: ViewMode, label: string) => (
    <button
      onClick={() => setViewMode(value)}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        viewMode === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )

  const filterBtn = (value: EventFilter, label: string, Icon: React.ElementType) => (
    <button
      onClick={() => toggleFilter(value)}
      aria-pressed={filters.has(value)}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        filters.has(value)
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground hover:bg-muted/70"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )

  // Labels for the header
  let headerLabel = ""
  if (viewMode === "month") {
    headerLabel = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(cursor)
  } else if (viewMode === "week") {
    const firstWeekday = (cursor.getDay() + 6) % 7
    const wStart = addDays(cursor, -firstWeekday)
    const wEnd = addDays(wStart, 6)
    const m1 = new Intl.DateTimeFormat("pt-PT", { month: "short" }).format(wStart)
    const m2 = new Intl.DateTimeFormat("pt-PT", { month: "short" }).format(wEnd)
    if (m1 === m2) {
      headerLabel = `${wStart.getDate()} - ${wEnd.getDate()} ${m1} ${wStart.getFullYear()}`
    } else {
      headerLabel = `${wStart.getDate()} ${m1} - ${wEnd.getDate()} ${m2}`
    }
  } else {
    headerLabel = new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(cursor)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-bold text-lg capitalize min-w-[11rem] text-center">{headerLabel}</span>
          <button
            onClick={goNext}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={goToday}
            className="ml-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors hidden sm:block"
          >
            {t("today")}
          </button>
        </div>
        
        <div className="flex items-center gap-3 overflow-x-auto">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-card shrink-0">
            {viewBtn("day", "Dia")}
            {viewBtn("week", "Semana")}
            {viewBtn("month", "Mês")}
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-card shrink-0">
            {scopeBtn("all", t("scopeAll"))}
            {scopeBtn("watchlist", t("scopeWatchlist"))}
            {scopeBtn("portfolio", t("scopePortfolio"))}
          </div>
        </div>
      </div>

      {/* Filtros por tipo de evento */}
      <div className="flex flex-wrap items-center gap-2">
        {filterBtn("earnings", t("filterEarnings"), TrendingUp)}
        {filterBtn("dividend", t("filterDividend"), Banknote)}
        {filterBtn("split", t("filterSplit"), Layers)}
        {filterBtn("macro", t("filterMacro"), Landmark)}
      </div>

      {/* Resumo + legenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium">
          {t("summary", { count: [...byDay.values()].reduce((sum, arr) => sum + arr.length, 0) })}
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Sunrise className="h-3.5 w-3.5" /> Antes da Abertura
          </span>
          <span className="flex items-center gap-1.5">
            <Sun className="h-3.5 w-3.5" /> Durante a Sessão
          </span>
          <span className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5" /> Após o Fecho
          </span>
        </div>
      </div>

      {viewMode === "month" && <MonthView cursor={cursor} byDay={byDay} loading={loading} todayStr={todayStr} />}
      {viewMode === "week" && <WeekView cursor={cursor} byDay={byDay} loading={loading} todayStr={todayStr} />}
      {viewMode === "day" && <DayView cursor={cursor} byDay={byDay} loading={loading} todayStr={todayStr} />}

      {!loading && byDay.size === 0 && viewMode === "month" && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      )}
    </div>
  )
}

interface ViewProps {
  cursor: Date
  byDay: Map<string, CalendarItem[]>
  loading: boolean
  todayStr: string
}

function MonthView({ cursor, byDay, loading, todayStr }: ViewProps) {
  const t = useTranslations("calendar")
  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat("pt-PT", { weekday: "short" }).format(new Date(2024, 0, 1 + i))),
    []
  )
  
  const cells = useMemo(() => {
    const firstWeekday = (monthStart.getDay() + 6) % 7
    const daysInMonth = monthEnd.getDate()
    const out: (Date | null)[] = []
    for (let i = 0; i < firstWeekday; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [monthStart, monthEnd, cursor])

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Em mobile o mês (7 colunas) scrolla na horizontal para as células não ficarem esmagadas */}
      <div className="overflow-x-auto" data-native-scroll>
        <div className="min-w-[42rem] md:min-w-0">
      <div className="grid grid-cols-7 bg-muted/50">
        {weekdays.map(w => (
          <div key={w} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="min-h-[7rem] md:min-h-[9rem] border-t border-l border-border bg-muted/20" />
          const dayStr = fmtDate(day)
          const dayEvents = byDay.get(dayStr) ?? []
          const isToday = dayStr === todayStr
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div
              key={dayStr}
              className={`min-h-[7rem] md:min-h-[9rem] border-t border-l border-border p-2 flex flex-col transition-colors ${
                isWeekend ? "bg-muted/20" : ""
              } ${isToday ? "ring-1 ring-inset ring-primary/40" : ""}`}
            >
              <div
                className={`text-sm font-medium mb-1.5 ${
                  isToday
                    ? "self-start rounded-full bg-primary text-primary-foreground w-6 h-6 flex items-center justify-center font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </div>
              {loading ? (
                <div className="space-y-1">
                  <div className="h-5 rounded bg-muted animate-pulse" />
                  {idx % 3 === 0 && <div className="h-5 rounded bg-muted animate-pulse w-2/3" />}
                </div>
              ) : (
                <div className="space-y-1 overflow-hidden">
                  {dayEvents.slice(0, 4).map((e) => (
                    <EventChip key={e.id} e={e} />
                  ))}
                  {dayEvents.length > 4 && (
                    <Dialog>
                      {/* @ts-ignore - shadcn base-ui migration */}
                      <DialogTrigger asChild>
                        <button className="text-xs text-muted-foreground px-1.5 text-left hover:underline w-full mt-0.5">
                          +{dayEvents.length - 4} {t("more")}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[85vh] overflow-y-auto max-w-sm">
                        <DialogHeader>
                          <DialogTitle>
                            {new Intl.DateTimeFormat("pt-PT", { dateStyle: "full" }).format(day)}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-1 mt-2">
                          {dayEvents.map((e) => (
                            <EventChip key={e.id} e={e} />
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
        </div>
      </div>
    </div>
  )
}

function WeekView({ cursor, byDay, loading, todayStr }: ViewProps) {
  const firstWeekday = (cursor.getDay() + 6) % 7 // 0 = Seg
  const wStart = addDays(cursor, -firstWeekday)
  
  const days = Array.from({ length: 7 }, (_, i) => addDays(wStart, i))

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Em mobile a semana (7 colunas) scrolla na horizontal */}
      <div className="overflow-x-auto" data-native-scroll>
        <div className="min-w-[42rem] md:min-w-0">
      <div className="grid grid-cols-7 bg-muted/50">
        {days.map(day => (
          <div key={day.toISOString()} className="p-2 text-center flex flex-col items-center">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {new Intl.DateTimeFormat("pt-PT", { weekday: "short" }).format(day)}
            </span>
            <span className={`mt-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              fmtDate(day) === todayStr ? "bg-primary text-primary-foreground" : "text-foreground"
            }`}>
              {day.getDate()}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-border">
        {days.map(day => {
          const dayStr = fmtDate(day)
          const dayEvents = byDay.get(dayStr) ?? []
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          
          const bmo = dayEvents.filter((e) => e.kind === "earnings" && e.hour === "BMO")
          const amc = dayEvents.filter((e) => e.kind === "earnings" && e.hour === "AMC")
          const other = dayEvents.filter((e) => e.kind !== "earnings" || (e.hour !== "BMO" && e.hour !== "AMC"))
          
          return (
            <div key={dayStr} className={`min-h-[20rem] border-l border-border p-2 flex flex-col gap-4 ${isWeekend ? "bg-muted/10" : ""}`}>
              {loading ? (
                <div className="space-y-2 mt-2">
                  <div className="h-8 rounded bg-muted animate-pulse" />
                  <div className="h-8 rounded bg-muted animate-pulse" />
                </div>
              ) : (
                <>
                  <HourGroup events={bmo} icon={Sunrise} label="BMO" />
                  <HourGroup events={amc} icon={Moon} label="AMC" />
                  <HourGroup events={other} icon={Sun} label="Outros" />
                </>
              )}
            </div>
          )
        })}
      </div>
        </div>
      </div>
    </div>
  )
}

function HourGroup({ events, icon: Icon, label }: { events: CalendarItem[], icon: React.ElementType, label: string }) {
  if (!events || events.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground border-b border-border/50 pb-1">
        <Icon className="h-3 w-3" />
        {label} <span className="ml-auto bg-muted px-1.5 py-0.5 rounded-sm">{events.length}</span>
      </div>
      <div className="space-y-0.5">
        {events.slice(0, 10).map((e) => (
          <EventChip key={e.id} e={e} />
        ))}
        {events.length > 10 && (
          <div className="text-[10px] text-muted-foreground px-1 py-1">+{events.length - 10} mais</div>
        )}
      </div>
    </div>
  )
}

function DayView({ cursor, byDay, loading }: ViewProps) {
  const dayStr = fmtDate(cursor)
  const dayEvents = byDay.get(dayStr) ?? []
  
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-xl border border-border bg-muted/20 animate-pulse" />
        <div className="h-32 rounded-xl border border-border bg-muted/20 animate-pulse" />
      </div>
    )
  }
  
  if (dayEvents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
        Não há apresentações de resultados agendadas para este dia.
      </div>
    )
  }
  
  const bmo = dayEvents.filter((e) => e.kind === "earnings" && e.hour === "BMO")
  const amc = dayEvents.filter((e) => e.kind === "earnings" && e.hour === "AMC")
  const dmh = dayEvents.filter((e) => e.kind === "earnings" && e.hour === "DMH")
  const other = dayEvents.filter((e) => e.kind !== "earnings" || e.hour === "UNKNOWN")

  return (
    <div className="space-y-6">
      <DayHourSection title="Antes da Abertura (BMO)" icon={Sunrise} events={bmo} />
      <DayHourSection title="Durante a Sessão (DMH)" icon={Sun} events={dmh} />
      <DayHourSection title="Após o Fecho (AMC)" icon={Moon} events={amc} />
      <DayHourSection title="Outros Eventos" icon={HelpCircle} events={other} />
    </div>
  )
}

function DayHourSection({ title, icon: Icon, events }: { title: string, icon: React.ElementType, events: CalendarItem[] }) {
  if (!events || events.length === 0) return null
  
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-background border border-border/50 text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold">{title}</h3>
        <span className="ml-auto text-xs font-medium bg-background px-2 py-1 rounded-md border border-border/50">
          {events.length} {events.length === 1 ? "Empresa" : "Empresas"}
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {events.map((e) => (
          <DayEventCard key={e.id} e={e} />
        ))}
      </div>
    </div>
  )
}

const formatCurrency = (val: number | null) => {
  if (val === null) return "-"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(val)
}

const formatCompact = (val: number | null) => {
  if (val === null) return "-"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(val)
}

const CORPORATE_TYPE_LABEL: Record<CorporateItem["type"], string> = {
  DIVIDEND: "Dividendo",
  SPLIT: "Stock Split",
  AGM: "Assembleia Geral",
  INVESTOR_DAY: "Investor Day",
  IPO: "IPO",
}

const MACRO_TYPE_LABEL: Record<MacroItem["type"], string> = {
  FOMC: "Decisão FOMC (Fed)",
  CPI: "Inflação (CPI)",
  JOBS: "Emprego (Payrolls)",
  GDP: "PIB (GDP)",
  PCE: "Inflação (PCE)",
  RETAIL_SALES: "Vendas a Retalho",
  OTHER: "Evento Macro",
}

/** Um ícone por tipo de evento macro — antes eram todos `Landmark`,
 *  indistinguíveis entre si num relance sobre o calendário. */
const MACRO_TYPE_ICON: Record<MacroItem["type"], React.ElementType> = {
  FOMC: Landmark,
  CPI: Percent,
  JOBS: Users,
  GDP: BarChart3,
  PCE: Gauge,
  RETAIL_SALES: ShoppingCart,
  OTHER: CalendarClock,
}

/** Marcador de importância — um ponto dourado discreto, não uma recolorização
 *  de ícone/texto (bull/bear ficam reservados a subida/descida de mercado). */
function ImportanceDot({ importance }: { importance: MacroItem["importance"] }) {
  if (importance !== "HIGH") return null
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
}

/** Equivalente ao CompanyLogo para eventos sem empresa (macro): mesmo slot
 *  quadrado com moldura e fundo dourado suave, ícone específico do tipo em vez de imagem. */
function MacroIconTile({ type, size = 20, className }: { type: MacroItem["type"]; size?: number; className?: string }) {
  const Icon = MACRO_TYPE_ICON[type]
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/50 bg-primary/10",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Icon className="h-1/2 w-1/2 text-primary" />
    </div>
  )
}

/** Ícone + rótulo curto usados tanto no chip do mês/semana como no card do dia. */
function EventTriggerContent({ e }: { e: CalendarItem }) {
  if (e.kind === "earnings") {
    const reported = e.epsActual !== null && e.epsEstimate !== null
    const beat = reported && e.epsActual! >= e.epsEstimate!
    const HourIcon = e.hour === "BMO" ? Sunrise : e.hour === "AMC" ? Moon : null
    return (
      <>
        {e.logoUrl ? (
          <CompanyLogo src={e.logoUrl} alt="" fallback={e.ticker} size={20} className="rounded-sm" imgClassName="p-0" />
        ) : HourIcon ? (
          <HourIcon className="h-4 w-4 shrink-0 opacity-60" />
        ) : null}
        <span className="truncate text-foreground">{e.ticker}</span>
        {reported && (
          beat ? <TrendingUp className="h-3.5 w-3.5 shrink-0 text-bull" /> : <TrendingDown className="h-3.5 w-3.5 shrink-0 text-bear" />
        )}
      </>
    )
  }

  if (e.kind === "corporate") {
    const Icon = e.type === "DIVIDEND" ? Banknote : e.type === "SPLIT" ? Layers : CalendarClock
    return (
      <>
        {e.logoUrl ? (
          <CompanyLogo src={e.logoUrl} alt="" fallback={e.ticker} size={20} className="rounded-sm" imgClassName="p-0" />
        ) : (
          <Icon className="h-4 w-4 shrink-0 opacity-60" />
        )}
        <span className="truncate text-foreground">{e.ticker}</span>
        {e.type === "DIVIDEND" && e.amount !== null && (
          <span className="text-xs text-bull shrink-0">{formatCurrency(e.amount)}</span>
        )}
        {e.type === "SPLIT" && e.splitRatio && (
          <span className="text-xs text-muted-foreground shrink-0">{e.splitRatio}</span>
        )}
      </>
    )
  }

  // macro
  const MacroIcon = MACRO_TYPE_ICON[e.type]
  return (
    <>
      <MacroIcon className="h-4 w-4 shrink-0 opacity-60" />
      <span className="truncate text-foreground">{MACRO_TYPE_LABEL[e.type]}</span>
      <ImportanceDot importance={e.importance} />
    </>
  )
}

/** Corpo detalhado do Dialog, partilhado entre EventChip (mês/semana) e DayEventCard (dia). */
function EventDialogBody({ e }: { e: CalendarItem }) {
  if (e.kind === "earnings") {
    const reported = e.epsActual !== null && e.epsEstimate !== null
    const beat = reported && e.epsActual! >= e.epsEstimate!
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {e.logoUrl && (
              <CompanyLogo src={e.logoUrl} alt="" fallback={e.ticker} size={20} className="rounded-sm" imgClassName="p-0" />
            )}
            {e.name} ({e.ticker})
          </DialogTitle>
          <DialogDescription>
            Q{e.fiscalQuarter} {e.fiscalYear} · {e.hour === "BMO" ? "Antes da Abertura" : e.hour === "AMC" ? "Após o Fecho" : e.hour}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="rounded-xl border border-border p-3 flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">Earnings Per Share</span>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-muted-foreground">Estimativa</span>
              <span className="font-medium">{formatCurrency(e.epsEstimate)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-border/50 pt-1">
              <span className="text-muted-foreground">Reportado</span>
              <span className={`font-semibold ${reported ? (beat ? "text-bull" : "text-bear") : ""}`}>
                {formatCurrency(e.epsActual)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 flex flex-col">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">Revenue</span>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-muted-foreground">Estimativa</span>
              <span className="font-medium">{formatCompact(e.revenueEstimate)}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-t border-border/50 pt-1">
              <span className="text-muted-foreground">Reportado</span>
              <span className={`font-semibold ${e.revenueActual !== null && e.revenueEstimate !== null ? (e.revenueActual >= e.revenueEstimate ? "text-bull" : "text-bear") : ""}`}>
                {formatCompact(e.revenueActual)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between items-center mt-4">
          <DialogClose render={<Button variant="ghost" />}>Fechar</DialogClose>
          <Link href={`/stock/${e.ticker}`} prefetch={false}>
            <Button>Ver {e.ticker} no Terminal</Button>
          </Link>
        </DialogFooter>
      </>
    )
  }

  if (e.kind === "corporate") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {e.logoUrl && (
              <CompanyLogo src={e.logoUrl} alt="" fallback={e.ticker} size={20} className="rounded-sm" imgClassName="p-0" />
            )}
            {e.name} ({e.ticker})
          </DialogTitle>
          <DialogDescription>{CORPORATE_TYPE_LABEL[e.type]}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border p-3 flex flex-col gap-1.5 text-sm py-2">
          {e.type === "DIVIDEND" && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ex-Dividend Date</span>
                <span className="font-medium">{e.date}</span>
              </div>
              {e.payDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data de Pagamento</span>
                  <span className="font-medium">{e.payDate}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/50 pt-1.5">
                <span className="text-muted-foreground">Dividendo / Ação</span>
                <span className="font-semibold text-bull">{formatCurrency(e.amount)}</span>
              </div>
            </>
          )}
          {e.type === "SPLIT" && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ratio</span>
              <span className="font-semibold">{e.splitRatio ?? "-"}</span>
            </div>
          )}
          {(e.type === "AGM" || e.type === "INVESTOR_DAY" || e.type === "IPO") && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">{e.date}</span>
            </div>
          )}
          {e.note && <p className="text-xs text-muted-foreground pt-1.5 border-t border-border/50">{e.note}</p>}
        </div>

        <DialogFooter className="sm:justify-between items-center mt-4">
          <DialogClose render={<Button variant="ghost" />}>Fechar</DialogClose>
          <Link href={`/stock/${e.ticker}`} prefetch={false}>
            <Button>Ver {e.ticker} no Terminal</Button>
          </Link>
        </DialogFooter>
      </>
    )
  }

  // macro
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MacroIconTile type={e.type} />
          {e.title}
          <ImportanceDot importance={e.importance} />
        </DialogTitle>
        <DialogDescription>
          {MACRO_TYPE_LABEL[e.type]} · {e.country}
          {e.time ? ` · ${e.time}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="rounded-xl border border-border p-3 flex flex-col gap-1.5 text-sm py-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Anterior</span>
          <span className="font-medium">{e.previous ?? "-"}</span>
        </div>
        <div className="flex justify-between border-t border-border/50 pt-1.5">
          <span className="text-muted-foreground">Atual</span>
          <span className="font-semibold">{e.actual ?? "-"}</span>
        </div>
      </div>

      {e.type === "FOMC" && (
        <p className="text-xs text-muted-foreground">
          Decisões de taxas do Fed movem o discount rate — afetam diretamente o WACC usado na tua calculadora DCF.
        </p>
      )}

      <DialogFooter className="justify-end mt-4">
        <DialogClose render={<Button variant="ghost" />}>Fechar</DialogClose>
      </DialogFooter>
    </>
  )
}

function DayEventCard({ e }: { e: CalendarItem }) {
  const ticker = e.kind !== "macro" ? e.ticker : null
  const name = e.kind !== "macro" ? e.name : e.title
  const logoUrl = e.kind !== "macro" ? e.logoUrl : null

  return (
    <Dialog>
      {/* @ts-ignore - shadcn base-ui migration */}
      <DialogTrigger asChild>
        <button className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background hover:bg-muted/50 hover:border-border transition-all text-left group">
          {ticker ? (
            <CompanyLogo src={logoUrl} alt="" fallback={ticker} size={40} className="rounded-md" />
          ) : (
            <MacroIconTile type={(e as MacroItem).type} size={40} className="rounded-md" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm truncate">{ticker ?? MACRO_TYPE_LABEL[(e as MacroItem).type]}</span>
              {e.kind === "earnings" && e.epsActual !== null && e.epsEstimate !== null && (
                e.epsActual >= e.epsEstimate ? <TrendingUp className="h-3.5 w-3.5 text-bull shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 text-bear shrink-0" />
              )}
              {e.kind === "macro" && <ImportanceDot importance={e.importance} />}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={name}>{name}</p>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <EventDialogBody e={e} />
      </DialogContent>
    </Dialog>
  )
}

function EventChip({ e }: { e: CalendarItem }) {
  const title = e.kind === "macro" ? e.title : `${e.name} · ${e.kind === "earnings" ? `Q${e.fiscalQuarter} ${e.fiscalYear}` : CORPORATE_TYPE_LABEL[e.type]}`

  return (
    <Dialog>
      <DialogTrigger
        title={title}
        className="w-full text-left group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold truncate transition-colors hover:bg-muted"
      >
        <EventTriggerContent e={e} />
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <EventDialogBody e={e} />
      </DialogContent>
    </Dialog>
  )
}
