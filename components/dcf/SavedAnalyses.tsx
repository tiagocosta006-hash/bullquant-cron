"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Bookmark, Trash2, Loader2, RotateCcw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { cn } from "@/lib/utils"

/** Inputs guardados em unidades absolutas / decimais (convenção do motor DCF). */
export type SavedDcfInputs = {
  fcf0: number
  growthStage1: number
  growthStage2: number
  wacc: number
  terminalGrowth: number
  shares: number
  netDebt: number
}

export type SavedAnalysis = SavedDcfInputs & {
  id: string
  label: string | null
  fairValue: number
  priceAtSave: number | null
  marginOfSafety: number | null
  createdAt: string
}

interface SavedAnalysesProps {
  ticker: string | null
  currency: string
  /** valores atuais a guardar (já em unidades absolutas) */
  current: { inputs: SavedDcfInputs; fairValue: number; currentPrice: number; marginOfSafety: number } | null
  canSave: boolean
  onLoad: (a: SavedAnalysis) => void
}

export function SavedAnalyses({ ticker, currency, current, canSave, onLoad }: SavedAnalysesProps) {
  const t = useTranslations("dcf")
  const [analyses, setAnalyses] = React.useState<SavedAnalysis[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [label, setLabel] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const fetchAnalyses = React.useCallback(async () => {
    if (!ticker) {
      setAnalyses([])
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/dcf/analyses?ticker=${encodeURIComponent(ticker)}`)
      if (res.ok) {
        const data = await res.json()
        setAnalyses(Array.isArray(data.analyses) ? data.analyses : [])
      } else {
        setAnalyses([])
      }
    } catch {
      setAnalyses([])
    } finally {
      setIsLoading(false)
    }
  }, [ticker])

  React.useEffect(() => {
    fetchAnalyses()
  }, [fetchAnalyses])

  const handleSave = async () => {
    if (!ticker || !current) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/dcf/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          label: label.trim() || undefined,
          inputs: current.inputs,
          result: {
            fairValue: current.fairValue,
            currentPrice: current.currentPrice,
            marginOfSafety: current.marginOfSafety,
          },
        }),
      })
      if (!res.ok) {
        setError(t("saved.saveError"))
        return
      }
      setLabel("")
      await fetchAnalyses()
    } catch {
      setError(t("saved.saveError"))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setAnalyses((prev) => prev.filter((a) => a.id !== id)) // otimista
    try {
      await fetch(`/api/dcf/analyses/${id}`, { method: "DELETE" })
    } catch {
      fetchAnalyses() // reverter se falhar
    }
  }

  // Sem empresa carregada → não mostrar o painel (o save precisa de um ticker).
  if (!ticker) return null

  return (
    <Card className="p-5 gap-0 space-y-4">
      <div className="flex items-center gap-2">
        <Bookmark className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("saved.title")}</h3>
      </div>

      {/* Guardar cenário atual */}
      <div className="flex items-center gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("saved.labelPlaceholder")}
          maxLength={60}
          className="h-9 bg-white/5 border-white/10 text-sm"
        />
        <Button onClick={handleSave} disabled={!canSave || isSaving} size="sm" className="shrink-0">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
          <span className="ml-1.5">{t("saved.saveButton")}</span>
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : analyses.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{t("saved.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {analyses.map((a) => {
            const under = (a.marginOfSafety ?? 0) > 0
            return (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {a.label || formatDate(a.createdAt)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t("saved.fairValueShort")} {formatPrice(a.fairValue, currency)}
                    {a.marginOfSafety != null && (
                      <span className={cn("ml-2 font-medium", under ? "text-bull" : "text-bear")}>
                        {under ? "+" : ""}
                        {formatPercent(a.marginOfSafety)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title={t("saved.loadButton")}
                    onClick={() => onLoad(a)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    title={t("saved.deleteButton")}
                    onClick={() => handleDelete(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}
