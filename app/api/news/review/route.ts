import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NewsStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDiscordApprover } from "@/lib/discord/client";

/**
 * Aprovação de rascunhos, chamada pelo bot de Discord da Bullocracy.
 *
 * Existe porque o bot "scs" recebe as interações pelo **gateway** (discord.py),
 * e não por HTTP: registar um Interactions Endpoint URL nessa aplicação faria o
 * Discord entregar todas as interações dela por HTTP, partindo o `/analisar` e
 * o `/watchlist`. Assim o bot trata o clique como já trata os slash commands e
 * chama este endpoint.
 *
 * (A alternativa, `/api/discord/interactions`, continua a existir para quem use
 * uma aplicação dedicada em modo HTTP. As duas escrevem na mesma tabela.)
 *
 *   POST /api/news/review
 *   Authorization: Bearer <NEWS_REVIEW_SECRET>
 *   { "articleId": "cmsm...", "action": "publish" | "reject", "discordUserId": "4279..." }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comparação em tempo constante — evita distinguir segredos por latência. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.NEWS_REVIEW_SECRET;

  // Falhar FECHADO: sem segredo configurado, um deploy incompleto abria a
  // publicação a qualquer pessoa que descobrisse o URL.
  if (!expected) {
    console.error("[news/review] NEWS_REVIEW_SECRET não configurado — pedido recusado");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { articleId?: unknown; action?: unknown; discordUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { articleId, action, discordUserId } = body;

  if (typeof articleId !== "string" || !articleId) {
    return NextResponse.json({ error: "missing_articleId" }, { status: 400 });
  }
  if (action !== "publish" && action !== "reject") {
    return NextResponse.json(
      { error: "invalid_action", message: '`action` tem de ser "publish" ou "reject".' },
      { status: 400 }
    );
  }

  // Defesa em profundidade: mesmo com o segredo correto, só quem está na
  // allowlist publica. Um bug no bot que reencaminhe o clique de outra pessoa
  // não chega para pôr um artigo no ar.
  if (typeof discordUserId !== "string" || !isDiscordApprover(discordUserId)) {
    console.warn(`[news/review] utilizador não autorizado: ${String(discordUserId)}`);
    return NextResponse.json({ error: "forbidden", message: "Utilizador sem permissão." }, { status: 403 });
  }

  const article = await prisma.newsArticle.findUnique({
    where: { id: articleId },
    select: { id: true, titulo: true, slug: true, status: true },
  });

  if (!article) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Idempotente: um duplo-clique não é erro, devolve o estado atual.
  if (article.status !== NewsStatus.DRAFT) {
    return NextResponse.json({
      ok: true,
      alreadyHandled: true,
      status: article.status,
      titulo: article.titulo,
    });
  }

  const publicar = action === "publish";

  await prisma.newsArticle.update({
    where: { id: article.id },
    data: { status: publicar ? NewsStatus.PUBLISHED : NewsStatus.ARCHIVED },
  });

  if (publicar) {
    revalidatePath("/[locale]/news", "page");
    revalidatePath("/[locale]/news/[slug]", "page");
  }

  console.log(
    `[news/review] ${publicar ? "publicado" : "rejeitado"} por ${discordUserId}: ${article.titulo}`
  );

  return NextResponse.json({
    ok: true,
    alreadyHandled: false,
    status: publicar ? NewsStatus.PUBLISHED : NewsStatus.ARCHIVED,
    titulo: article.titulo,
    slug: article.slug,
  });
}

/**
 * Rascunhos à espera de aprovação — para o bot recuperar depois de estar em
 * baixo, ou para um comando `/pendentes`.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.NEWS_REVIEW_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !secretMatches(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const drafts = await prisma.newsArticle.findMany({
    where: { status: NewsStatus.DRAFT },
    orderBy: { publishedAt: "asc" },
    take: 25,
    select: {
      id: true,
      slug: true,
      titulo: true,
      resumoCurto: true,
      categoria: true,
      tickers: true,
      sentimento: true,
      imageUrl: true,
      publishedAt: true,
      cluster: { select: { relevanceScore: true } },
    },
  });

  return NextResponse.json({
    drafts: drafts.map((d) => ({
      id: d.id,
      slug: d.slug,
      titulo: d.titulo,
      resumo: d.resumoCurto,
      categoria: d.categoria,
      tickers: d.tickers,
      sentimento: d.sentimento,
      imageUrl: d.imageUrl,
      publishedAt: d.publishedAt.toISOString(),
      relevanceScore: d.cluster?.relevanceScore ?? null,
    })),
  });
}
