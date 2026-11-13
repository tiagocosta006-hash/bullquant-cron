import { BRAND } from "@/lib/brand";
import { CATEGORY_LABELS } from "@/lib/news/labels";
import type { NewsSource } from "@/lib/news/serialize";

/**
 * SEO das notícias: URLs canónicos, imagem de partilha, JSON-LD NewsArticle e
 * o sitemap do Google News. Puro (sem React nem Prisma) para ser testável.
 *
 * As notícias só existem em português: /en/news/... mostra o MESMO texto. Por
 * isso o canónico é sempre o URL sem prefixo (PT) e não há hreflang inglês —
 * senão o Google via duas páginas iguais a dizer que são línguas diferentes.
 */

export const urlNoticia = (slug: string) => `${BRAND.siteUrl}/news/${slug}`;
export const URL_LISTA_NOTICIAS = `${BRAND.siteUrl}/news`;

/** Cartão 1200×630 gerado por /api/og/news/[slug] (em cache na CDN desde o #177). */
export const imagemNoticia = (slug: string) => `${BRAND.siteUrl}/api/og/news/${slug}`;

/** "30 out 2026, 04:40", na hora de Lisboa (o servidor corre em UTC). */
export function dataNoticia(data: Date | string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Lisbon",
  }).format(new Date(data));
}

export interface NoticiaSeo {
  slug: string;
  titulo: string;
  resumoCurto: string;
  categoria: string;
  tickers: string[];
  publishedAt: Date;
  updatedAt: Date;
  sources: NewsSource[];
}

/**
 * NewsArticle + BreadcrumbList. É o que torna a notícia elegível para as
 * "Notícias principais" e o Discover do Google.
 */
export function jsonLdNoticia(n: NoticiaSeo) {
  const url = urlNoticia(n.slug);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: n.titulo,
        description: n.resumoCurto,
        image: [imagemNoticia(n.slug)],
        datePublished: n.publishedAt.toISOString(),
        dateModified: n.updatedAt.toISOString(),
        inLanguage: "pt-PT",
        mainEntityOfPage: url,
        url,
        articleSection: CATEGORY_LABELS[n.categoria] ?? n.categoria,
        ...(n.tickers.length > 0 ? { keywords: n.tickers.join(", ") } : {}),
        author: { "@type": "Organization", name: BRAND.name, url: BRAND.siteUrl },
        publisher: {
          "@type": "Organization",
          name: BRAND.name,
          url: BRAND.siteUrl,
          logo: { "@type": "ImageObject", url: `${BRAND.siteUrl}${BRAND.logoSrc}` },
        },
        // As fontes originais: a notícia é um resumo delas, e diz-se.
        ...(n.sources.length > 0
          ? { isBasedOn: n.sources.map((s) => ({ "@type": "CreativeWork", name: s.name, url: s.url })) }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: BRAND.name, item: BRAND.siteUrl },
          { "@type": "ListItem", position: 2, name: "Notícias", item: URL_LISTA_NOTICIAS },
          { "@type": "ListItem", position: 3, name: n.titulo, item: url },
        ],
      },
    ],
  };
}

/**
 * JSON para um <script type="application/ld+json">. O texto vem de um LLM e
 * de fontes externas: um "</script>" no título fechava a tag e o resto era
 * HTML. Escapar o "<" resolve isso e continua a ser JSON válido.
 */
export const jsonParaScript = (dados: unknown) => JSON.stringify(dados).replace(/</g, "\\u003c");

const escaparXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** Janela do sitemap de notícias: o Google só quer as dos últimos 2 dias. */
export const JANELA_SITEMAP_NOTICIAS_MS = 2 * 24 * 60 * 60 * 1000;

/** Sitemap no formato do Google News (https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap). */
export function xmlSitemapNoticias(noticias: Pick<NoticiaSeo, "slug" | "titulo" | "publishedAt">[]): string {
  const urls = noticias
    .map(
      (n) => `<url>
<loc>${escaparXml(urlNoticia(n.slug))}</loc>
<news:news>
<news:publication><news:name>${escaparXml(BRAND.name)}</news:name><news:language>pt</news:language></news:publication>
<news:publication_date>${n.publishedAt.toISOString()}</news:publication_date>
<news:title>${escaparXml(n.titulo)}</news:title>
</news:news>
</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>
`;
}
