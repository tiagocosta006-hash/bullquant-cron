"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Newspaper, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewsArticle {
  id: number;
  datetime: number;
  headline: string;
  summary: string | null;
  source: string;
  url: string;
  image: string | null;
}

const DEFAULT_LIMIT = 8;

function timeAgo(unixTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Sub-components defined OUTSIDE main component (React perf rule) ───────────

function NewsCardSkeleton({ withImage }: { withImage: boolean }) {
  return (
    <div className="flex gap-4 rounded-xl border border-border bg-card p-4 animate-pulse">
      {withImage && <div className="h-[72px] w-24 shrink-0 rounded-lg bg-muted" />}
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-3 w-16 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-3/4 rounded bg-muted" />
      </div>
    </div>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const t = useTranslations("news");
  const hasImage = Boolean(article.image);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex gap-4 rounded-xl border border-border bg-card transition-all",
        "hover:border-primary/40 hover:bg-accent/30 hover:shadow-md",
        hasImage ? "p-3" : "px-4 py-3.5"
      )}
    >
      {/* Thumbnail — only shown for real article images */}
      {hasImage && (
        <div className="relative h-[72px] w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.image!}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              // If image fails to load, hide the whole thumbnail div
              const parent = (e.currentTarget as HTMLImageElement).parentElement;
              if (parent) parent.style.display = "none";
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* Source + time */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            {article.source}
          </span>
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo(article.datetime)}
          </span>
        </div>

        {/* Headline */}
        <h3
          className={cn(
            "font-semibold leading-snug text-foreground transition-colors group-hover:text-primary",
            hasImage ? "line-clamp-2 text-sm" : "line-clamp-1 text-sm"
          )}
        >
          {article.headline}
        </h3>

        {/* Read more hint — only visible on hover */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <ExternalLink className="h-3 w-3" />
          <span>{t("readMore")}</span>
        </div>
      </div>
    </a>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function StockNews({ ticker }: { ticker: string }) {
  const t = useTranslations("news");
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/news/${ticker}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setArticles(d.articles ?? []);
      })
      .catch(() => active && setArticles([]));
    return () => {
      active = false;
    };
  }, [ticker]);

  const visible = articles
    ? isExpanded
      ? articles
      : articles.slice(0, DEFAULT_LIMIT)
    : null;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {articles && articles.length > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">{t("source")}</span>
        )}
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {visible === null ? (
          // Loading skeletons — alternate between with/without image
          Array.from({ length: DEFAULT_LIMIT }).map((_, i) => (
            <NewsCardSkeleton key={i} withImage={i < 3} />
          ))
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-12 text-center">
            <Newspaper className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t("emptyDesc")}</p>
          </div>
        ) : (
          visible.map((article) => <NewsCard key={article.id} article={article} />)
        )}
      </div>

      {/* Show more / less */}
      {articles && articles.length > DEFAULT_LIMIT && (
        <div className="mt-2 rounded-xl border border-border bg-muted/20 px-4 py-3 text-center">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              "text-xs font-semibold transition-colors",
              isExpanded
                ? "text-muted-foreground hover:text-foreground"
                : "text-primary hover:text-primary/80"
            )}
          >
            {isExpanded
              ? t("showLess")
              : t("showMore", { n: articles.length - DEFAULT_LIMIT })}
          </button>
        </div>
      )}
    </div>
  );
}
