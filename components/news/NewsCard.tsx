import { Link } from "@/i18n/routing";
import type { NewsArticleDTO } from "@/lib/news/serialize";
import { dataNoticia } from "@/lib/news/seo";
import { CategoryBadge, SentimentBadge, TickerBadges, timeAgoPt } from "./shared";

import { ImageWithFallback } from "./ImageWithFallback";

export function NewsCard({ article }: { article: NewsArticleDTO }) {
  return (
    <article className="group relative flex gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {article.imageProxyUrl && (
        <ImageWithFallback
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
          <time dateTime={article.publishedAt} title={dataNoticia(article.publishedAt)} className="text-xs text-muted-foreground">
            {timeAgoPt(article.publishedAt)}
          </time>
        </div>

        <h2 className="text-base font-semibold leading-snug text-foreground">
          {/* O link cobre o cartão inteiro; os badges de ticker ficam por cima. */}
          <Link href={`/news/${article.slug}`} className="before:absolute before:inset-0">
            {article.titulo}
          </Link>
        </h2>

        <p className="line-clamp-2 text-sm text-muted-foreground">{article.resumo}</p>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <TickerBadges tickers={article.tickers} />
        </div>
      </div>
    </article>
  );
}
