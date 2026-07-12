"use client"

import * as React from "react"
import { ChevronDown, Zap } from "lucide-react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatPercent } from "@/lib/finance/format"
import { cn } from "@/lib/utils"
import type { WaccBreakdown } from "@/lib/finance/wacc"

interface WaccBreakdownProps {
  breakdown: WaccBreakdown | null
  fcfMode?: "FCFF" | "FCFE"
  onUseWacc?: (wacc: number) => void
}

export function WaccBreakdownCard({ breakdown, fcfMode = "FCFF", onUseWacc }: WaccBreakdownProps) {
  const t = useTranslations("dcf")
  const [isOpen, setIsOpen] = React.useState(false)

  if (!breakdown) {
    return (
      <Card className="p-4 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          {t("wacc.betaUnavailable") || "Beta not available for WACC calculation"}
        </p>
      </Card>
    )
  }

  const isFcfe = fcfMode === "FCFE"
  const suggestedValue = isFcfe ? (breakdown.costOfEquity ?? breakdown.wacc) : breakdown.wacc
  const suggestedLabel = isFcfe ? "Custo do Capital (Re)" : (t("wacc.suggested") || "WACC (CAPM)")

  return (
    <Card className="p-4 space-y-3">
      {/* Header com taxa sugerida */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
            {suggestedLabel}
          </p>
          <p className="text-2xl font-bold text-primary">{formatPercent(suggestedValue)}</p>
        </div>
        <Button
          size="sm"
          onClick={() => onUseWacc?.(suggestedValue)}
          className="h-9 text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
        >
          <Zap className="w-3 h-3 mr-1.5" />
          {t("wacc.useButton") || "Use"}
        </Button>
      </div>

      {/* Toggle expansível */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{t("wacc.breakdownTitle") || "Breakdown"}</span>
        <ChevronDown
          className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {/* Breakdown expandido */}
      {isOpen && (
        <div className="space-y-3 pt-2 border-t border-border">
          {/* Cost of Equity */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">
              {t("wacc.costOfEquity") || "Cost of Equity"}
            </p>
            <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("wacc.riskFreeRate") || "Rf"}:</span>
                <span className="font-mono">{formatPercent(breakdown.riskFreeRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  β ({t("wacc.beta") || "Beta"}):
                </span>
                <span className="font-mono">{breakdown.beta?.toFixed(2) || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("wacc.equityRiskPremium") || "ERP"}:
                </span>
                <span className="font-mono">{formatPercent(breakdown.equityRiskPremium)}</span>
              </div>
              <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between font-semibold">
                <span className="text-foreground">Re (Rf + β×ERP):</span>
                <span className="font-mono text-primary">
                  {formatPercent(breakdown.costOfEquity ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Cost of Debt */}
          {breakdown.totalDebt && breakdown.totalDebt > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">
                {t("wacc.costOfDebt") || "Cost of Debt"}
              </p>
              <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("wacc.costOfDebtLabel") || "Rd (pre-tax)"}:
                  </span>
                  <span className="font-mono">
                    {breakdown.costOfDebtPretax ? formatPercent(breakdown.costOfDebtPretax) : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("wacc.taxRate") || "Tax Rate"}:
                  </span>
                  <span className="font-mono">{formatPercent(breakdown.effectiveTaxRate)}</span>
                </div>
                <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between font-semibold">
                  <span className="text-foreground">
                    Rd (after-tax):
                  </span>
                  <span className="font-mono text-primary">
                    {breakdown.costOfDebtAfterTax
                      ? formatPercent(breakdown.costOfDebtAfterTax)
                      : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Capital Structure */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">
              {t("wacc.capitalStructure") || "Capital Structure"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted/40 rounded-lg p-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {t("wacc.weightEquity") || "Equity Weight"}
                </p>
                <p className="text-sm font-bold text-primary">
                  {formatPercent(breakdown.weightEquity)}
                </p>
              </div>
              {breakdown.weightDebt > 0.001 && (
                <div className="bg-muted/40 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("wacc.weightDebt") || "Debt Weight"}
                  </p>
                  <p className="text-sm font-bold text-orange-500">
                    {formatPercent(breakdown.weightDebt)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}
