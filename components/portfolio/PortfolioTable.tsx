import { Link } from '@/i18n/routing';
import { useTranslations } from "next-intl"
import { X, Pencil } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import { calculatePositionPnl, positionWeight } from "@/lib/finance/portfolio"
import { PriceChangeBadge } from "@/components/finance/PriceChangeBadge"
import { CompanyLogo } from "@/components/ui/CompanyLogo"
import type { PortfolioItem, PriceData } from "./types"

interface PortfolioTableProps {
  items: PortfolioItem[]
  prices: Record<string, PriceData>
  onRemove: (ticker: string) => void
  onEdit?: (ticker: string) => void
}

export function PortfolioTable({ items, prices, onRemove, onEdit }: PortfolioTableProps) {
  const t = useTranslations("portfolio")
  const hasAnyPosition = items.some(item => item.quantity !== null && item.avgBuyPrice !== null)

  // Valor de mercado por posição, para o peso. Mesma convenção do
  // PortfolioAllocation (quantidade × preço atual, só posições reais) — se as duas
  // vistas usassem regras diferentes, os pesos contradiziam-se na mesma página.
  const marketValueById = new Map<string, number>()
  for (const item of items) {
    const price = prices[item.company.ticker]
    const quantity = item.quantity !== null ? Number(item.quantity) : null
    if (quantity !== null && price?.error === undefined && price?.currentPrice !== undefined) {
      marketValueById.set(item.id, quantity * price.currentPrice)
    }
  }
  const totalMarketValue = Array.from(marketValueById.values()).reduce((sum, v) => sum + v, 0)

  return (
    <div className="glass rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>{t('table.company')}</TableHead>
            <TableHead>{t('table.sector')}</TableHead>
            <TableHead className="text-right">{t('card.currentPrice')}</TableHead>
            <TableHead className="text-right">{t('table.change')}</TableHead>
            {hasAnyPosition && <TableHead className="text-right">{t('table.weight')}</TableHead>}
            {hasAnyPosition && <TableHead className="text-right">{t('table.pnl')}</TableHead>}
            <TableHead className="text-right">{t('table.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const price = prices[item.company.ticker]
            const hasResolved = price !== undefined
            const hasValidPrice = hasResolved && price.error === undefined && price.currentPrice !== undefined
            const quantity = item.quantity !== null ? Number(item.quantity) : null
            const avgBuyPrice = item.avgBuyPrice !== null ? Number(item.avgBuyPrice) : null
            const fees = item.fees !== null && item.fees !== undefined ? Number(item.fees) : 0
            const pnl = quantity !== null && avgBuyPrice !== null && hasValidPrice
              ? calculatePositionPnl(quantity, avgBuyPrice, price.currentPrice as number, fees)
              : null
            const weight = positionWeight(marketValueById.get(item.id), totalMarketValue)

            return (
              <TableRow key={item.id} className="group hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium">
                  <Link href={`/stock/${item.company.ticker}`} className="flex items-center gap-3">
                    <CompanyLogo
                      src={item.company.logoUrl}
                      alt={item.company.name}
                      fallback={item.company.ticker}
                      size={32}
                      imgClassName="p-0.5"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{item.company.ticker}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">{item.company.name}</span>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.company.sector || "N/A"}</TableCell>
                <TableCell className="text-right nums">
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
                  <TableCell className="text-right nums">
                    {weight !== null ? formatPercent(weight) : (
                      <span className="text-muted-foreground text-sm">N/A</span>
                    )}
                  </TableCell>
                )}
                {hasAnyPosition && (
                  <TableCell className="text-right nums">
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
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(item.company.ticker)}
                      aria-label={t('card.edit')}
                      title={t('card.edit')}
                      className="inline-flex items-center justify-center rounded-md h-9 w-9 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(item.company.ticker)}
                    aria-label={t('card.remove')}
                    title={t('card.remove')}
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
