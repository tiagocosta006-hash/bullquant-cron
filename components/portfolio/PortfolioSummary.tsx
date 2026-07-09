import { useTranslations } from "next-intl"
import { TrendingUp, TrendingDown } from "lucide-react"
import { formatPrice, formatPercent } from "@/lib/finance/format"
import type { PositionPnl } from "@/lib/finance/portfolio"

interface PortfolioSummaryProps {
  positions: number
  upToday: number
  pnl: PositionPnl | null
}

export function PortfolioSummary({ positions, upToday, pnl }: PortfolioSummaryProps) {
  const t = useTranslations("portfolio")
  const isPositive = pnl ? pnl.pnlAbsolute >= 0 : true

  return (
    <div className="glass rounded-2xl p-5 md:p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {pnl ? (
          <>
            <div className="col-span-2 md:col-span-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                {t('summary.marketValue')}
              </p>
              <p className="nums text-2xl font-extrabold tracking-tight">{formatPrice(pnl.marketValue)}</p>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                {t('summary.totalPnl')}
              </p>
              <p className={`nums text-2xl font-extrabold tracking-tight flex items-center gap-1.5 ${isPositive ? 'text-bull' : 'text-bear'}`}>
                {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {isPositive ? '+' : ''}{formatPrice(pnl.pnlAbsolute)}
                <span className="text-base font-semibold opacity-80">({formatPercent(pnl.pnlPercent)})</span>
              </p>
            </div>
          </>
        ) : (
          <div className="col-span-2 md:col-span-2 flex items-center">
            <p className="text-sm text-muted-foreground">{t('summary.watchlistOnly')}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t('positions')}</p>
          <p className="nums text-2xl font-extrabold tracking-tight">{positions}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t('upToday')}</p>
          <p className="nums text-2xl font-extrabold tracking-tight text-bull flex items-center gap-1.5">
            <TrendingUp className="w-5 h-5" /> {upToday}
          </p>
        </div>
      </div>
    </div>
  )
}
