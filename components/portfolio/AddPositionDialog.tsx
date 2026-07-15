"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/**
 * Diálogo para adicionar/reforçar uma POSIÇÃO real no portfólio
 * (quantidade + preço médio de compra são obrigatórios — para seguir
 * sem posição existe a watchlist).
 */
export function AddPositionDialog({
  ticker,
  open,
  onOpenChange,
  onAdded,
}: {
  ticker: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}) {
  const t = useTranslations("portfolio.addPosition")
  const [quantity, setQuantity] = useState("")
  const [avgBuyPrice, setAvgBuyPrice] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedQuantity = Number.parseFloat(quantity.replace(",", "."))
  const parsedPrice = Number.parseFloat(avgBuyPrice.replace(",", "."))
  const isValid = Number.isFinite(parsedQuantity) && parsedQuantity > 0 &&
    Number.isFinite(parsedPrice) && parsedPrice > 0

  const reset = () => {
    setQuantity("")
    setAvgBuyPrice("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticker || !isValid || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/portfolio/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, quantity: parsedQuantity, avgBuyPrice: parsedPrice }),
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { ticker: ticker ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("confirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
