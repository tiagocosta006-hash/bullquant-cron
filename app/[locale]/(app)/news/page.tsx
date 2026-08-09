import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { NewsCategory, NewsStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeArticle } from "@/lib/news/serialize";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters } from "@/components/news/NewsFilters";

// O feed muda de hora a hora (ingest-news.yml); 5 min de ISR chega para
// absorver o tráfego sem nunca mostrar um terminal visivelmente parado.
export const revalidate = 300;

const PAGE_SIZE = 20;

export const metadata: Metadata = {
  title: "Terminal de Notícias | Bull Value",
  description:
    "As notícias financeiras internacionais que estão a mover os mercados, resumidas em português por Bull Value.",
};

export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ categoria?: string; pagina?: string }>;
}) {
  const { locale } = await params;
  const { categoria, pagina } = await searchParams;

  const page = Math.max(1, Number.parseInt(pagina ?? "", 10) || 1);

  const where: Prisma.NewsArticleWhereInput = { status: NewsStatus.PUBLISHED };
  if (categoria && categoria.toUpperCase() in NewsCategory) {
    where.categoria = categoria.toUpperCase() as NewsCategory;
  }

  const [rows, total] = await Promise.all([
    prisma.newsArticle.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
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
      },
    }),
    prisma.newsArticle.count({ where }),
  ]);

  const articles = rows.map((a) => serializeArticle(a, locale));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (categoria) params.set("categoria", categoria);
    if (n > 1) params.set("pagina", String(n));
    const qs = params.toString();
    return qs ? `/${locale}/news?${qs}` : `/${locale}/news`;
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Terminal de Notícias</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          O que está a mover os mercados internacionais, em português.
          Atualizado de hora a hora.
        </p>
      </header>

      <div className="mb-6">
        <Suspense fallback={<div className="h-7" />}>
          <NewsFilters />
        </Suspense>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Ainda sem notícias</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {categoria
              ? "Não há artigos nesta categoria. Experimenta outro filtro."
              : "O terminal ainda não publicou nada. Volta dentro de uma hora."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {articles.map((article) => (
            <NewsCard key={article.id} article={article} locale={locale} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-primary hover:underline">
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="text-primary hover:underline">
              Mais antigas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
