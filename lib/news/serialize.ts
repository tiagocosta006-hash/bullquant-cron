import type { NewsArticle } from "@prisma/client";

export interface NewsSource {
  name: string;
  url: string;
}

/** Payload público de um artigo — o mesmo para o site e para o bot de Discord. */
export interface NewsArticleDTO {
  id: string;
  slug: string;
  titulo: string;
  resumo: string;
  corpo: string;
  impacto: string;
  categoria: string;
  tickers: string[];
  sentimento: string;
  /** URL original no CDN da fonte. É o que o bot de Discord usa no embed. */
  imageUrl: string | null;
  /**
   * A mesma imagem servida pela nossa origem. É o que as páginas web têm de
   * usar: a CSP da app (next.config.ts) só permite `img-src` de uma allowlist
   * curta, e os CDNs de notícias não estão lá.
   */
  imageProxyUrl: string | null;
  publishedAt: string;
  bullValueUrl: string;
  sources: NewsSource[];
}

/** Campos mínimos que o serializador precisa (aceita `select` parciais). */
export type SerializableArticle = Pick<
  NewsArticle,
  | "id"
  | "slug"
  | "titulo"
  | "resumoCurto"
  | "corpo"
  | "impacto"
  | "categoria"
  | "tickers"
  | "sentimento"
  | "imageUrl"
  | "publishedAt"
  | "sources"
>;

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://thebullvalue.com").replace(/\/$/, "");
}

/** `sources` é Json na base de dados — validado aqui antes de sair para fora. */
export function parseSources(value: unknown): NewsSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { name, url } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof url !== "string") return [];
    return [{ name, url }];
  });
}

export function serializeArticle(article: SerializableArticle, locale = "pt"): NewsArticleDTO {
  return {
    id: article.id,
    slug: article.slug,
    titulo: article.titulo,
    resumo: article.resumoCurto,
    corpo: article.corpo,
    impacto: article.impacto,
    categoria: article.categoria,
    tickers: article.tickers,
    sentimento: article.sentimento,
    imageUrl: article.imageUrl,
    imageProxyUrl: article.imageUrl ? `/api/news/image/${article.id}` : null,
    publishedAt: article.publishedAt.toISOString(),
    bullValueUrl: `${siteUrl()}/${locale}/news/${article.slug}`,
    sources: parseSources(article.sources),
  };
}
