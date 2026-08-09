import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeArticle } from "@/lib/news/serialize";
import {
  ArticleFooter,
  CategoryBadge,
  InlineMarkdown,
  SentimentBadge,
  TickerBadges,
  timeAgoPt,
} from "@/components/news/shared";

export const revalidate = 300;

const ARTICLE_SELECT = {
  id: true,
  slug: true,
  titulo: true,
  resumoCurto: true,
  corpo: true,
  impacto: true,
  categoria: true,
  tickers: true,
  sentimento: true,
  imageUrl: true,
  publishedAt: true,
  sources: true,
  status: true,
} as const;

async function getArticle(slug: string) {
  const article = await prisma.newsArticle.findUnique({
    where: { slug },
    select: ARTICLE_SELECT,
  });
  // Drafts e arquivados não são acessíveis por URL direto.
  return article && article.status === NewsStatus.PUBLISHED ? article : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Notícia não encontrada | Bull Value" };

  return {
    title: `${article.titulo} | Bull Value`,
    description: article.resumoCurto,
    openGraph: {
      title: article.titulo,
      description: article.resumoCurto,
      type: "article",
      publishedTime: article.publishedAt.toISOString(),
      images: article.imageUrl ? [article.imageUrl] : undefined,
    },
  };
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const row = await getArticle(slug);
  if (!row) notFound();

  const article = serializeArticle(row, locale);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/${locale}/news`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Terminal de Notícias
      </Link>

      <article>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={article.categoria} />
          <SentimentBadge sentimento={article.sentimento} />
          <span className="text-xs text-muted-foreground">
            {timeAgoPt(article.publishedAt)}
          </span>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
          {article.titulo}
        </h1>

        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          {article.resumo}
        </p>

        {article.tickers.length > 0 && (
          <div className="mt-4">
            <TickerBadges tickers={article.tickers} locale={locale} />
          </div>
        )}

        {article.imageProxyUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- domínios de terceiros arbitrários
          <img
            src={article.imageProxyUrl}
            alt=""
            // O `bg-muted` evita o rectângulo branco enorme quando o CDN da
            // fonte deixa de servir a imagem: fica um bloco neutro em vez de
            // um ícone de imagem partida no meio da página.
            className="mt-6 aspect-video w-full rounded-xl bg-muted object-cover"
          />
        )}

        {/* O corpo vem do LLM com markdown inline mínimo (negrito/itálico).
            O InlineMarkdown constrói nós React — nunca injetamos HTML gerado. */}
        <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed">
          {article.corpo
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((paragrafo, i) => (
              <p key={i}>
                <InlineMarkdown text={paragrafo} />
              </p>
            ))}
        </div>

        <section className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <TrendingUp className="h-4 w-4" />
            Impacto nos mercados
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed">
            <InlineMarkdown text={article.impacto} />
          </p>
        </section>

        <ArticleFooter sources={article.sources} className="mt-8" />
      </article>
    </div>
  );
}
