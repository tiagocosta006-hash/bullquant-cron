import { NextRequest, NextResponse } from "next/server";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeArticle } from "@/lib/news/serialize";

/** Artigo individual do Terminal de Notícias, por slug. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const article = await prisma.newsArticle.findUnique({
      where: { slug },
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
        status: true,
      },
    });

    // Drafts e arquivados não são visíveis publicamente.
    if (!article || article.status !== NewsStatus.PUBLISHED) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json(
      { article: serializeArticle(article) },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    console.error("[news/article]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
