"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Lock, Loader2, Scale, Info, Download } from "lucide-react"
import {
  LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, LabelList
} from "recharts"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TooltipProvider, Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { buildPriceVsEarnings, type PriceEarningsRow, type IndexedPoint } from "@/lib/finance/priceVsEarnings"
import { exportSvgToPng } from "@/lib/exportChart"

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
  const chartRef = useRef<HTMLDivElement>(null)

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
    baseDate, baseShifted, logAvailable, logSuggested, basis,
  } = useMemo(
    () => buildPriceVsEarnings(rows, range === "MAX" ? null : Number(range.replace("Y", ""))),
    [rows, range],
  )

  // Etiquetas de valor sobre a linha dos lucros. O eixo mostra o índice
  // (base 100), portanto sem estas o leitor nunca vê o EPS real — são elas
  // que dão a leitura em dólares sem precisarmos de um segundo eixo.
  // Marcamos só onde o TTM muda (um degrau = um relatório novo) e afastamos
  // as etiquetas o suficiente para não colidirem em janelas longas.
  const labelIndices = useMemo(() => {
    const out = new Set<number>()
    if (data.length === 0) return out
    const minGap = Math.max(1, Math.floor(data.length / 12))
    let last = -Infinity
    let prev: number | null = null
    data.forEach((d, i) => {
      const changed = prev !== null && d.earnings !== prev
      prev = d.earnings
      if (changed && i - last >= minGap) {
        out.add(i)
        last = i
      }
    })
    // O valor mais recente é o que toda a gente procura: entra sempre, e
    // remove-se o anterior se ficasse por cima.
    const lastIdx = data.length - 1
    if (lastIdx - last < minGap) out.delete(last)
    out.add(lastIdx)
    return out
  }, [data])

  const formatDate = (val: string) => {
    const d = new Date(val)
    return new Intl.DateTimeFormat(locale, { month: "numeric", year: "2-digit" }).format(d)
  }

  const formatFullDate = (val: string) =>
    new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(val))

  // A formatação segue a série em uso: EPS é por ação (dois decimais, como o
  // preço), net income é um total (notação compacta, B/M).
  const formatEarnings = (val: number) => {
    const abs = Math.abs(val)
    const body = basis === "eps"
      ? abs.toFixed(2)
      : new Intl.NumberFormat("en-US", {
          notation: "compact", compactDisplay: "short", maximumFractionDigits: 1,
        }).format(abs)
    return val < 0 ? `-${currencySymbol}${body}` : `${currencySymbol}${body}`
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

  // SVG puro, não foreignObject: o export para PNG desenha o SVG serializado
  // num canvas, e foreignObject não rasteriza de forma fiável nos browsers.
  const pill = (key: string, x: number, y: number, text: string, accent: string, atEnd: boolean) => {
    const w = text.length * 6.4 + 12
    const h = 18
    // No último ponto a etiqueta encosta à esquerda do ponto em vez de ficar
    // centrada — centrada, metade dela cairia fora da área desenhável.
    const dx = atEnd ? -w - 6 : -w / 2
    return (
      <g transform={`translate(${x + dx}, ${y - h - 7})`} key={key}>
        <rect width={w} height={h} rx={5} fill="var(--popover)" stroke={accent} strokeWidth={1} strokeOpacity={0.5} />
        <text
          x={w / 2} y={h / 2 + 1} textAnchor="middle" dominantBaseline="middle"
          fontSize={10.5} fontWeight={600} fill="var(--foreground)"
        >
          {text}
        </text>
      </g>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderEarningsLabel = (props: any) => {
    const { x, y, index } = props as { x?: number; y?: number; index?: number }
    if (x == null || y == null || index == null || !labelIndices.has(index)) return null
    const point = data[index]
    if (!point) return null
    return pill(`e-${index}`, x, y, formatEarnings(point.earnings), EARNINGS_COLOR, index === data.length - 1)
  }

  // O preço só leva etiqueta no ponto final: é o número que o leitor procura,
  // e etiquetar uma série diária ponto a ponto seria ruído puro.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderPriceLabel = (props: any) => {
    const { x, y, index } = props as { x?: number; y?: number; index?: number }
    if (x == null || y == null || index !== data.length - 1) return null
    const point = data[index]
    if (!point) return null
    return pill("p-last", x, y, `${currencySymbol}${point.price.toFixed(2)}`, PRICE_COLOR, true)
  }

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
            {/* Só para Pro: o overlay de gating tapa o gráfico mas não o
                cabeçalho, e o export lê o SVG que continua no DOM — sem esta
                condição, um visitante anónimo descarregava o gráfico todo. */}
            {isPro && (
            <button
              onClick={() => {
                if (chartRef.current) {
                  exportSvgToPng(chartRef.current, `${ticker}-preco-vs-lucros.png`, {
                    title: `${ticker} — ${t("seriesPrice")} vs ${t(basis === "eps" ? "seriesEarnings" : "seriesEarningsNetIncome")}`,
                    subtitle: baseDate ? t("baseNote", { date: formatFullDate(baseDate) }) : undefined,
                  })
                }
              }}
              title={t("download")}
              aria-label={t("download")}
              className="flex items-center px-3 py-1.5 text-xs font-semibold rounded-md border border-border/40 bg-muted/50 text-muted-foreground transition-all hover:text-foreground hover:bg-background"
            >
              <Download className="w-3.5 h-3.5" />
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
              <span className="text-muted-foreground">{t(basis === "eps" ? "seriesEarnings" : "seriesEarningsNetIncome")}</span>
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

          <div ref={chartRef} className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
              <LineChart data={data} margin={{ top: 26, right: 18, left: -10, bottom: 0 }}>
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
                            <span className="text-muted-foreground">{t(basis === "eps" ? "seriesEarnings" : "seriesEarningsNetIncome")}</span>
                            <span className="nums font-semibold ml-auto pl-4">
                              {formatEarnings(p.earnings)}
                              <span className="text-muted-foreground font-normal ml-1.5">
                                {formatPct(p.earningsIdx / 100 - 1)}
                              </span>
                            </span>
                          </div>
                          {/* Com as duas séries por ação, o rácio entre elas é o
                              P/E — é isto que a distância vertical representa. */}
                          {basis === "eps" && p.earnings > 0 && (
                            <div className="flex items-center gap-2 pt-1.5 mt-0.5 border-t border-border/50">
                              <span className="text-muted-foreground">{t("tooltipPe")}</span>
                              <span className="nums font-semibold ml-auto pl-4">
                                {(p.price / p.earnings).toFixed(1)}x
                              </span>
                            </div>
                          )}
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
                >
                  <LabelList dataKey="priceIdx" content={renderPriceLabel} />
                </Line>
                {/* stepAfter: o lucro TTM só muda quando sai um relatório —
                    interpolar linearmente inventaria lucro entre trimestres */}
                <Line
                  type="stepAfter"
                  dataKey="earningsIdx"
                  name={t(basis === "eps" ? "seriesEarnings" : "seriesEarningsNetIncome")}
                  stroke={EARNINGS_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: EARNINGS_COLOR, stroke: "var(--background)", strokeWidth: 2 }}
                >
                  <LabelList dataKey="earningsIdx" content={renderEarningsLabel} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
