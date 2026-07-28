"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Share, Loader2 } from "lucide-react"
import type { DcfResult } from "@/lib/finance/dcf"
import { formatLargeNumber, formatPrice, formatPercent } from "@/lib/finance/format"
import { cn } from "@/lib/utils"
import { DcfShareCard } from "./DcfShareCard"
import * as htmlToImage from "html-to-image"

interface DcfResultsProps {
  result: DcfResult
  currency?: string
  mode?: "FCFF" | "FCFE"
  ticker?: string | null
  name?: string | null
  logoUrl?: string | null
  inputs?: {
    growthStage1: number
    wacc: number
    terminalGrowth: number
  }
}

export function DcfResults({ result, currency = "$", mode = "FCFF", ticker, name, logoUrl, inputs }: DcfResultsProps) {
  const t = useTranslations("dcf")
  const [isExporting, setIsExporting] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement>(null)

  const handleExport = async () => {
    if (!cardRef.current) return
    setIsExporting(true)
    try {
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2, // 2x para garantir nitidez em redes sociais
        width: 1200,
        height: 630,
        skipFonts: false,
      })
      const link = document.createElement("a")
      link.download = `bullvalue_${ticker || "dcf"}_analysis.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error("Failed to export image", err)
    } finally {
      setIsExporting(false)
    }
  }

  if (!result.valid) {
    const key =
      result.error === "INVALID_WACC"
        ? "errorWacc"
        : result.error === "INVALID_SHARES"
          ? "errorShares"
          : "errorFcf"
    return (
      <Card className="p-6 flex items-center justify-center min-h-[300px] text-center">
        <p className="text-sm text-muted-foreground max-w-xs">{t(key)}</p>
      </Card>
    )
  }

  const { fairValue, currentPrice, marginOfSafety } = result
  const hasPrice = Number.isFinite(currentPrice) && currentPrice > 0

  // Margem de segurança positiva = subavaliada (verde); negativa = sobreavaliada.
  const undervalued = marginOfSafety > 0
  // barra: 0% no centro, clamp a ±50% para a largura visual
  const barPct = Math.min(50, Math.abs(marginOfSafety) * 100)

  return (
    <>
      <Card className="p-6 gap-0 space-y-6 relative overflow-hidden group">
        {/* Modo badge e Botão Partilhar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
              {t("mode")} •
            </span>
            <span className="text-xs font-bold text-primary">{mode}</span>
          </div>
          
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-8 gap-2 text-xs transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share className="w-3 h-3" />}
            {t("exportImage") || "Share"}
          </Button>
        </div>

        {/* Fair Value vs Preço Atual */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("fairValue")}</p>
            <p className="text-3xl font-bold tabular-nums text-primary">
              {formatPrice(fairValue, currency)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("currentPrice")}</p>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {hasPrice ? formatPrice(currentPrice, currency) : "N/A"}
            </p>
          </div>
        </div>

        {/* Margem de Segurança */}
        {hasPrice && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{t("marginOfSafety")}</p>
              <span
                className={cn(
                  "px-2.5 py-1 rounded-full text-sm font-bold tabular-nums",
                  undervalued
                    ? "bg-bull/15 text-bull"
                    : "bg-bear/15 text-bear"
                )}
              >
                {undervalued ? "+" : ""}
                {formatPercent(marginOfSafety)}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-muted overflow-hidden">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border z-10" />
              <div
                className={cn(
                  "absolute top-0 bottom-0",
                  undervalued ? "bg-bull left-1/2" : "bg-bear right-1/2"
                )}
                style={{ width: `${barPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {undervalued ? t("undervalued") : t("overvalued")}
            </p>
          </div>
        )}

        {/* Detalhe do cálculo */}
        <div className="border-t border-border pt-4 space-y-3">
          <DetailRow label={t("enterpriseValue")} value={formatLargeNumber(result.enterpriseValue, currency)} />
          <DetailRow label={t("equityValue")} value={formatLargeNumber(result.equityValue, currency)} />
          <DetailRow label={t("terminalValuePv")} value={formatLargeNumber(result.pvTerminalValue, currency)} />
          <DetailRow label={t("fcfPv")} value={formatLargeNumber(result.sumPvFcf, currency)} />
        </div>
      </Card>

      {/* Share Card rendering off-screen */}
      <div className="fixed -top-[9999px] -left-[9999px] pointer-events-none">
        <DcfShareCard 
          ref={cardRef}
          result={result}
          currency={currency}
          mode={mode}
          ticker={ticker}
          name={name}
          logoUrl={logoUrl}
          inputs={inputs}
        />
      </div>
    </>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

