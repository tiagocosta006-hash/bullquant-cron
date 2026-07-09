import Link from "next/link"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { calculatePositionPnl } from "@/lib/finance/portfolio"
import { PriceChangeBadge } from "@/components/finance/PriceChangeBadge"
import type { PortfolioItem, PriceData } from "./types"

interface PortfolioTableProps {
  items: PortfolioItem[]
  prices: Record<string, PriceData>
  onRemove: (ticker: string) => void
}

export function PortfolioTable({ items, prices, onRemove }: PortfolioTableProps) {
  const t = useTranslations("portfolio")
  const hasAnyPosition = items.some(item => item.quantity !== null && item.avgBuyPrice !== null)

  return (
    <div className="glass rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>{t('table.company')}</TableHead>
            <TableHead>{t('table.sector')}</TableHead>
            <TableHead className="text-right">{t('table.roic')}</TableHead>
            <TableHead className="text-right">{t('table.grossMargin')}</TableHead>
            <TableHead className="text-right">{t('card.currentPrice')}</TableHead>
            <TableHead className="text-right">{t('table.change')}</TableHead>
            {hasAnyPosition && <TableHead className="text-right">{t('table.pnl')}</TableHead>}
            <TableHead className="text-right">{t('table.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const price = prices[item.company.ticker]
            const hasResolved = price !== undefined
            const hasValidPrice = hasResolved && price.error === undefined && price.currentPrice !== undefined
            const fundamental = item.company.fundamentals?.[0]
            const quantity = item.quantity !== null ? Number(item.quantity) : null
            const avgBuyPrice = item.avgBuyPrice !== null ? Number(item.avgBuyPrice) : null
            const pnl = quantity !== null && avgBuyPrice !== null && hasValidPrice
              ? calculatePositionPnl(quantity, avgBuyPrice, price.currentPrice as number)
              : null

            return (
              <TableRow key={item.id} className="group hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium">
                  <Link href={`/stock/${item.company.ticker}`} className="flex items-center gap-3">
                    {item.company.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${item.company.logoUrl}?v=1`} alt={item.company.name} referrerPolicy="no-referrer" className="w-8 h-8 object-contain rounded bg-white p-0.5" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {item.company.ticker.slice(0, 2)}
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{item.company.ticker}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">{item.company.name}</span>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.company.sector || "N/A"}</TableCell>
                <TableCell className="text-right font-mono">{formatPercent(fundamental?.roic ?? null)}</TableCell>
                <TableCell className="text-right font-mono">{formatPercent(fundamental?.grossMargin ?? null)}</TableCell>
                <TableCell className="text-right font-mono">
                  {hasResolved ? formatPrice(price.currentPrice) : (
                    <span className="inline-block h-4 w-16 bg-muted animate-pulse rounded align-middle" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {hasValidPrice ? (
                    <div className="flex justify-end">
                      <PriceChangeBadge changePercent={price.changePercent} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">N/A</span>
                  )}
                </TableCell>
                {hasAnyPosition && (
                  <TableCell className="text-right font-mono">
                    {pnl ? (
                      <span className={pnl.pnlAbsolute >= 0 ? "text-bull" : "text-bear"}>
                        {pnl.pnlAbsolute >= 0 ? "+" : ""}{formatPrice(pnl.pnlAbsolute)} ({formatPercent(pnl.pnlPercent)})
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(item.company.ticker)}
                    aria-label={t('card.remove')}
                    className="inline-flex items-center justify-center rounded-md h-9 w-9 text-muted-foreground hover:text-bear hover:bg-bear/10 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
