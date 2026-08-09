"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { captureCardToBlob } from "@/lib/exportChart"
import { SHARE_PALETTE } from "@/lib/shareTheme"
import { CARD_H, CARD_W, ChartShareCard, type SharePrice } from "./ChartShareCard"
import type { ChartConfig } from "./DecisionChart"
import { useShareCompany } from "./StockShareContext"

type ChartShareButtonProps = {
  title: string
  subtitle?: string
  data: Record<string, unknown>[]
  type: "BAR" | "LINE" | "COMPOSED" | "STACKED_BAR" | "AREA"
  config: ChartConfig
  cagr?: number | null
  currencySymbol?: string
  hiddenKeys?: string[]
  /** Classe do gatilho, para encaixar na toolbar de cada gráfico. */
  className?: string
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // tira acentos (Receita Liquida)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Botão "partilhar gráfico" — abre um modal que rasteriza o cartão logo ao
 * abrir e mostra o PNG resultante. O preview é a imagem final, não uma
 * réplica: guardar/partilhar/copiar reutilizam esse mesmo blob.
 *
 * Esconde-se sozinho fora da página de stock (sem `StockShareProvider` não há
 * empresa para estampar no cartão).
 */
export function ChartShareButton({
  title,
  subtitle,
  data,
  type,
  config,
  cagr,
  currencySymbol = "$",
  hiddenKeys,
  className,
}: ChartShareButtonProps) {
  const t = useTranslations("stock.share")
  const locale = useLocale()
  const company = useShareCompany()
  const cardRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  // `pending` enquanto o preço não chegou: rasterizar antes disso produzia um
  // cartão com "N/A" e obrigava a uma segunda rasterização quando o preço
  // aterrasse — o dobro do trabalho para o mesmo resultado.
  const [price, setPrice] = useState<SharePrice | null | "pending">("pending")
  /** O PNG gerado — é ele que se vê no preview E o que se guarda/partilha. */
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState<null | "download" | "share" | "copy">(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  // Capacidades do browser só depois do mount: avaliadas no render, o servidor
  // diria sempre "não" e a hidratação acusava mismatch nos botões.
  const [caps, setCaps] = useState({ share: false, copy: false })

  useEffect(() => {
    setCaps({
      share:
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [new File([], "x.png", { type: "image/png" })] }),
      copy: "ClipboardItem" in window && !!navigator.clipboard?.write,
    })
  }, [])

  const ticker = company?.ticker

  // Preço só quando o modal abre: o cartão precisa dele uma vez, e assim não
  // se duplica o polling de 60s que o StockHeader já faz.
  useEffect(() => {
    if (!open || !ticker) return
    let cancelled = false
    fetch(`/api/price/${ticker}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled) return
        setPrice(
          json
            ? { currentPrice: json.currentPrice, change: json.change, changePercent: json.changePercent }
            : null,
        )
      })
      .catch(() => {
        // Cartão sai com "N/A" no preço — o gráfico é o conteúdo principal.
        if (!cancelled) setPrice(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, ticker])

  // Rasteriza uma vez, logo que o preço esteja resolvido. O preview mostra a
  // imagem real em vez de uma réplica em DOM escalada — o que se vê é
  // exatamente o que sai.
  useEffect(() => {
    if (!open || price === "pending") return
    let cancelled = false
    const id = requestAnimationFrame(async () => {
      if (!cardRef.current) return
      try {
        const blob = await captureCardToBlob(cardRef.current, {
          width: CARD_W,
          height: CARD_H,
          background: SHARE_PALETTE.bg,
        })
        if (cancelled) return
        setPng((prev) => {
          if (prev) URL.revokeObjectURL(prev.url)
          return { blob, url: URL.createObjectURL(blob) }
        })
      } catch (error) {
        if (!cancelled) {
          console.error("Falha a gerar o cartão de partilha", error)
          setFailed(true)
        }
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [open, price])

  // Fechar liberta o blob e força uma geração fresca no próximo open.
  useEffect(() => {
    if (open) return
    setPng((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setPrice("pending")
    setFailed(false)
  }, [open])

  const filename = `bullvalue-${slug(ticker ?? "chart")}-${slug(title)}.png`

  const run = async (action: "download" | "share" | "copy") => {
    const blob = png?.blob
    if (!blob) return
    setBusy(action)
    setFailed(false)
    try {
      if (action === "download") {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = filename
        // No DOM antes do click (o Firefox ignora âncoras destacadas) e o
        // revoke adiado — revogar na mesma tarefa cancela o download antes
        // de o browser chegar a ler o blob.
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
      } else if (action === "share") {
        const file = new File([blob], filename, { type: "image/png" })
        await navigator.share({ files: [file], title: `${company?.name} · ${title}` })
      } else {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (error) {
      // Cancelar o share sheet nativo é um AbortError — não é uma falha.
      if ((error as Error)?.name !== "AbortError") {
        console.error("Falha a gerar o cartão de partilha", error)
        setFailed(true)
      }
    } finally {
      setBusy(null)
    }
  }

  if (!company) return null

  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date())

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={className}
        title={t("button")}
        aria-label={t("button")}
        render={
          <button type="button">
            <Share2 className="h-4 w-4" />
          </button>
        }
      />
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Preview = o PNG gerado, não uma réplica em DOM: uma imagem encolhe
            sozinha com a largura do modal, sem escalas calculadas à mão. */}
        <div
          className="my-2 w-full overflow-hidden rounded-xl border border-border bg-muted/30"
          style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
        >
          {png ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={png.url} alt={`${company.name} — ${title}`} className="block h-full w-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* O cartão vive fora do ecrã: precisa de layout real para ser
            rasterizado, por isso é deslocado — nunca `display: none`. */}
        <div aria-hidden className="pointer-events-none fixed left-[-20000px] top-0" style={{ width: CARD_W }}>
          <ChartShareCard
            ref={cardRef}
            company={company}
            price={price === "pending" ? null : price}
            title={title}
            subtitle={subtitle}
            data={data}
            type={type}
            config={config}
            cagr={cagr}
            cagrLabel={t("cagrLabel")}
            currencySymbol={currencySymbol}
            disclaimer={t("disclaimer")}
            dateLabel={dateLabel}
            hiddenKeys={hiddenKeys}
          />
        </div>

        {failed && <p className="text-sm text-bear">{t("error")}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="button" className="flex-1 gap-2" onClick={() => run("download")} disabled={busy !== null || !png}>
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy === "download" ? t("working") : t("download")}
          </Button>

          {caps.share && (
            <Button
              type="button"
              variant="secondary"
              className="flex-1 gap-2"
              onClick={() => run("share")}
              disabled={busy !== null || !png}
            >
              {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              {t("shareAction")}
            </Button>
          )}

          {caps.copy && (
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() => run("copy")}
              disabled={busy !== null || !png}
            >
              {busy === "copy" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : copied ? (
                <Check className="h-4 w-4 text-bull" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? t("copied") : t("copy")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
