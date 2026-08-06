"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Lock, Loader2, Scale, Info } from "lucide-react"
import {
  LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid
} from "recharts"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TooltipProvider, Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { buildPriceVsEarnings, type PriceEarningsRow, type IndexedPoint } from "@/lib/finance/priceVsEarnings"

const RANGES = ["3Y", "5Y", "10Y", "MAX"] as const
type Range = typeof RANGES[number]

const PRICE_COLOR = "var(--chart-5)"
const EARNINGS_COLOR = "var(--chart-1)"

export function PriceVsEarnings({
  ticker,
  isPro,
  isLoggedIn,
  currencySymbol = "$",
}: {
  ticker: string
  isPro?: boolean
  isLoggedIn?: boolean
  currencySymbol?: string
}) {
  const t = useTranslations("stock.priceVsEarnings")
  const tGate = useTranslations("stock.proGate")
  const locale = useLocale()
  const [rows, setRows] = useState<PriceEarningsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>("10Y")
  // null = segue a sugestão automática da janela atual; true/false = escolha
  // explícita do utilizador, que passa a mandar.
  const [logOverride, setLogOverride] = useState<boolean | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await fetch(`/api/valuation/${ticker}`)
        if (res.ok) {
          const json: PriceEarningsRow[] = await res.json()
          setRows(json)
        }
      } catch (error) {
        console.error("Failed to fetch price vs earnings:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [ticker])

  const {
    data, priceCagr, earningsCagr, priceTotal, earningsTotal, years,
    baseDate, baseShifted, logAvailable, logSuggested,
  } = useMemo(
    () => buildPriceVsEarnings(rows, range === "MAX" ? null : Number(range.replace("Y", ""))),
    [rows, range],
  )

  const formatDate = (val: string) => {
    const d = new Date(val)
    return new Intl.DateTimeFormat(locale, { month: "numeric", year: "2-digit" }).format(d)
  }

  const formatFullDate = (val: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(val))

  const formatCompact = (val: number) => {
    const abs = Math.abs(val)
    const formatted = new Intl.NumberFormat("en-US", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(abs)
    return val < 0 ? `-${currencySymbol}${formatted}` : `${currencySymbol}${formatted}`
  }

  const formatPct = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return "N/A"
    return `${val >= 0 ? "+" : "-"}${(Math.abs(val) * 100).toFixed(1)}%`
  }

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (data.length === 0) return null

  // Gap: quanto o preço cresceu ACIMA dos lucros, em pontos percentuais de
  // CAGR. Positivo = expansão de múltiplo (o mercado paga mais por cada
  // unidade de lucro do que pagava na data-base).
  const gap = priceCagr !== null && earningsCagr !== null ? priceCagr - earningsCagr : null
  const verdict = gap === null ? null : gap > 0.02 ? "priceAhead" : gap < -0.02 ? "earningsAhead" : "inLine"

  const useLog = logAvailable && (logOverride ?? logSuggested)
  // O eixo log precisa de domínio explícito — com ['auto','auto'] o recharts
  // devolve ticks vazios em escala logarítmica.
  const idxValues = data.flatMap(d => [d.priceIdx, d.earningsIdx])
  const logDomain: [number, number] = [
    Math.max(0.01, Math.min(...idxValues) * 0.85),
    Math.max(...idxValues) * 1.15,
  ]

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Scale className="w-5 h-5 text-primary" />
              {t("title")}
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className="cursor-help inline-flex text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        aria-label={t("methodologyLabel")}
                      >
                        <Info className="w-4 h-4" />
                      </span>
                    }
                  />
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {t("methodology")}
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40">
              {RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => {
                    setRange(r)
                    setLogOverride(null)
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                    range === r ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "MAX" ? t("rangeMax") : r}
                </button>
              ))}
            </div>
            {logAvailable && (
              <button
                onClick={() => setLogOverride(!(logOverride ?? logSuggested))}
                title={t("logHint")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-all ${
                  (logOverride ?? logSuggested)
                    ? "bg-background text-foreground border-border shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-border/40 hover:text-foreground"
                }`}
              >
                {t("logToggle")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 relative">
        {/* Gating alinhado com o resto da aba de avaliação */}
        {!isPro && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[4px] p-6 text-center">
            <div className="bg-muted p-4 rounded-full mb-4">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            {isLoggedIn ? (
              <>
                <h3 className="text-xl font-bold mb-2">{tGate("title")}</h3>
                <p className="text-muted-foreground max-w-md mb-6">{tGate("desc", { ticker })}</p>
                <Link href="/pricing">
                  <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">{tGate("upgradeCta")}</Button>
                </Link>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-2">{tGate("guestTitle")}</h3>
                <p className="text-muted-foreground max-w-md mb-6">{tGate("guestDesc", { ticker })}</p>
                <Link href="/register">
                  <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">{tGate("guestCta")}</Button>
                </Link>
              </>
            )}
          </div>
        )}

        <div className={!isPro ? "opacity-30 pointer-events-none blur-[2px]" : ""}>
          {/* Sumário: o gráfico mostra a forma, estes números dão o veredicto */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-3 w-0.5 rounded-full shrink-0" style={{ backgroundColor: PRICE_COLOR }} />
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {years >= 1 ? t("priceCagr") : t("priceChange")}
                </p>
              </div>
              <p className="nums text-xl font-bold text-foreground">
                {years >= 1 ? formatPct(priceCagr) : formatPct(priceTotal)}
              </p>
            </div>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-3 w-0.5 rounded-full shrink-0" style={{ backgroundColor: EARNINGS_COLOR }} />
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {years >= 1 ? t("earningsCagr") : t("earningsChange")}
                </p>
              </div>
              <p className="nums text-xl font-bold text-foreground">
                {years >= 1 ? formatPct(earningsCagr) : formatPct(earningsTotal)}
              </p>
            </div>
            <div className="col-span-2 md:col-span-1 rounded-lg border border-border/40 bg-muted/20 p-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{t("gap")}</p>
              <p className="nums text-xl font-bold text-foreground">
                {gap === null ? "N/A" : `${gap >= 0 ? "+" : "-"}${(Math.abs(gap) * 100).toFixed(1)} pp`}
              </p>
              {verdict && <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{t(`verdict.${verdict}`)}</p>}
            </div>
          </div>

          {/* Legenda sempre presente (2 séries) — identidade nunca só por cor */}
          <div className="flex items-center gap-4 mb-2 text-[13px]">
            <div className="flex items-center gap-2">
              <span className="h-3 w-0.5 rounded-full" style={{ backgroundColor: PRICE_COLOR }} />
              <span className="text-muted-foreground">{t("seriesPrice")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-0.5 rounded-full" style={{ backgroundColor: EARNINGS_COLOR }} />
              <span className="text-muted-foreground">{t("seriesEarnings")}</span>
            </div>
            {baseDate && (
              <span className="ml-auto text-[11px] text-muted-foreground/70 text-right">
                {t("baseNote", { date: formatFullDate(baseDate) })}
                {/* Se a base não é o início da janela, a empresa dava prejuízo
                    lá atrás e indexar a um prejuízo não teria significado */}
                {baseShifted && <> · {t("baseShifted")}</>}
              </span>
            )}
          </div>

          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
              <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickFormatter={formatDate}
                  minTickGap={40}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  scale={useLog ? "log" : "auto"}
                  domain={useLog ? logDomain : ["auto", "auto"]}
                  allowDataOverflow={useLog}
                  tickFormatter={(v: number) => `${Math.round(v)}`}
                  width={55}
                />
                {/* Base 100 — acima da linha as duas séries cresceram */}
                <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.7} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const p = payload[0].payload as IndexedPoint
                    return (
                      <div className="bg-popover/95 supports-[backdrop-filter]:backdrop-blur border border-border rounded-xl shadow-xl p-3 text-popover-foreground min-w-[210px] z-50">
                        <p className="font-medium mb-2 text-xs text-muted-foreground">
                          {label != null ? formatFullDate(String(label)) : ""}
                        </p>
                        <div className="flex flex-col gap-1.5 text-[13px]">
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-0.5 rounded-full shrink-0" style={{ backgroundColor: PRICE_COLOR }} />
                            <span className="text-muted-foreground">{t("seriesPrice")}</span>
                            <span className="nums font-semibold ml-auto pl-4">
                              {currencySymbol}{p.price.toFixed(2)}
                              <span className="text-muted-foreground font-normal ml-1.5">
                                {formatPct(p.priceIdx / 100 - 1)}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-0.5 rounded-full shrink-0" style={{ backgroundColor: EARNINGS_COLOR }} />
                            <span className="text-muted-foreground">{t("seriesEarnings")}</span>
                            <span className="nums font-semibold ml-auto pl-4">
                              {formatCompact(p.netIncome)}
                              <span className="text-muted-foreground font-normal ml-1.5">
                                {formatPct(p.earningsIdx / 100 - 1)}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />
                <Line
                  type="linear"
                  dataKey="priceIdx"
                  name={t("seriesPrice")}
                  stroke={PRICE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: PRICE_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
                {/* stepAfter: o lucro TTM só muda quando sai um relatório —
                    interpolar linearmente inventaria lucro entre trimestres */}
                <Line
                  type="stepAfter"
                  dataKey="earningsIdx"
                  name={t("seriesEarnings")}
                  stroke={EARNINGS_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: EARNINGS_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
