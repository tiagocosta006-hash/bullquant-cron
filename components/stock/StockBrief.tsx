"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { BRAND } from "@/lib/brand"

type BriefEvent = {
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"
  title: string
  date: string
  content: string
}

type BriefData = {
  events: BriefEvent[]
}

const SENTIMENT = {
  BULLISH: { Icon: TrendingUp, color: "text-bull", bg: "bg-bull/10", key: "bullish" },
  BEARISH: { Icon: TrendingDown, color: "text-bear", bg: "bg-bear/10", key: "bearish" },
  NEUTRAL: { Icon: Minus, color: "text-muted-foreground", bg: "bg-muted", key: "neutral" },
} as const

export function StockBrief({ ticker }: { ticker: string }) {
  const t = useTranslations("stock.brief")
  const [data, setData] = React.useState<BriefData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)
  const [isExpanded, setIsExpanded] = React.useState(false)

  React.useEffect(() => {
    let active = true
    async function fetchBrief() {
      try {
        const res = await fetch(`/api/ai/brief?ticker=${ticker}`)
        if (!res.ok) throw new Error("Failed to fetch")
        const json = await res.json()
        if (active) setData(json.brief)
      } catch (err) {
        console.error(err)
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchBrief()
    return () => {
      active = false
    }
  }, [ticker])

  if (error) return null

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-foreground">
            {BRAND.name} {t("title")}
            <Sparkles className="h-5 w-5 animate-pulse text-primary" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("loading")}</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data || data.events.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-foreground">
          {BRAND.name} {t("title")}
          <Sparkles className="h-5 w-5 text-primary" />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ul className="space-y-6">
        {(isExpanded ? data.events : data.events.slice(0, 1)).map((event, idx) => {
          const s = SENTIMENT[event.sentiment] ?? SENTIMENT.NEUTRAL
          const { Icon } = s
          return (
            <li key={idx} className="border-l-2 border-border pl-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
                    s.bg,
                    s.color,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(`sentiment.${s.key}`)}
                </span>
                <span className="font-semibold text-foreground">{event.title}</span>
              </div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t("date")}: {event.date}
              </p>
              <p className="text-sm leading-relaxed text-foreground/80">{event.content}</p>
            </li>
          )
        })}
      </ul>
      
      {data.events.length > 1 && (
        <div className="mt-6 border-t border-border/50 pt-4 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? t("collapse") : t("expand", { n: data.events.length - 1 })}
          </button>
        </div>
      )}
    </div>
  )
}
