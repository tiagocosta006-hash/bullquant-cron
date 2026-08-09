import Link from "next/link";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATEGORY_LABELS, timeAgoPt } from "@/components/news/shared";
import { StatusActions } from "./StatusActions";

// Página de curadoria: tem de refletir o estado real, nunca cache.
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<NewsStatus, string> = {
  DRAFT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PUBLISHED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ARCHIVED: "bg-muted text-muted-foreground",
};

export default async function AdminNewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const articles = await prisma.newsArticle.findMany({
    orderBy: { publishedAt: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      titulo: true,
      categoria: true,
      status: true,
      publishedAt: true,
      modelVersion: true,
      cluster: { select: { relevanceScore: true, triageReason: true } },
    },
  });

  const drafts = articles.filter((a) => a.status === NewsStatus.DRAFT).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Curadoria do Terminal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Últimos 100 artigos gerados.{" "}
          {drafts > 0
            ? `${drafts} à espera de revisão (score de relevância entre 70 e 79).`
            : "Nada à espera de revisão."}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          O ingestor ainda não gerou nenhum artigo.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {articles.map((article) => (
            <div
              key={article.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[article.status]}`}
                  >
                    {article.status}
                  </span>
                  <span className="text-muted-foreground">
                    {CATEGORY_LABELS[article.categoria] ?? article.categoria}
                  </span>
                  {article.cluster?.relevanceScore != null && (
                    <span className="font-mono text-muted-foreground">
                      score {article.cluster.relevanceScore}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {timeAgoPt(article.publishedAt.toISOString())}
                  </span>
                  <span className="font-mono text-muted-foreground/60">
                    {article.modelVersion}
                  </span>
                </div>

                <Link
                  href={`/${locale}/news/${article.slug}`}
                  className="mt-1.5 block font-medium leading-snug hover:text-primary"
                >
                  {article.titulo}
                </Link>

                {article.cluster?.triageReason && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    {article.cluster.triageReason}
                  </p>
                )}
              </div>

              <StatusActions id={article.id} status={article.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
