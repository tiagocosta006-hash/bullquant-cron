"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Lock, Loader2, LineChart as LineChartIcon } from "lucide-react"
import {
  LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts"
import { Button } from "@/components/ui/button"
import { ChartShareButton } from "./ChartShareButton"

type ValuationData = {
  date: string
  price: number
  pe?: number
  ps?: number
  fcfYield?: number
}

type ValuationMultiplesProps = {
  ticker: string
  isPro?: boolean
  isLoggedIn?: boolean
  isDemo?: boolean
}

/**
 * Séries do valuation histórico — a chave de dados e a cor de cada tab, num
 * sítio só (o gráfico e o cartão de partilha têm de concordar).
 *
 * ⚠️ Estes hex são anteriores ao design system e não são tokens `--chart-N`
 * como o resto dos gráficos. Ficam centralizados aqui em vez de repetidos;
 * migrá-los para tokens é uma decisão de design por tomar.
 */
const SERIES = {
  pe: { key: "pe", color: "#3b82f6" },
  ps: { key: "ps", color: "#10b981" },
  fcf: { key: "fcfYield", color: "#f59e0b" },
} as const

type TooltipProps = {
  active?: boolean
  payload?: { payload: ValuationData }[]
  label?: string
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  const t = useTranslations("stock.valuationChart")
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="rounded-lg bg-popover/90 backdrop-blur-sm border border-border/50 p-3 shadow-xl text-sm">
        <p className="font-semibold text-foreground mb-2 pb-2 border-b border-border/50">{label}</p>
        <div className="space-y-1">
          {data.price && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("tooltipPrice")}</span>
              <span className="font-medium">${data.price.toFixed(2)}</span>
            </div>
          )}
          {data.pe && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("tooltipPe")}</span>
              <span className="font-medium text-blue-500">{data.pe.toFixed(2)}x</span>
            </div>
          )}
          {data.ps && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("tooltipPs")}</span>
              <span className="font-medium text-emerald-500">{data.ps.toFixed(2)}x</span>
            </div>
          )}
          {data.fcfYield && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t("tooltipFcf")}</span>
              <span className="font-medium text-amber-500">{(data.fcfYield * 100).toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>
    )
  }
  return null
}

