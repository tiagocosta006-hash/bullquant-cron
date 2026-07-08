"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

export type SerializedDcfAnalysis = {
  id: string
  label: string | null
  fairValue: number
  priceAtSave: number | null
  marginOfSafety: number | null
  createdAt: string
  wacc: number
  growthStage1: number
  terminalGrowth: number
}

interface SavedValuationsProps {
  analyses: SerializedDcfAnalysis[]
  ticker: string
  currency?: string
}

export function SavedValuations({ analyses, ticker, currency = "$" }: SavedValuationsProps) {
  const t = useTranslations("stock.savedValuations")
  const locale = useLocale()

  if (analyses.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{t("title")}</h2>
        <Link 
          href={`/dcf?ticker=${ticker}`} 
          className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1.5 transition-colors"
        >
          {t("openCalculator")}
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {analyses.map((a) => {
          const mos = a.marginOfSafety !== null ? a.marginOfSafety * 100 : 0
          const isUndervalued = mos > 0
          const d = new Date(a.createdAt)
          const formattedDate = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
          const formattedTime = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d)
          
          return (
            <div 
              key={a.id} 
              className="bg-card border border-border/50 rounded-xl p-5 shadow-sm flex flex-col gap-4 relative overflow-hidden group hover:border-primary/30 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground line-clamp-1">
                    {a.label || `${t("savedAt")} ${formattedDate}`}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formattedTime}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded-md text-xs font-bold shrink-0 ${isUndervalued ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'}`}>
                  {isUndervalued ? "+" : ""}{mos.toFixed(1)}% {t("mos")}
                </div>
              </div>

              {/* Body */}
              <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-2">
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-0.5">
                    {t("fairValue")}
                  </p>
                  <p className="font-heading text-xl font-bold text-foreground">
                    {currency}{a.fairValue.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-0.5">
                    WACC
                  </p>
                  <p className="font-mono text-sm font-medium">
                    {(a.wacc * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-0.5">
                    {t("growth")}
                  </p>
                  <p className="font-mono text-sm font-medium">
                    {(a.growthStage1 * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/70 mb-0.5">
                    {t("termGrowth")}
                  </p>
                  <p className="font-mono text-sm font-medium">
                    {(a.terminalGrowth * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
