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
  logoUrl?: string | null
  inputs?: {
    growthStage1: number
    wacc: number
    terminalGrowth: number
  }
}

export const DcfShareCard = forwardRef<HTMLDivElement, DcfShareCardProps>(
  ({ result, currency, mode, ticker, name, logoUrl, inputs }, ref) => {
    const t = useTranslations("dcf")

    if (!result.valid) return null

    const { fairValue, currentPrice, marginOfSafety } = result
    const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0
    const undervalued = marginOfSafety > 0
    const marginColor = undervalued ? "#16a34a" : "#dc2626"

    const dateString = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date())

    // Generate waves background
    const backgroundLines = []
    const W = 1200
    const H = 630
    const lines = 12
    for (let l = 0; l < lines; l++) {
      const base = (H / (lines - 1)) * l
      const amp = 15 + (l % 6) * 5
      let d = `M 0 ${base}`
      for (let x = 0; x <= W; x += 20) {
        const y = base + Math.sin(x * 0.005 + l * 0.5) * amp
        d += ` L ${x} ${y}`
      }
      const strokeOpacity = (0.045 + (l % 6) * 0.004).toFixed(3)
      backgroundLines.push(
        <path key={l} d={d} stroke="#1a1a17" strokeWidth="1.5" strokeOpacity={strokeOpacity} fill="none" />
      )
    }

    return (
      <div
        ref={ref}
        className="w-[1200px] h-[630px] flex flex-col justify-between relative overflow-hidden font-sans"
        style={{
          backgroundColor: "#fafaf7",
          padding: "40px 50px",
          border: "12px solid #e4aa33",
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF UI Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", top: 0, left: 0, opacity: 0.8, pointerEvents: "none" }}
        >
          {backgroundLines}
        </svg>

        {/* Header */}
        <div className="flex items-center justify-between z-10">
          <div className="flex items-center">
            <img src="/brand/logo.svg" width={42} height={42} alt="BullValue" style={{ marginRight: 16, objectFit: "contain" }} />
            <div className="flex text-[32px] font-[800] tracking-[-0.05em] text-[#1a1a17]">
              <span className="text-[#e4aa33]">Bull</span>Value
            </div>
          </div>

          {/* Company Badge */}
          <div className="flex items-center bg-white px-4 py-2 rounded-full border-2 border-black/5 shadow-sm">
            {logoUrl && (
              <img src={`/_next/image?url=${encodeURIComponent(logoUrl)}&w=64&q=75`} width={28} height={28} style={{ borderRadius: "25%", marginRight: 12, objectFit: "contain" }} />
            )}
            <div className="flex text-[20px] font-[800] text-[#1a1a17] tracking-[-0.02em]">
              {name || "Análise DCF"} <span className="text-[#8b877d] ml-2">{ticker}</span>
            </div>
          </div>
        </div>

        {/* Main Title Area */}
        <div className="flex flex-col mt-[30px] px-[30px] z-10">
          <div className="flex text-[64px] font-[800] text-[#1a1a17] leading-[1.1] tracking-[-0.03em] max-w-[900px] flex-wrap">
            Cenário {mode}
          </div>
          <div className="flex text-[24px] font-[400] text-[#57544d] mt-6 max-w-[850px] leading-[1.5]">
            "Análise de modelo Discounted Cash Flow gerada com {mode}"
          </div>

          {/* Prices Block */}
          <div className="flex items-center mt-[70px] gap-5">
            {hasPrice && (
              <div className="flex flex-col">
                <div className="flex text-[20px] font-[400] text-[#8b877d] uppercase mb-3 tracking-[0.05em]">Preço Atual</div>
                <div className="flex text-[64px] font-[800] text-[#1a1a17] tracking-[-0.02em]">
                  {formatPrice(currentPrice, currency)}
                </div>
              </div>
            )}

            {hasPrice && marginOfSafety != null && (
              <div className="flex items-center mx-5">
                <svg width="48" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b877d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                <div className="flex text-[36px] font-[800] ml-4" style={{ color: marginColor }}>
                  {undervalued ? "+" : ""}{formatPercent(Number(marginOfSafety))}
                </div>
              </div>
            )}

            <div className="flex flex-col">
              <div className="flex text-[20px] font-[800] text-[#e4aa33] uppercase mb-3 tracking-[0.05em]">Fair Value (DCF)</div>
              <div className="flex text-[64px] font-[800] text-[#1a1a17] tracking-[-0.02em]">
                {formatPrice(fairValue, currency)}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Inputs Grid */}
        <div className="flex justify-between items-end mt-auto z-10">
          <div className="flex gap-[60px] border-t-2 border-black/10 pt-[30px]">
            {inputs && (
              <>
                <div className="flex flex-col">
                  <div className="flex text-[16px] font-[400] text-[#8b877d] uppercase mb-2 tracking-[0.02em]">WACC</div>
                  <div className="flex text-[28px] font-[800] text-[#1a1a17]">{formatPercent(Number(inputs.wacc))}</div>
                </div>
                <div className="flex flex-col">
                  <div className="flex text-[16px] font-[400] text-[#8b877d] uppercase mb-2 tracking-[0.02em]">Cresc. Curto Prazo</div>
                  <div className="flex text-[28px] font-[800] text-[#1a1a17]">{formatPercent(Number(inputs.growthStage1))}</div>
                </div>
                <div className="flex flex-col">
                  <div className="flex text-[16px] font-[400] text-[#8b877d] uppercase mb-2 tracking-[0.02em]">Cresc. Terminal</div>
                  <div className="flex text-[28px] font-[800] text-[#1a1a17]">{formatPercent(Number(inputs.terminalGrowth))}</div>
                </div>
              </>
            )}
          </div>
          
          <div className="flex text-[18px] font-[400] text-[#8b877d] uppercase tracking-[0.05em]">
            {dateString}
          </div>
        </div>

      </div>
    )
  }
)

DcfShareCard.displayName = "DcfShareCard"

