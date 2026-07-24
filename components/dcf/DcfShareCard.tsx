"use client"

import * as React from "react"
import { forwardRef } from "react"
import { useTranslations } from "next-intl"
import type { DcfResult } from "@/lib/finance/dcf"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Zap } from "lucide-react"

export interface DcfShareCardProps {
  result: DcfResult
  currency: string
  mode: "FCFF" | "FCFE"
  ticker?: string | null
  name?: string | null
  inputs?: {
    growthStage1: number
    wacc: number
    terminalGrowth: number
  }
}

export const DcfShareCard = forwardRef<HTMLDivElement, DcfShareCardProps>(
  ({ result, currency, mode, ticker, name, inputs }, ref) => {
    const t = useTranslations("dcf")

    if (!result.valid) return null

    const { fairValue, currentPrice, marginOfSafety } = result
    const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0
    const undervalued = marginOfSafety > 0

    return (
      <div
        ref={ref}
        className="w-[1080px] h-[1080px] bg-[#0a0a0c] text-white flex flex-col justify-between overflow-hidden relative font-sans"
        style={{
          backgroundImage: "radial-gradient(circle at 100% 0%, rgba(212,175,55,0.1) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(212,175,55,0.05) 0%, transparent 40%)",
        }}
      >
        {/* Marca d'água de fundo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none">
          <Zap className="w-[800px] h-[800px] text-primary" />
        </div>

        {/* Top Header */}
        <div className="p-16 flex items-center justify-between z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
          <div>
            <div className="flex items-center gap-4">
              <span className="text-6xl font-black tracking-tighter text-primary">
                {ticker || "DCF"}
              </span>
              <span className="text-3xl px-4 py-2 bg-white/10 rounded-full font-bold uppercase tracking-widest text-white/80">
                {mode}
              </span>
            </div>
            {name && <h1 className="text-4xl font-medium text-white/60 mt-2">{name}</h1>}
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black tracking-tight text-white/90">BullValue</h2>
            <p className="text-2xl text-primary font-medium">Investment Analysis</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-16 flex-1 flex flex-col justify-center gap-16 z-10">
          
          <div className="grid grid-cols-2 gap-12">
            {/* Fair Value */}
            <div className="bg-white/5 border border-white/10 p-12 rounded-3xl backdrop-blur-xl">
              <p className="text-2xl uppercase tracking-widest text-white/50 mb-4">{t("fairValue")}</p>
              <p className="text-8xl font-black tabular-nums tracking-tighter text-white">
                {formatPrice(fairValue, currency)}
              </p>
            </div>

            {/* Current Price */}
            <div className="bg-white/5 border border-white/10 p-12 rounded-3xl backdrop-blur-xl">
              <p className="text-2xl uppercase tracking-widest text-white/50 mb-4">{t("currentPrice")}</p>
              <p className="text-8xl font-bold tabular-nums tracking-tighter text-white/70">
                {hasPrice ? formatPrice(currentPrice, currency) : "N/A"}
              </p>
            </div>
          </div>

          {/* Margin of Safety */}
          {hasPrice && (
            <div className={cn(
              "p-12 rounded-3xl border flex items-center justify-between",
              undervalued ? "bg-[#16a34a]/10 border-[#16a34a]/30" : "bg-[#dc2626]/10 border-[#dc2626]/30"
            )}>
              <div>
                <p className="text-2xl uppercase tracking-widest text-white/50 mb-2">{t("marginOfSafety")}</p>
                <div className="flex items-center gap-6">
                  {undervalued ? (
                    <TrendingUp className="w-16 h-16 text-[#16a34a]" />
                  ) : (
                    <TrendingDown className="w-16 h-16 text-[#dc2626]" />
                  )}
                  <p className={cn(
                    "text-8xl font-black tabular-nums tracking-tighter",
                    undervalued ? "text-[#16a34a]" : "text-[#dc2626]"
                  )}>
                    {undervalued ? "+" : ""}
                    {formatPercent(marginOfSafety)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-5xl font-bold tracking-tight",
                  undervalued ? "text-[#16a34a]" : "text-[#dc2626]"
                )}>
                  {undervalued ? t("undervalued") : t("overvalued")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Assumptions */}
        {inputs && (
          <div className="p-16 border-t border-white/10 bg-black/40 z-10">
            <p className="text-2xl text-white/40 uppercase tracking-widest mb-8 font-semibold">
              Assumptions Model
            </p>
            <div className="grid grid-cols-3 gap-8">
              <div className="space-y-2">
                <p className="text-xl text-white/50">Growth (Stage 1)</p>
                <p className="text-4xl font-bold text-white/90">{formatPercent(inputs.growthStage1)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xl text-white/50">Discount Rate (WACC)</p>
                <p className="text-4xl font-bold text-white/90">{formatPercent(inputs.wacc)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xl text-white/50">Terminal Growth</p>
                <p className="text-4xl font-bold text-white/90">{formatPercent(inputs.terminalGrowth)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
)

DcfShareCard.displayName = "DcfShareCard"
