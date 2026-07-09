"use client"

import { useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Upload, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { parseCsv } from "@/lib/finance/csv"

type Step = "upload" | "map" | "result"
type ColumnRole = "ticker" | "quantity" | "avgBuyPrice" | "ignore"
type ImportRowResult = { ticker: string; status: "added" | "merged" | "unsupported" | "invalid" }

interface ImportPortfolioProps {
  onClose: () => void
  onImported: () => void
}

export function ImportPortfolio({ onClose, onImported }: ImportPortfolioProps) {
  const t = useTranslations("portfolio.import")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("upload")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [columnMap, setColumnMap] = useState<Record<number, ColumnRole>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [results, setResults] = useState<ImportRowResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError(t('emptyFile'))
        return
      }
      setHeaders(parsed.headers)
      setRows(parsed.rows)

      // Tenta adivinhar o mapeamento pelas etiquetas mais comuns.
      const guessed: Record<number, ColumnRole> = {}
      parsed.headers.forEach((header, i) => {
        const h = header.toLowerCase()
        if (/ticker|symbol|s[ií]mbolo/.test(h)) guessed[i] = "ticker"
        else if (/quantity|qty|quantidade|shares/.test(h)) guessed[i] = "quantity"
        else if (/avg|average|price|pre[cç]o|custo/.test(h)) guessed[i] = "avgBuyPrice"
        else guessed[i] = "ignore"
      })
      setColumnMap(guessed)
      setStep("map")
    } catch {
      setError(t('parseError'))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const tickerCol = Object.entries(columnMap).find(([, role]) => role === "ticker")?.[0]
  const quantityCol = Object.entries(columnMap).find(([, role]) => role === "quantity")?.[0]
  const avgBuyPriceCol = Object.entries(columnMap).find(([, role]) => role === "avgBuyPrice")?.[0]
  const canSubmit = tickerCol !== undefined && quantityCol !== undefined && avgBuyPriceCol !== undefined

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)
    try {
      const importRows = rows.map(row => ({
        ticker: row[Number(tickerCol)],
        quantity: Number(row[Number(quantityCol)].replace(',', '.')),
        avgBuyPrice: Number(row[Number(avgBuyPriceCol)].replace(',', '.')),
      }))

      const res = await fetch('/api/portfolio/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows }),
      })

      if (!res.ok) {
        setError(t('submitError'))
        return
      }

      const data = await res.json()
      setResults(data.results || [])
      setStep("result")
      onImported()
    } catch {
      setError(t('submitError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="glass rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">{t('title')}</h2>
          <button onClick={onClose} aria-label={t('close')} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-bear/10 text-bear text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {step === "upload" && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('description')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="w-4 h-4" />
              {t('chooseFile')}
            </Button>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('mapDescription')}</p>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    {headers.map((header, i) => (
                      <th key={i} className="p-2 text-left font-medium min-w-[140px]">
                        <div className="space-y-1.5">
                          <div className="text-xs text-muted-foreground font-normal truncate">{header}</div>
                          <Select
                            value={columnMap[i] || "ignore"}
                            onValueChange={(value) => setColumnMap(prev => ({ ...prev, [i]: (value ?? "ignore") as ColumnRole }))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ignore">{t('columns.ignore')}</SelectItem>
                              <SelectItem value="ticker">{t('columns.ticker')}</SelectItem>
                              <SelectItem value="quantity">{t('columns.quantity')}</SelectItem>
                              <SelectItem value="avgBuyPrice">{t('columns.avgBuyPrice')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-border/60">
                      {row.map((cell, j) => (
                        <td key={j} className="p-2 text-muted-foreground truncate max-w-[160px]">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && (
              <p className="text-xs text-muted-foreground">{t('moreRows', { count: rows.length - 5 })}</p>
            )}
            {!canSubmit && (
              <p className="text-sm text-bear">{t('mapIncomplete')}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>{t('back')}</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('confirmImport', { count: rows.length })}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border divide-y divide-border/60 max-h-80 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 text-sm">
                  <span className="font-medium">{r.ticker}</span>
                  {r.status === "added" && <span className="flex items-center gap-1.5 text-bull"><CheckCircle2 className="w-4 h-4" />{t('status.added')}</span>}
                  {r.status === "merged" && <span className="flex items-center gap-1.5 text-bull"><CheckCircle2 className="w-4 h-4" />{t('status.merged')}</span>}
                  {r.status === "unsupported" && <span className="flex items-center gap-1.5 text-muted-foreground"><AlertTriangle className="w-4 h-4" />{t('status.unsupported')}</span>}
                  {r.status === "invalid" && <span className="flex items-center gap-1.5 text-bear"><AlertTriangle className="w-4 h-4" />{t('status.invalid')}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t('done')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
