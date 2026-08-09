import { NextRequest, NextResponse } from "next/server";
import { Prisma, NewsStatus, NewsCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeArticle } from "@/lib/news/serialize";

/**
 * Feed público do Terminal de Notícias — é este o endpoint que o bot de
 * Discord consulta.
 *
 * Ordem CRONOLÓGICA ASCENDENTE de propósito: o bot lança as notícias pela
 * ordem em que aconteceram e guarda o `nextCursor` para o pedido seguinte,
 * o que garante que nunca repete nem salta artigos, mesmo após downtime.
 *
 *   GET /api/news/latest?after=<id>&limit=10
 *   GET /api/news/latest?since=2026-08-09T12:00:00Z
 *   GET /api/news/latest?category=MACRO&ticker=AAPL
 */

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT)
  );

  const where: Prisma.NewsArticleWhereInput = { status: NewsStatus.PUBLISHED };

  // Cursor: continua a partir do último artigo que o bot já publicou.
  const after = searchParams.get("after");
  if (after) {
    const anchor = await prisma.newsArticle.findUnique({
      where: { id: after },
      select: { publishedAt: true, id: true },
    });
    if (!anchor) {
      return NextResponse.json(
        { error: "invalid_cursor", message: "O `after` não corresponde a nenhum artigo." },
        { status: 400 }
      );
    }
    // Desempate por id porque dois artigos podem partilhar o publishedAt.
    where.OR = [
      { publishedAt: { gt: anchor.publishedAt } },
      { publishedAt: anchor.publishedAt, id: { gt: anchor.id } },
    ];
  } else {
    const since = searchParams.get("since");
    if (since) {
      const date = new Date(since);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json(
          { error: "invalid_since", message: "`since` tem de ser uma data ISO 8601." },
          { status: 400 }
        );
      }
      where.publishedAt = { gt: date };
    }
  }

  // Categorias lidas do enum do Prisma, para a validação nunca divergir do schema.
  const category = searchParams.get("category")?.toUpperCase();
  if (category) {
    if (!(category in NewsCategory)) {
      return NextResponse.json(
        {
          error: "invalid_category",
          message: `Categorias válidas: ${Object.keys(NewsCategory).join(", ")}`,
        },
        { status: 400 }
      );
    }
    where.categoria = category as NewsCategory;
  }

  const ticker = searchParams.get("ticker")?.toUpperCase();
  if (ticker) where.tickers = { has: ticker };

  try {
    const articles = await prisma.newsArticle.findMany({
      where,
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: limit,
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
    });

    return NextResponse.json(
      {
        articles: articles.map((a) => serializeArticle(a)),
        nextCursor: articles.length > 0 ? articles[articles.length - 1].id : (after ?? null),
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch (err) {
    console.error("[news/latest]", err);
    return NextResponse.json(
      { error: "internal_error", message: "Não foi possível ler o feed." },
      { status: 500 }
    );
  }
}
