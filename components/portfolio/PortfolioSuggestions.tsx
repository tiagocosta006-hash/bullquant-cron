import { useTranslations } from "next-intl"
import Link from "next/link"
import { Loader2, ArrowRight, SearchCode } from "lucide-react"

interface PortfolioSuggestionsProps {
  tickers: string[]
  addingTicker: string | null
  onQuickAdd: (ticker: string) => void
}

export function PortfolioSuggestions({ tickers, addingTicker, onQuickAdd }: PortfolioSuggestionsProps) {
  const t = useTranslations("portfolio")

  if (tickers.length === 0) return null

  return (
    <div className="mt-12 pt-8 border-t border-border/40">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
        {t('suggestions.title')}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
        {tickers.map(ticker => (
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
        <Link
          href="/explore"
          className="flex flex-col items-center justify-center p-4 rounded-xl border border-dashed border-border/50 bg-background hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm transition-all group"
        >
          <SearchCode className="w-5 h-5 text-primary" />
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-2 text-center">
            {t('suggestions.exploreMore')}
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity -ml-2 group-hover:ml-0" />
          </span>
        </Link>
      </div>
    </div>
  )
}
