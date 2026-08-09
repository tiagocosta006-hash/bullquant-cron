import Parser from "rss-parser";
import type { RawNewsItem } from "./types";
import { dedupKeyFor, isRealImage, stripHtml } from "./normalize";

/**
 * Fontes do Terminal de Notícias, em código (versionadas no git — não há
 * tabela de configuração propositadamente).
 *
 * Nota importante: a Bloomberg e a Reuters descontinuaram os feeds RSS
 * públicos. Para essas duas usamos o Google News RSS como proxy, que devolve
 * apenas headline + link. Em nenhum caso descarregamos o corpo do artigo — o
 * input do LLM é sempre headline + descrição que a fonte publica para
 * redistribuição, e cada artigo gerado credita e liga à origem.
 */
export interface FeedSource {
  name: string;
  url: string;
}

export const RSS_SOURCES: FeedSource[] = [
  { name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { name: "CNBC Markets", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { name: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss" },
  {
    name: "Reuters",
    url: "https://news.google.com/rss/search?q=when:4h+site:reuters.com+business&hl=en-US&gl=US&ceid=US:en",
  },
  {
    name: "Bloomberg",
    url: "https://news.google.com/rss/search?q=when:4h+site:bloomberg.com+markets&hl=en-US&gl=US&ceid=US:en",
  },
];

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "BullValueNewsBot/1.0 (+https://thebullvalue.com)";

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { "User-Agent": USER_AGENT },
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: false }],
    ],
  },
});

type ParsedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  mediaContent?: { $?: { url?: string } };
  mediaThumbnail?: { $?: { url?: string } };
  enclosure?: { url?: string };
};

function imageFromItem(item: ParsedItem): string | null {
  const candidate =
    item.mediaContent?.$?.url ?? item.mediaThumbnail?.$?.url ?? item.enclosure?.url ?? null;
  return isRealImage(candidate) ? candidate! : null;
}

/** Lê um feed RSS/Atom. Erros são engolidos — uma fonte em baixo não pode parar o pipeline. */
export async function fetchRssSource(source: FeedSource): Promise<RawNewsItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    const items: RawNewsItem[] = [];

    for (const raw of (feed.items ?? []) as ParsedItem[]) {
      const title = raw.title?.trim();
      const link = raw.link?.trim();
      if (!title || !link) continue;

      const dateStr = raw.isoDate ?? raw.pubDate;
      const publishedAt = dateStr ? new Date(dateStr) : new Date();
      if (Number.isNaN(publishedAt.getTime())) continue;

      items.push({
        dedupKey: dedupKeyFor(title),
        source: source.name,
        sourceUrl: link,
        title,
        summary: stripHtml(raw.contentSnippet ?? raw.summary ?? raw.content),
        imageUrl: imageFromItem(raw),
        publishedAt,
      });
    }

    return items;
  } catch (err) {
    console.error(`[news] feed falhou (${source.name}):`, (err as Error).message);
    return [];
  }
}

/**
 * Notícias gerais do Finnhub — o backbone da coleta. Ao contrário do RSS traz
 * sempre um `summary` utilizável, o que melhora bastante a qualidade do resumo.
 */
export async function fetchFinnhubGeneral(): Promise<RawNewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) {
    console.warn("[news] FINNHUB_API_KEY em falta — a saltar a fonte Finnhub");
    return [];
  }

  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${key}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Finnhub ${res.status}`);

    const raw = (await res.json()) as Array<{
      datetime: number;
      headline: string;
      summary?: string;
      source?: string;
      url: string;
      image?: string;
    }>;

    return raw
      .filter((a) => a.headline && a.url)
      .map((a) => ({
        dedupKey: dedupKeyFor(a.headline),
        source: a.source || "Finnhub",
        sourceUrl: a.url,
        title: a.headline.trim(),
        summary: stripHtml(a.summary),
        imageUrl: isRealImage(a.image) ? a.image! : null,
        publishedAt: new Date(a.datetime * 1000),
      }))
      .filter((a) => !Number.isNaN(a.publishedAt.getTime()));
  } catch (err) {
    console.error("[news] Finnhub general falhou:", (err as Error).message);
    return [];
  }
}

/**
 * Corre todas as fontes em paralelo e devolve os itens deduplicados por
 * `dedupKey`, mantendo sempre a versão com mais informação (summary/imagem).
 */
export async function collectAllSources(): Promise<RawNewsItem[]> {
  const batches = await Promise.all([
    fetchFinnhubGeneral(),
    ...RSS_SOURCES.map((s) => fetchRssSource(s)),
  ]);

  const byKey = new Map<string, RawNewsItem>();
  for (const item of batches.flat()) {
    const existing = byKey.get(item.dedupKey);
    if (!existing) {
      byKey.set(item.dedupKey, item);
      continue;
    }
    // Preferir a versão mais rica: com resumo, depois com imagem.
    const existingScore = (existing.summary ? 2 : 0) + (existing.imageUrl ? 1 : 0);
    const candidateScore = (item.summary ? 2 : 0) + (item.imageUrl ? 1 : 0);
    if (candidateScore > existingScore) byKey.set(item.dedupKey, item);
  }

  return [...byKey.values()].sort(
    (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()
  );
}
