"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Share2, Download, Loader2, Link as LinkIcon, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function ShareDcfModal({
  analysis,
  copiedId,
  onCopyLink,
  ticker,
}: {
  analysis: any
  copiedId: string | null
  onCopyLink: () => void
  ticker: string
}) {
  const t = useTranslations("stock") // Reuse translations if applicable, or custom text
  const [downloading, setDownloading] = useState(false)
  
  const ogUrl = `/api/og/dcf/${analysis.id}`

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch(ogUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `bullvalue-dcf-${ticker.toLowerCase()}.png`
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

  const triggerIcon = copiedId === analysis.id ? (
    <Check className="h-3.5 w-3.5 text-green-500" />
  ) : analysis.isPublic ? (
    <LinkIcon className="h-3.5 w-3.5" />
  ) : (
    <Share2 className="h-3.5 w-3.5" />
  )

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" title="Partilhar Análise">
            {triggerIcon}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partilhar Cenário DCF</DialogTitle>
          <DialogDescription>
            Gera um cartão com os teus pressupostos para partilhares nas redes sociais ou cria um link público interativo.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 overflow-hidden rounded-xl border border-border bg-muted/30 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ogUrl}
            alt={`Snapshot DCF`}
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
            {downloading ? "A transferir..." : "Transferir Imagem"}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
            onClick={onCopyLink}
          >
            {copiedId === analysis.id ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
            {copiedId === analysis.id ? "Link copiado!" : "Copiar Link Público"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
