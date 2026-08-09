/** Tipos partilhados pelo pipeline do Terminal de Notícias. */

/** Item já normalizado, vindo de qualquer fonte (RSS ou Finnhub). */
export interface RawNewsItem {
  /** sha1(título normalizado) — chave de deduplicação entre execuções */
  dedupKey: string;
  source: string;
  sourceUrl: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

/** Um grupo de itens que várias fontes publicaram sobre o mesmo acontecimento. */
export interface StoryCluster {
  /** Item mais completo do grupo — usado como representante nos prompts */
  lead: RawNewsItem;
  items: RawNewsItem[];
  /** Nº de fontes distintas. >= 2 é o sinal forte de "está a bombar". */
  sourceCount: number;
  /** Tickers da nossa tabela Company detetados nos títulos */
  matchedTickers: string[];
}

export const NEWS_CATEGORIES = [
  "MACRO",
  "EARNINGS",
  "MA",
  "CRYPTO",
  "COMMODITIES",
  "POLICY",
  "COMPANY",
] as const;

export type NewsCategoryValue = (typeof NEWS_CATEGORIES)[number];

export const SENTIMENTS = ["POSITIVO", "NEGATIVO", "NEUTRO"] as const;
export type SentimentValue = (typeof SENTIMENTS)[number];
