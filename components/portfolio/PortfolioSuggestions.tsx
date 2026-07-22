import { useTranslations } from "next-intl"
import Link from "next/link"
import { ArrowRight, SearchCode } from "lucide-react"

export function PortfolioSuggestions() {
  const t = useTranslations("portfolio")

  return (
    <div className="mt-12 pt-8 border-t border-border/40">
      <Link
        href="/explore"
        className="flex items-center gap-4 p-6 rounded-2xl border border-dashed border-border/50 bg-background hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm transition-all group"
      >
        <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center shrink-0">
          <SearchCode className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{t('suggestions.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('suggestions.exploreMore')}</p>
        </div>
        <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
      </Link>
    </div>
  )
}
