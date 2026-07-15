"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

/** Valores iniciais para o modo edição (números podem vir como string do JSON). */
export type PositionInitial = {
  quantity: number | string | null
  avgBuyPrice: number | string | null
  buyDate?: string | null
  broker?: string | null
  currency?: string | null
  fees?: number | string | null
  notes?: string | null
}

const toInput = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "" : String(v)

/**
 * Diálogo para adicionar/reforçar (modo "add") ou editar (modo "edit") uma
 * POSIÇÃO real no portfólio. Quantidade + preço médio são obrigatórios;
 * data de compra, corretora, moeda, taxas e notas são opcionais.
 * No modo add com posição existente, o backend funde por média ponderada.
 */
export function AddPositionDialog({
  ticker,
  open,
  onOpenChange,
  onAdded,
  mode = "add",
  initial,
}: {
  ticker: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
  mode?: "add" | "edit"
  initial?: PositionInitial | null
}) {
  const t = useTranslations("portfolio.addPosition")
  const [quantity, setQuantity] = useState("")
  const [avgBuyPrice, setAvgBuyPrice] = useState("")
  const [buyDate, setBuyDate] = useState("")
  const [broker, setBroker] = useState("")
  const [currency, setCurrency] = useState("")
  const [fees, setFees] = useState("")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pré-preenche no modo edição sempre que o diálogo abre
  useEffect(() => {
    if (open && mode === "edit" && initial) {
      setQuantity(toInput(initial.quantity))
      setAvgBuyPrice(toInput(initial.avgBuyPrice))
      setBuyDate(initial.buyDate ? initial.buyDate.slice(0, 10) : "")
      setBroker(initial.broker ?? "")
      setCurrency(initial.currency ?? "")
      setFees(toInput(initial.fees))
      setNotes(initial.notes ?? "")
    }
  }, [open, mode, initial])

  const parsedQuantity = Number.parseFloat(quantity.replace(",", "."))
  const parsedPrice = Number.parseFloat(avgBuyPrice.replace(",", "."))
  const parsedFees = fees.trim() === "" ? undefined : Number.parseFloat(fees.replace(",", "."))
  const isValid = Number.isFinite(parsedQuantity) && parsedQuantity > 0 &&
    Number.isFinite(parsedPrice) && parsedPrice > 0 &&
    (parsedFees === undefined || (Number.isFinite(parsedFees) && parsedFees >= 0))

  const reset = () => {
    setQuantity("")
    setAvgBuyPrice("")
    setBuyDate("")
    setBroker("")
    setCurrency("")
    setFees("")
    setNotes("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticker || !isValid || isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    const details =
      mode === "edit"
        ? {
            // edição: campo vazio LIMPA o valor (null)
            buyDate: buyDate || null,
            broker: broker.trim() || null,
            currency: currency.trim().toUpperCase() || null,
            fees: parsedFees ?? null,
            notes: notes.trim() || null,
          }
        : {
            // add: só envia o que foi preenchido
            ...(buyDate ? { buyDate } : {}),
            ...(broker.trim() ? { broker: broker.trim() } : {}),
            ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}),
            ...(parsedFees !== undefined ? { fees: parsedFees } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }

    try {
      const res = await fetch(mode === "edit" ? "/api/portfolio/update" : "/api/portfolio/add", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, quantity: parsedQuantity, avgBuyPrice: parsedPrice, ...details }),
      })
      if (!res.ok) {
        setError(t("error"))
        return
      }
      reset()
      onOpenChange(false)
      onAdded()
    } catch {
      setError(t("error"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("editTitle", { ticker: ticker ?? "" }) : t("title", { ticker: ticker ?? "" })}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="position-quantity" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("quantityLabel")}
              </label>
              <Input
                id="position-quantity"
                inputMode="decimal"
                placeholder="10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="position-price" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("priceLabel")}
              </label>
              <Input
                id="position-price"
                inputMode="decimal"
                placeholder="150.00"
                value={avgBuyPrice}
                onChange={(e) => setAvgBuyPrice(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="position-date" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("dateLabel")}
              </label>
              <Input
                id="position-date"
                type="date"
                value={buyDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setBuyDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="position-broker" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("brokerLabel")}
              </label>
              <Input
                id="position-broker"
                placeholder="Trading212, Degiro…"
                maxLength={60}
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="position-currency" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("currencyLabel")}
              </label>
              <Input
                id="position-currency"
                placeholder="USD"
                maxLength={6}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="uppercase"
              />
            </div>
            <div>
              <label htmlFor="position-fees" className="mb-1.5 block text-sm font-medium text-foreground">
                {t("feesLabel")}
              </label>
              <Input
                id="position-fees"
                inputMode="decimal"
                placeholder="0.00"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="position-notes" className="mb-1.5 block text-sm font-medium text-foreground">
              {t("notesLabel")}
            </label>
            <Textarea
              id="position-notes"
              rows={2}
              maxLength={1000}
              placeholder={t("notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "edit" ? t("save") : t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
