"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { BarChart3, PieChart as PieChartIcon } from "lucide-react"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import type { PortfolioItem, PriceData } from "./types"

interface PortfolioAllocationProps {
  items: PortfolioItem[]
  prices: Record<string, PriceData>
}

type AllocationView = "bars" | "donut"

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

const UNKNOWN_SECTOR_KEY = "__unknown__"
const VIEW_STORAGE_KEY = "portfolio.allocationView"

export function PortfolioAllocation({ items, prices }: PortfolioAllocationProps) {
  const t = useTranslations("portfolio.allocation")
  const [view, setView] = useState<AllocationView>(() => {
    if (typeof window === "undefined") return "bars"
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === "bars" || stored === "donut" ? stored : "bars"
  })

  const handleViewChange = (next: AllocationView) => {
    setView(next)
    window.localStorage.setItem(VIEW_STORAGE_KEY, next)
  }

  const bySector = useMemo(() => {
    const totals = new Map<string, number>()

    for (const item of items) {
      const sector = item.company.sector || UNKNOWN_SECTOR_KEY
      const currentPrice = prices[item.company.ticker]?.currentPrice
      const quantity = item.quantity !== null ? Number(item.quantity) : null
      // Se houver posição real, pesa por valor de mercado; senão (watchlist pura), pesa por contagem de posições.
      const weight = quantity !== null && currentPrice !== undefined
        ? quantity * currentPrice
        : 1

      totals.set(sector, (totals.get(sector) || 0) + weight)
    }

    const total = Array.from(totals.values()).reduce((sum, v) => sum + v, 0)
    if (total === 0) return []

    return Array.from(totals.entries())
      .map(([sector, value]) => ({ sector, value, percent: value / total }))
      .sort((a, b) => b.value - a.value)
  }, [items, prices])

  const usesMarketValue = items.some(item => item.quantity !== null)

  if (bySector.length === 0) return null

  return (
    <div className="bg-card border border-border/40 rounded-xl shadow-sm p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-muted-foreground">{t('title')}</h2>
        <div className="flex items-center gap-1 bg-muted/50 border border-border/60 rounded-lg p-1">
          <button
            type="button"
            onClick={() => handleViewChange("bars")}
            aria-label={t('barsView')}
            aria-pressed={view === "bars"}
            className={`p-1.5 rounded-md transition-colors ${view === "bars" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleViewChange("donut")}
            aria-label={t('donutView')}
            aria-pressed={view === "donut"}
            className={`p-1.5 rounded-md transition-colors ${view === "donut" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <PieChartIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {view === "bars" ? (
        <div className="space-y-3">
          {bySector.map((entry, i) => (
            <div key={entry.sector}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-sm font-medium truncate">
                  {entry.sector === UNKNOWN_SECTOR_KEY ? t('unknownSector') : entry.sector}
                </span>
                <span className="nums text-sm text-muted-foreground shrink-0">
                  {usesMarketValue ? formatPrice(entry.value) : `${entry.value}x`} · {formatPercent(entry.percent)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(entry.percent * 100, 2)}%`,
                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={bySector}
                  dataKey="value"
                  nameKey="sector"
                  innerRadius="60%"
                  outerRadius="100%"
                  paddingAngle={2}
                  strokeWidth={0}
                  animationDuration={400}
                >
                  {bySector.map((entry, i) => (
                    <Cell key={entry.sector} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null
                    const entry = payload[0].payload as { sector: string; value: number; percent: number }
                    const label = entry.sector === UNKNOWN_SECTOR_KEY ? t('unknownSector') : entry.sector
                    return (
                      <div className="bg-background border border-border/50 p-2.5 rounded-lg shadow-xl pointer-events-none text-sm">
                        <p className="font-semibold">{label}</p>
                        <p className="nums text-muted-foreground">
                          {usesMarketValue ? formatPrice(entry.value) : `${entry.value}x`} · {formatPercent(entry.percent)}
                        </p>
                      </div>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="w-full min-w-0 space-y-2">
            {bySector.map((entry, i) => (
              <div key={entry.sector} className="flex items-center gap-2 text-sm">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="font-medium truncate min-w-0 flex-1">
                  {entry.sector === UNKNOWN_SECTOR_KEY ? t('unknownSector') : entry.sector}
                </span>
                <span className="nums text-muted-foreground shrink-0 w-14 text-right">
                  {formatPercent(entry.percent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
