import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isDiscordApprover } from "@/lib/discord/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.NEWS_REVIEW_SECRET;

  if (!expected) {
    console.error("[news/update-image] NEWS_REVIEW_SECRET não configurado");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { articleId?: unknown; imageUrl?: unknown; discordUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { articleId, imageUrl, discordUserId } = body;

  if (typeof articleId !== "string" || !articleId) {
    return NextResponse.json({ error: "missing_articleId" }, { status: 400 });
  }
  if (typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "invalid_imageUrl", message: '`imageUrl` tem de ser uma string.' },
      { status: 400 }
    );
  }

  if (typeof discordUserId !== "string" || !isDiscordApprover(discordUserId)) {
    console.warn(`[news/update-image] utilizador não autorizado: ${String(discordUserId)}`);
    return NextResponse.json({ error: "forbidden", message: "Utilizador sem permissão." }, { status: 403 });
  }

  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
    select: { id: true, titulo: true, slug: true },
  });

  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.newsArticle.update({
    where: { id: article.id },
    data: { 
      imageUrl: imageUrl.trim() || null 
    },
  });

  // Revalidar as rotas onde a notícia pode estar a ser apresentada
  revalidatePath("/[locale]/news", "page");
  revalidatePath("/[locale]/news/[slug]", "page");

  console.log(
    `[news/update-image] imagem atualizada por ${discordUserId} no artigo: ${article.titulo}`
  );

  return NextResponse.json({
    ok: true,
    titulo: article.titulo,
    slug: article.slug,
  });
}
