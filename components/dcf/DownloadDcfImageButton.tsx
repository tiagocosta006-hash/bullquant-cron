"use client"

import { useState } from "react"
import { Download, Loader2, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DownloadDcfImageButton({
  id,
  ticker,
}: {
  id: string
  ticker: string
}) {
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy", err)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await fetch(`/api/og/dcf/${id}`)
      if (!response.ok) throw new Error("Failed to fetch image")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `bullvalue-${ticker.toLowerCase()}-dcf.png`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Failed to download image", error)
      alert("Ocorreu um erro ao transferir a imagem. Tenta novamente.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        onClick={handleCopy}
        variant="outline"
        className="gap-2 border-border/50 bg-background/50 backdrop-blur-sm transition-colors"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-bull" /> Copiado!
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" /> Copiar Link
          </>
        )}
      </Button>

      <Button
        onClick={handleDownload}
        disabled={downloading}
        className="gap-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloading ? "A transferir..." : "Transferir Imagem"}
      </Button>
    </div>
  )
}
