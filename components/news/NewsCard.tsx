import Link from "next/link";
import type { NewsArticleDTO } from "@/lib/news/serialize";
import { CategoryBadge, SentimentBadge, TickerBadges, timeAgoPt } from "./shared";

export function NewsCard({ article, locale }: { article: NewsArticleDTO; locale: string }) {
  return (
    <article className="group relative flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {article.imageProxyUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- imagens de domínios de terceiros arbitrários
        <img
          src={article.imageProxyUrl}
          alt=""
          loading="lazy"
          className="hidden h-24 w-32 shrink-0 rounded-lg bg-muted object-cover sm:block"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={article.categoria} />
          <SentimentBadge sentimento={article.sentimento} />
          <span className="text-xs text-muted-foreground">{timeAgoPt(article.publishedAt)}</span>
        </div>

        <h2 className="text-base font-semibold leading-snug text-foreground">
          {/* O link cobre o cartão inteiro; os badges de ticker ficam por cima. */}
          <Link href={`/${locale}/news/${article.slug}`} className="before:absolute before:inset-0">
            {article.titulo}
          </Link>
        </h2>

        <p className="line-clamp-2 text-sm text-muted-foreground">{article.resumo}</p>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <TickerBadges tickers={article.tickers} locale={locale} />
        </div>
      </div>
    </article>
  );
}
