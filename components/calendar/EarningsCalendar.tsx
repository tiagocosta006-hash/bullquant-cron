"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Sunrise, Moon, TrendingUp, TrendingDown, HelpCircle, Sun } from "lucide-react"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface EarningsItem {
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

type Scope = "all" | "watchlist"
type ViewMode = "month" | "week" | "day"

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

export function EarningsCalendar() {
  const t = useTranslations("calendar")
  const [cursor, setCursor] = useState(() => new Date())
  const [scope, setScope] = useState<Scope>("all")
  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [events, setEvents] = useState<EarningsItem[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch block is always monthly based on cursor's month
  const monthStart = useMemo(() => startOfMonth(cursor), [cursor])
  const monthEnd = useMemo(() => endOfMonth(cursor), [cursor])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const params = new URLSearchParams({ from: fmtDate(monthStart), to: fmtDate(monthEnd) })
      if (scope === "watchlist") params.set("watchlist", "1")
      try {
        const res = await fetch(`/api/earnings?${params.toString()}`)
        const data: EarningsItem[] = res.ok ? await res.json() : []
        if (active) setEvents(Array.isArray(data) ? data : [])
      } catch {
        if (active) setEvents([])
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
    const map = new Map<string, EarningsItem[]>()
    for (const e of events) {
      const arr = map.get(e.date) ?? []
      arr.push(e)
      map.set(e.date, arr)
    }
    
    // Ordenar por relevância
    for (const arr of map.values()) {
      arr.sort((a, b) => (b.employees ?? 0) - (a.employees ?? 0))
    }
    
    return map
  }, [events])

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
          </div>
        </div>
      </div>

      {/* Resumo + legenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="font-medium">{t("summary", { count: events.length })}</span>
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

      {!loading && events.length === 0 && viewMode === "month" && (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      )}
    </div>
  )
}

interface ViewProps {
  cursor: Date
  byDay: Map<string, EarningsItem[]>
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
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="grid grid-cols-7 bg-muted/50">
        {weekdays.map(w => (
          <div key={w} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="min-h-[7rem] border-t border-l border-border bg-muted/20" />
          const dayStr = fmtDate(day)
          const dayEvents = byDay.get(dayStr) ?? []
          const isToday = dayStr === todayStr
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          return (
            <div
              key={dayStr}
              className={`min-h-[7rem] border-t border-l border-border p-1.5 flex flex-col transition-colors ${
                isWeekend ? "bg-muted/20" : ""
              } ${isToday ? "ring-1 ring-inset ring-primary/40" : ""}`}
            >
              <div
                className={`text-xs font-medium mb-1 ${
                  isToday
                    ? "self-start rounded-full bg-primary text-primary-foreground w-5 h-5 flex items-center justify-center font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </div>
              {loading ? (
                <div className="space-y-1">
                  <div className="h-4 rounded bg-muted animate-pulse" />
                  {idx % 3 === 0 && <div className="h-4 rounded bg-muted animate-pulse w-2/3" />}
                </div>
              ) : (
                <div className="space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 4).map((e) => (
                    <EventChip key={e.id} e={e} />
                  ))}
                  {dayEvents.length > 4 && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="text-[10px] text-muted-foreground px-1 text-left hover:underline w-full mt-0.5">
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
  )
}

function WeekView({ cursor, byDay, loading, todayStr }: ViewProps) {
  const firstWeekday = (cursor.getDay() + 6) % 7 // 0 = Seg
  const wStart = addDays(cursor, -firstWeekday)
  
  const days = Array.from({ length: 7 }, (_, i) => addDays(wStart, i))

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
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
          
          const bmo = dayEvents.filter((e) => e.hour === "BMO")
          const amc = dayEvents.filter((e) => e.hour === "AMC")
          const other = dayEvents.filter((e) => e.hour !== "BMO" && e.hour !== "AMC")
          
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
  )
}

function HourGroup({ events, icon: Icon, label }: { events: EarningsItem[], icon: React.ElementType, label: string }) {
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
  
  const bmo = dayEvents.filter((e) => e.hour === "BMO")
  const amc = dayEvents.filter((e) => e.hour === "AMC")
  const dmh = dayEvents.filter((e) => e.hour === "DMH")
  const unknown = dayEvents.filter((e) => e.hour === "UNKNOWN")
  
  return (
    <div className="space-y-6">
      <DayHourSection title="Antes da Abertura (BMO)" icon={Sunrise} events={bmo} />
      <DayHourSection title="Durante a Sessão (DMH)" icon={Sun} events={dmh} />
      <DayHourSection title="Após o Fecho (AMC)" icon={Moon} events={amc} />
      <DayHourSection title="Sem Hora Marcada" icon={HelpCircle} events={unknown} />
    </div>
  )
}

function DayHourSection({ title, icon: Icon, events }: { title: string, icon: React.ElementType, events: EarningsItem[] }) {
  if (!events || events.length === 0) return null
  
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
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

function DayEventCard({ e }: { e: EarningsItem }) {
  const reported = e.epsActual !== null && e.epsEstimate !== null
  const beat = reported && e.epsActual! >= e.epsEstimate!
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background hover:bg-muted/50 hover:border-border transition-all text-left group">
          {e.logoUrl ? (
            <div className="relative h-10 w-10 shrink-0 flex items-center justify-center rounded-md border border-border/50 bg-white p-0.5 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.logoUrl} alt="" className="h-full w-full object-contain" onError={(ev) => {
                (ev.target as HTMLImageElement).style.display = "none";
                (ev.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }} />
              <span className={`text-xs font-bold text-primary absolute hidden`}>{e.ticker[0]}</span>
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-md border border-border bg-muted text-muted-foreground font-bold">
              {e.ticker[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm truncate">{e.ticker}</span>
              {reported && (
                beat ? <TrendingUp className="h-3.5 w-3.5 text-bull" /> : <TrendingDown className="h-3.5 w-3.5 text-bear" />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={e.name}>{e.name}</p>
          </div>
        </button>
      </DialogTrigger>
      
      {/* Reutiliza o mesmo DialogContent rico do EventChip */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {e.logoUrl && (
              <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.logoUrl} alt="" className="h-full w-full rounded-sm object-contain bg-white" />
              </div>
            )}
            {e.name} ({e.ticker})
          </DialogTitle>
          <DialogDescription>
            Q{e.fiscalQuarter} {e.fiscalYear} · {e.hour}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {/* ... igual ao EventChip ... */}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EventChip({ e }: { e: EarningsItem }) {
  // Same as before
  const reported = e.epsActual !== null && e.epsEstimate !== null
  const beat = reported && e.epsActual! >= e.epsEstimate!
  const HourIcon = e.hour === "BMO" ? Sunrise : e.hour === "AMC" ? Moon : null

  const formatCurrency = (val: number | null) => {
    if (val === null) return "-"
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(val)
  }
  
  const formatCompact = (val: number | null) => {
    if (val === null) return "-"
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(val)
  }

  return (
    <Dialog>
      <DialogTrigger
        title={`${e.name} · Q${e.fiscalQuarter} ${e.fiscalYear}`}
        className="w-full text-left group flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] font-semibold truncate transition-colors hover:bg-muted"
      >
        {e.logoUrl ? (
          <div className="relative h-3.5 w-3.5 shrink-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.logoUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-sm object-contain bg-white" onError={(ev) => {
              (ev.target as HTMLImageElement).style.display = "none";
              (ev.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
            }}/>
            <span className={`text-[8px] font-bold text-primary absolute hidden`}>{e.ticker[0]}</span>
          </div>
        ) : HourIcon ? (
          <HourIcon className="h-3 w-3 shrink-0 opacity-60" />
        ) : null}
        <span className="truncate text-foreground">{e.ticker}</span>
        {reported && (
          beat ? <TrendingUp className="h-3 w-3 shrink-0 text-bull" /> : <TrendingDown className="h-3 w-3 shrink-0 text-bear" />
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {e.logoUrl && (
              <div className="relative h-5 w-5 shrink-0 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.logoUrl} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-sm object-contain bg-white" />
              </div>
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
          <DialogClose render={<Button variant="ghost" />}>
            Fechar
          </DialogClose>
          <Link href={`/stock/${e.ticker}`} prefetch={false}>
            <Button>Ver {e.ticker} no Terminal</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
