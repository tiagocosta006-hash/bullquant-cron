import { Link } from "@/i18n/routing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSources, serializeArticle } from "@/lib/news/serialize";
import { CATEGORY_LABELS } from "@/lib/news/labels";
import { dataNoticia, imagemNoticia, jsonLdNoticia, jsonParaScript, urlNoticia } from "@/lib/news/seo";
import {
  ArticleFooter,
  CategoryBadge,
  InlineMarkdown,
  SentimentBadge,
  TickerBadges,
} from "@/components/news/shared";
import { ImageWithFallback } from "@/components/news/ImageWithFallback";

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
  updatedAt: true,
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

  const url = urlNoticia(article.slug);
  // Sempre o cartão da BullValue, não a foto da fonte: é nosso (sem direitos
  // de terceiros) e tem o título. Sem twitter:* próprio, o X mostrava o
  // título e a imagem da página inicial (herdados do layout).
  const imagem = { url: imagemNoticia(article.slug), width: 1200, height: 630, alt: article.titulo };

  return {
    // O layout já junta " · The BullValue"; o "| Bull Value" repetia a marca.
    title: article.titulo,
    description: article.resumoCurto,
    // Só existe em português: o /en/news/... aponta para aqui (ver lib/news/seo.ts).
    alternates: { canonical: url },
    openGraph: {
      title: article.titulo,
      description: article.resumoCurto,
      type: "article",
      url,
      locale: "pt_PT",
      publishedTime: article.publishedAt.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      section: CATEGORY_LABELS[article.categoria] ?? article.categoria,
      tags: article.tickers,
      images: [imagem],
    },
    twitter: {
      card: "summary_large_image",
      title: article.titulo,
      description: article.resumoCurto,
      images: [imagem.url],
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
  const jsonLd = jsonLdNoticia({ ...row, sources: parseSources(row.sources) });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonParaScript(jsonLd) }} />
      {/* Link do next-intl: sem o /pt/ à frente, que respondia 307 a cada clique e a cada visita do Google. */}
      <Link
        href="/news"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Terminal de Notícias
      </Link>

      <article>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={article.categoria} />
          <SentimentBadge sentimento={article.sentimento} />
          {/* Data absoluta e legível por máquina: "há 2 dias" não dizia ao Google quando foi. */}
          <time dateTime={article.publishedAt} className="text-xs text-muted-foreground">
            {dataNoticia(article.publishedAt)}
          </time>
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
          {article.titulo}
        </h1>

        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          {article.resumo}
        </p>

        {article.tickers.length > 0 && (
          <div className="mt-4">
            <TickerBadges tickers={article.tickers} />
          </div>
        )}

        {article.imageProxyUrl && (
          <ImageWithFallback
            src={article.imageProxyUrl}
            alt=""
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

        <p className="mt-8 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          Resumo elaborado com apoio de inteligência artificial a partir das fontes indicadas. Pode conter erros ou omissões: confirma sempre na fonte. Não é aconselhamento nem recomendação de investimento.
        </p>

        <ArticleFooter sources={article.sources} className="mt-4" />
      </article>
    </div>
  );
}
