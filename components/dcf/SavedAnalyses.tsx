"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Bookmark, Trash2, Loader2, RotateCcw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { successPulse } from "@/lib/motion"
import { track } from "@/lib/pulse/client"
import { cn } from "@/lib/utils"
import { ShareDcfModal } from "./ShareDcfModal"

/** Inputs guardados em unidades absolutas / decimais (convenção do motor DCF). */
export type SavedDcfInputs = {
  fcfMode?: "FCFF" | "FCFE" | null
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
  notes?: string | null
  fairValue: number
  priceAtSave: number | null
  marginOfSafety: number | null
  isPublic: boolean
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
  const [notes, setNotes] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const saveBtnRef = React.useRef<HTMLButtonElement>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)

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
          notes: notes.trim() || undefined,
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
      setNotes("")
      successPulse(saveBtnRef.current)
      track("dcf_saved", { ticker })
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

  const handleShare = async (id: string) => {
    try {
      const a = analyses.find((x) => x.id === id)
      if (!a) return

      // Copy immediately to preserve user-gesture context for the browser clipboard API
      const url = `${window.location.origin}/dcf/${id}`
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(url)
        } else {
          const textArea = document.createElement("textarea")
          textArea.value = url
          textArea.style.position = "fixed"
          textArea.style.left = "-999999px"
          textArea.style.top = "-999999px"
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          document.execCommand('copy')
          textArea.remove()
        }
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      } catch (err) {
        console.error('Falha ao copiar link:', err)
      }

      // Se já for público, não precisamos de alterar a BD
      if (a.isPublic) {
        return
      }

      // Se for privado, torna público
      const res = await fetch(`/api/dcf/analyses/${id}/share`, { method: "PATCH" })
      if (!res.ok) return
      const data = await res.json()
      setAnalyses((prev) => prev.map((a) => (a.id === id ? { ...a, isPublic: data.isPublic } : a)))
      
    } catch (e) {
      console.error(e)
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("saved.labelPlaceholder")}
            maxLength={60}
            className="h-9 bg-input/30 border-input/30 text-sm"
          />
          <Button ref={saveBtnRef} onClick={handleSave} disabled={!canSave || isSaving} size="sm" className="shrink-0 h-9">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            <span className="ml-1.5">{t("saved.saveButton")}</span>
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas ou observações adicionais (opcional)..."
          className="min-h-[60px] text-xs bg-input/30 border-input/30 resize-none"
          maxLength={2000}
        />
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
                  <p className="text-xs text-muted-foreground tabular-nums mt-1">
                    {t("saved.fairValueShort")} {formatPrice(a.fairValue, currency)}
                    {a.marginOfSafety != null && (
                      <span className={cn("ml-2 font-medium", under ? "text-bull" : "text-bear")}>
                        {under ? "+" : ""}
                        {formatPercent(a.marginOfSafety)}
                      </span>
                    )}
                  </p>
                  {a.notes && (
                    <p className="text-xs italic text-muted-foreground/80 mt-1.5 line-clamp-2" title={a.notes}>
                      "{a.notes}"
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <ShareDcfModal
                    analysis={a}
                    copiedId={copiedId}
                    ticker={ticker || ""}
                    onCopyLink={() => handleShare(a.id)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
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
