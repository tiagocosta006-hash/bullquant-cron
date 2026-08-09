import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from "next-intl"
import { X, Briefcase, Pencil, StickyNote } from "lucide-react"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { calculatePositionPnl } from "@/lib/finance/portfolio"
import { PriceChangeBadge } from "@/components/finance/PriceChangeBadge"
import { CompanyLogo } from "@/components/ui/CompanyLogo"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { PortfolioItem, PriceData } from "./types"

interface PortfolioCardProps {
  item: PortfolioItem
  price: PriceData | undefined
  onRemove: (ticker: string) => void
  /** quando definido (watchlist), mostra um botão para criar posição no portfólio */
  onAddPosition?: (ticker: string) => void
  /** quando definido (portfólio), mostra um botão para editar a posição */
  onEdit?: (ticker: string) => void
}

export function PortfolioCard({ item, price, onRemove, onAddPosition, onEdit }: PortfolioCardProps) {
  const t = useTranslations("portfolio")
  const locale = useLocale()
  const hasResolved = price !== undefined
  const hasValidPrice = hasResolved && price.error === undefined && price.currentPrice !== undefined

  const quantity = item.quantity !== null ? Number(item.quantity) : null
  const avgBuyPrice = item.avgBuyPrice !== null ? Number(item.avgBuyPrice) : null
  const fees = item.fees !== null && item.fees !== undefined ? Number(item.fees) : 0
  const hasPosition = quantity !== null && avgBuyPrice !== null
  const pnl = hasPosition && hasValidPrice
    ? calculatePositionPnl(quantity, avgBuyPrice, price.currentPrice as number, fees)
    : null

  const details = [
    // timeZone UTC: a data é guardada como meia-noite UTC — sem isto, fusos
    // negativos mostravam o dia anterior
    item.buyDate ? new Date(item.buyDate).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : null,
    item.broker || null,
    fees > 0 ? `${t("position.fees")} ${formatPrice(fees)}${item.currency ? ` ${item.currency}` : ""}` : null,
  ].filter(Boolean)

  return (
    <div className="block group relative">
      {/* ações sempre visíveis (subtis) — em hover ganham cor; remover não
          pode viver escondido só no hover (invisível em touch) */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(item.company.ticker)
        }}
        aria-label={t('card.remove')}
        title={t('card.remove')}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-background/80 border border-border/60 text-muted-foreground/70 hover:text-bear hover:border-bear/40 transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onEdit(item.company.ticker)
          }}
          aria-label={t('card.edit')}
          title={t('card.edit')}
          className="absolute top-3 right-11 z-10 p-1.5 rounded-full bg-background/80 border border-border/60 text-muted-foreground/70 hover:text-primary hover:border-primary/40 transition-all"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
      {onAddPosition && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onAddPosition(item.company.ticker)
          }}
          aria-label={t('card.addPosition')}
          className="absolute top-2.5 right-12 z-10 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 hover:scale-105 transition-all flex items-center gap-1.5 shadow-lg"
        >
          <Briefcase className="w-4 h-4" />
          <span>{t('card.addPosition')}</span>
        </button>
      )}
      <Link href={`/stock/${item.company.ticker}`} className="block">
        <div className="glass hover:-translate-y-0.5 transition-transform p-5 rounded-2xl flex flex-col h-full relative overflow-hidden">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <CompanyLogo
                src={item.company.logoUrl}
                alt={item.company.name}
                fallback={item.company.ticker}
                size={48}
              />
              <div>
                <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1">{item.company.ticker}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">{item.company.name}</p>
                {item.company.sector && (
                  <p className="text-xs text-muted-foreground line-clamp-1">{item.company.sector}</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-4 border-t border-border/40 flex items-end justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium mb-1">{t('card.currentPrice')}</p>
              {hasResolved ? (
                <div className="flex items-baseline gap-1">
                  <span className="nums text-2xl font-extrabold">{formatPrice(price.currentPrice)}</span>
                </div>
              ) : (
                <div className="h-8 w-24 bg-muted animate-pulse rounded"></div>
              )}
            </div>

            {hasValidPrice && (
              <PriceChangeBadge
                changePercent={price.changePercent}
                changeAbsoluteLabel={`${formatPrice(Math.abs(price.change ?? 0))} USD`}
              />
            )}
          </div>

          {hasPosition && (
            <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
              <div className="nums flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{quantity} {t('position.shares')}</span>
                <span>{t('position.avgCost')} {formatPrice(avgBuyPrice)}{item.currency ? ` ${item.currency}` : ''}</span>
              </div>
              {(details.length > 0 || item.notes) && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
                  <span className="truncate">{details.join(' · ')}</span>
                  {item.notes && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              aria-label={t('position.notes')}
                              className="shrink-0 cursor-help text-primary/70 hover:text-primary"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                            />
                          }
                        >
                          <StickyNote className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64 whitespace-pre-wrap">{item.notes}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              )}
              {pnl && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-medium">{t('position.pnl')}</span>
                  <span className={`nums text-sm font-bold ${pnl.pnlAbsolute >= 0 ? "text-bull" : "text-bear"}`}>
                    {pnl.pnlAbsolute >= 0 ? "+" : "-"}{formatPrice(Math.abs(pnl.pnlAbsolute))}
                    <span className="font-medium opacity-80 ml-1">
                      ({pnl.pnlAbsolute >= 0 ? "+" : "-"}{formatPercent(Math.abs(pnl.pnlPercent))})
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  )
}
