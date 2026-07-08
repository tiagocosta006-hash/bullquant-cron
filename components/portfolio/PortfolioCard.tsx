import Link from "next/link"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { calculatePositionPnl } from "@/lib/finance/portfolio"
import { PriceChangeBadge } from "@/components/finance/PriceChangeBadge"
import type { PortfolioItem, PriceData } from "./types"

interface PortfolioCardProps {
  item: PortfolioItem
  price: PriceData | undefined
  onRemove: (ticker: string) => void
}

export function PortfolioCard({ item, price, onRemove }: PortfolioCardProps) {
  const t = useTranslations("portfolio")
  const hasResolved = price !== undefined
  const hasValidPrice = hasResolved && price.error === undefined && price.currentPrice !== undefined

  const quantity = item.quantity !== null ? Number(item.quantity) : null
  const avgBuyPrice = item.avgBuyPrice !== null ? Number(item.avgBuyPrice) : null
  const hasPosition = quantity !== null && avgBuyPrice !== null
  const pnl = hasPosition && hasValidPrice
    ? calculatePositionPnl(quantity, avgBuyPrice, price.currentPrice as number)
    : null

  return (
    <div className="block group relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(item.company.ticker)
        }}
        aria-label={t('card.remove')}
        className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-background/80 border border-border/60 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-bear hover:border-bear/40 transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <Link href={`/stock/${item.company.ticker}`} className="block">
        <div className="bg-card border border-border/60 hover:border-primary/50 hover:shadow-md transition-all p-5 rounded-2xl flex flex-col h-full relative overflow-hidden">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/5 p-2 rounded-lg border border-primary/10 flex items-center justify-center shrink-0 w-12 h-12">
                {item.company.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${item.company.logoUrl}?v=1`} alt={item.company.name} referrerPolicy="no-referrer" className="w-8 h-8 object-contain rounded bg-white p-0.5" />
                ) : (
                  <span className="font-bold text-primary">{item.company.ticker[0]}</span>
                )}
              </div>
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
                <span>{t('position.avgCost')} {formatPrice(avgBuyPrice)}</span>
              </div>
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