export function ValuationMultiples({ ticker, isPro, isLoggedIn, isDemo }: ValuationMultiplesProps) {
  const tChart = useTranslations("stock.valuationChart")
  const tGate = useTranslations("stock.proGate")
  const tDemo = useTranslations("stock.demoBadge")
  const [data, setData] = useState<ValuationData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pe" | "ps" | "fcf">("pe")

  useEffect(() => {
    async function fetchValuation() {
      try {
        setLoading(true)
        const res = await fetch(`/api/valuation/${ticker}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch valuation:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchValuation()
  }, [ticker])

  const { avgPe, avgPs, avgFcf } = useMemo(() => {
    if (!data || data.length === 0) return { avgPe: undefined, avgPs: undefined, avgFcf: undefined }
    
    const validPe = data.filter(d => d.pe !== undefined && d.pe !== null).map(d => d.pe as number)
    const validPs = data.filter(d => d.ps !== undefined && d.ps !== null).map(d => d.ps as number)
    const validFcf = data.filter(d => d.fcfYield !== undefined && d.fcfYield !== null).map(d => d.fcfYield as number)
    
    const avgPe = validPe.length > 0 ? validPe.reduce((a, b) => a + b, 0) / validPe.length : undefined
    const avgPs = validPs.length > 0 ? validPs.reduce((a, b) => a + b, 0) / validPs.length : undefined
    const avgFcf = validFcf.length > 0 ? validFcf.reduce((a, b) => a + b, 0) / validFcf.length : undefined
    
    return { avgPe, avgPs, avgFcf }
  }, [data])

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return null
  }

  // O cartão de partilha fala a linguagem do DecisionChart (`label` + séries),
  // por isso a série ativa é reprojetada para essa forma.
  const shareSeries = {
    pe: { ...SERIES.pe, name: tChart("tabPe"), avg: avgPe },
    ps: { ...SERIES.ps, name: tChart("tabPs"), avg: avgPs },
    fcf: { ...SERIES.fcf, name: tChart("tabFcf"), avg: avgFcf },
  }[activeTab]

  const shareData = data.map((d) => {
    const date = new Date(d.date)
    return {
      label: `${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`,
      [shareSeries.key]: d[shareSeries.key as keyof ValuationData],
    }
  })

  const shareAvgLabel =
    shareSeries.avg === undefined
      ? undefined
      : `${tChart("avgLabel")}: ${
          activeTab === "fcf" ? `${(shareSeries.avg * 100).toFixed(1)}%` : `${shareSeries.avg.toFixed(1)}x`
        }`

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-primary" />
              {tChart("title")}
              {isDemo && (
                <span
                  title={tDemo("tooltip")}
                  className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                >
                  {tDemo("label")}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tChart("subtitle")}
            </p>
          </div>

          <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40">
            <button
              onClick={() => setActiveTab("pe")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "pe" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tChart("tabPe")}
            </button>
            <button
              onClick={() => setActiveTab("ps")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "ps" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tChart("tabPs")}
            </button>
            <button
              onClick={() => setActiveTab("fcf")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "fcf" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tChart("tabFcf")}
            </button>
            {/* Só com acesso: exportar o gráfico é exportar dados Pro. */}
            {isPro && (
              <ChartShareButton
                title={`${tChart("title")} · ${shareSeries.name}`}
                data={shareData}
                type="LINE"
                config={{
                  isPercentage: activeTab === "fcf",
                  dataKeys: [{ key: shareSeries.key, color: shareSeries.color, type: "line", name: shareSeries.name }],
                  ...(shareAvgLabel && shareSeries.avg !== undefined
                    ? { referenceLine: { y: shareSeries.avg, label: shareAvgLabel, color: "var(--muted-foreground)" } }
                    : {}),
                }}
                className="ml-1 px-2 py-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              />
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 relative">
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`
                }}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => activeTab === 'fcf' ? `${(val*100).toFixed(0)}%` : val}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              {activeTab === "pe" && avgPe !== undefined && (
                <ReferenceLine 
                  y={avgPe} 
                  stroke="var(--muted-foreground)" 
                  strokeDasharray="3 3" 
                  label={{ position: 'insideTopLeft', value: `${tChart("avgLabel")}: ${avgPe.toFixed(1)}x`, fill: 'var(--muted-foreground)', fontSize: 12, offset: 10 }}
                />
              )}
              {activeTab === "ps" && avgPs !== undefined && (
                <ReferenceLine 
                  y={avgPs} 
                  stroke="var(--muted-foreground)" 
                  strokeDasharray="3 3" 
                  label={{ position: 'insideTopLeft', value: `${tChart("avgLabel")}: ${avgPs.toFixed(1)}x`, fill: 'var(--muted-foreground)', fontSize: 12, offset: 10 }}
                />
              )}
              {activeTab === "fcf" && avgFcf !== undefined && (
                <ReferenceLine 
                  y={avgFcf} 
                  stroke="var(--muted-foreground)" 
                  strokeDasharray="3 3" 
                  label={{ position: 'insideTopLeft', value: `${tChart("avgLabel")}: ${(avgFcf * 100).toFixed(1)}%`, fill: 'var(--muted-foreground)', fontSize: 12, offset: 10 }}
                />
              )}
              {activeTab === "pe" && (
                <Line 
                  type="linear" 
                  dataKey="pe" 
                  stroke={SERIES.pe.color} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: SERIES.pe.color, stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
              {activeTab === "ps" && (
                <Line 
                  type="linear" 
                  dataKey="ps" 
                  stroke={SERIES.ps.color} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: SERIES.ps.color, stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
              {activeTab === "fcf" && (
                <Line 
                  type="linear" 
                  dataKey="fcfYield" 
                  stroke={SERIES.fcf.color} 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: SERIES.fcf.color, stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
