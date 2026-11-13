import { NewsStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { JANELA_SITEMAP_NOTICIAS_MS, xmlSitemapNoticias } from "@/lib/news/seo"

/**
 * GET /news-sitemap.xml — sitemap do Google News: as notícias dos últimos 2
 * dias (o formato não aceita mais antigas; essas estão no /sitemap.xml).
 *
 * Dinâmico de propósito, mas em cache na CDN 15 min: o feed publica de 4 em 4
 * horas, e assim o build não depende da base de dados para gerar isto.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const desde = new Date(Date.now() - JANELA_SITEMAP_NOTICIAS_MS)
  const noticias = await prisma.newsArticle.findMany({
    where: { status: NewsStatus.PUBLISHED, publishedAt: { gte: desde } },
    orderBy: { publishedAt: "desc" },
    take: 1000, // limite do formato
    select: { slug: true, titulo: true, publishedAt: true },
  })

  return new Response(xmlSitemapNoticias(noticias), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  })
}
