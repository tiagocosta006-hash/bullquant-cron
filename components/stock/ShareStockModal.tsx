"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Share2, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function ShareStockModal({
  ticker,
  companyName,
}: {
  ticker: string
  companyName: string
}) {
  const t = useTranslations("stock")
  const [downloading, setDownloading] = useState(false)
  const ogUrl = `/api/og/stock/${ticker}`

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch(ogUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `bullmetrics-${ticker.toLowerCase()}-snapshot.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Failed to download image", error)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="gap-2 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground font-semibold shadow-sm h-9 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            Partilhar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partilhar {companyName}</DialogTitle>
          <DialogDescription>
            Gera um cartão com os dados atualizados para partilhares a tua tese de investimento nas redes sociais.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 overflow-hidden rounded-xl border border-border bg-muted/30 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl}
            alt={`Snapshot ${ticker}`}
            className="w-full rounded-lg shadow-sm"
          />
        </div>

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "A transferir..." : "Guardar Imagem"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
