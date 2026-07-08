"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { TrendingUp, TrendingDown, Info } from "lucide-react"
import { formatPrice } from "@/lib/finance/format"

type HistoryPoint = {
  date: string
  value: number
}

type TabType = "1m" | "6m" | "1y" | "max"

const TAB_MONTHS: Record<TabType, number> = { "1m": 1, "6m": 6, "1y": 12, max: 120 }

export function PortfolioValueChart() {
  const t = useTranslations("portfolio.valueChart")
  const locale = useLocale()
  const [activeTab, setActiveTab] = useState<TabType>("6m")
  const [data, setData] = useState<HistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/portfolio/history?months=${TAB_MONTHS[activeTab]}`)
        const json = res.ok ? await res.json() : { points: [] }
        if (!cancelled) setData(json.points || [])
      } catch {
        if (!cancelled) setData([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [activeTab])

  const { endValue, changeValue, changePercent, isPositive } = useMemo(() => {
    const start = data.length > 0 ? data[0].value : 0
    const end = data.length > 0 ? data[data.length - 1].value : 0
    const change = end - start
    const percent = start > 0 ? (change / start) * 100 : 0
    return { endValue: end, changeValue: change, changePercent: percent, isPositive: change >= 0 }
  }, [data])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit" }).format(d)
  }

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(d)
  }

  const tabs: TabType[] = ["1m", "6m", "1y", "max"]

  return (
    <div className="w-full bg-card border border-border/40 rounded-xl shadow-sm p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-muted-foreground">{t('title')}</h2>
            <span title={t('approximationTooltip')}>
              <Info className="w-3.5 h-3.5 text-muted-foreground/70 cursor-help" />
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="nums text-2xl font-extrabold tracking-tight text-foreground">
              {formatPrice(endValue)}
            </span>
            {data.length > 1 && (
              <span className={`flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded-md ${isPositive ? 'text-bull bg-bull/10' : 'text-bear bg-bear/10'}`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {isPositive ? '+' : ''}{formatPrice(changeValue)} ({changePercent.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>

        <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 w-fit">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-all ${
                activeTab === tab
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[220px] w-full relative">
        {isLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            {t('noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorPortfolioValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                minTickGap={30}
              />
              <YAxis
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                tickFormatter={(val) => formatPrice(val)}
                width={70}
                orientation="right"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-background border border-border/50 p-3 rounded-lg shadow-xl pointer-events-none">
                        <p className="text-muted-foreground text-xs font-medium mb-1">
                          {label != null ? formatTooltipDate(String(label)) : ''}
                        </p>
                        <p className="nums font-bold text-foreground text-lg">
                          {formatPrice(Number(payload[0].value))}
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? '#10b981' : '#f43f5e'}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorPortfolioValue)"
                animationDuration={400}
                activeDot={{ r: 4, strokeWidth: 2, fill: "var(--background)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
