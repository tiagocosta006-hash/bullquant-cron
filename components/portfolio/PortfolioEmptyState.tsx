import { useTranslations } from "next-intl"
import { Search, Loader2, ArrowRight } from "lucide-react"

const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN"]

interface PortfolioEmptyStateProps {
  addingTicker: string | null
  onQuickAdd: (ticker: string) => void
}

export function PortfolioEmptyState({ addingTicker, onQuickAdd }: PortfolioEmptyStateProps) {
  const t = useTranslations("portfolio")

  return (
    <div className="glass rounded-2xl p-12 text-center">
      <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
        <Search className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-2">{t('emptyState.title')}</h3>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">
        {t('emptyState.description')}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
        {DEFAULT_TICKERS.map(ticker => (
          <button
            key={ticker}
            onClick={() => onQuickAdd(ticker)}
            disabled={addingTicker === ticker}
            className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/50 bg-background hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm transition-all group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <span className="font-extrabold text-lg group-hover:text-primary transition-colors">{ticker}</span>
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-1">
              {addingTicker === ticker ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> {t('emptyState.adding')}</>
              ) : (
                <>{t('emptyState.quickAdd')} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity -ml-2 group-hover:ml-0" /></>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
