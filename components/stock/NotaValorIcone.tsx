"use client"

/**
 * Mini aviso junto a um número dos fundamentais que foi corrigido ou
 * reexpresso (ver lib/notasValores.ts). Popover em vez de tooltip: abre com
 * um toque no telemóvel e deixa clicar no link do relatório.
 */
import { useLocale, useTranslations } from "next-intl"
import { Info, ShieldCheck } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { NotaValor } from "@/lib/notasValores"
import { cn } from "@/lib/utils"

export function NotaValorIcone({ nota, className }: { nota: NotaValor | undefined; className?: string }) {
  const t = useTranslations("notasValor")
  const locale = useLocale()
  if (!nota) return null

  const correcao = nota.kind === "correcao"
  const titulo = correcao ? t("correcao") : nota.kind === "definicao" ? t("definicao") : t("reexpressao")
  const motivo = locale === "pt" ? nota.reasonPt : nota.reasonEn || nota.reasonPt
  const Icone = correcao ? ShieldCheck : Info

  return (
    <Popover>
      <PopoverTrigger
        aria-label={titulo}
        className={cn(
          "ml-1 inline-flex align-middle rounded-sm opacity-70 hover:opacity-100 focus-visible:opacity-100",
          correcao ? "text-amber-500" : "text-sky-500",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Icone className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-left text-xs leading-relaxed">
        <p className="font-semibold mb-1">{titulo}</p>
        <p className="text-muted-foreground">{motivo}</p>
        {correcao && <p className="mt-2 text-muted-foreground italic">{t("ia")}</p>}
        {nota.sourceUrl && (
          <a
            href={nota.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block font-medium text-primary underline-offset-2 hover:underline"
          >
            {t("verRelatorio")} ↗
          </a>
        )}
      </PopoverContent>
    </Popover>
  )
}
