import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Ticker do hero da landing — últimos fechos EOD da tabela `prices`
 * (PostgreSQL), nunca a Finnhub: a landing é pública e anónima, não
 * queima quota de API externa. Cache de 1h; se a BD estiver vazia ou
 * inacessível, cai num snapshot estático para a landing nunca quebrar.
 */
export interface TickerItem {
  ticker: string;
  name: string;
  logoUrl: string | null;
  close: number;
  /** variação diária em decimal (0.0082 = +0,82%); null sem dia anterior */
  changePct: number | null;
}

const TICKERS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "AMZN",
  "META",
  "TSLA",
  "NFLX",
  "V",
  "MA",
  "KO",
  "MCD",
  "DIS",
  "ADBE",
];

/** Snapshot estático (dados de exemplo) — só usado sem BD utilizável. */
const FALLBACK: TickerItem[] = [
  { ticker: "AAPL", name: "Apple", logoUrl: null, close: 227.34, changePct: 0.0082 },
  { ticker: "MSFT", name: "Microsoft", logoUrl: null, close: 448.9, changePct: 0.0041 },
  { ticker: "NVDA", name: "NVIDIA", logoUrl: null, close: 131.62, changePct: -0.0113 },
  { ticker: "GOOGL", name: "Alphabet", logoUrl: null, close: 182.15, changePct: 0.0027 },
  { ticker: "AMZN", name: "Amazon", logoUrl: null, close: 197.48, changePct: 0.0065 },
  { ticker: "META", name: "Meta", logoUrl: null, close: 578.02, changePct: -0.0038 },
  { ticker: "TSLA", name: "Tesla", logoUrl: null, close: 246.7, changePct: 0.0154 },
  { ticker: "NFLX", name: "Netflix", logoUrl: null, close: 692.55, changePct: 0.0019 },
  { ticker: "V", name: "Visa", logoUrl: null, close: 288.11, changePct: 0.0008 },
  { ticker: "MA", name: "Mastercard", logoUrl: null, close: 471.3, changePct: -0.0022 },
  { ticker: "KO", name: "Coca-Cola", logoUrl: null, close: 63.28, changePct: 0.0035 },
  { ticker: "MCD", name: "McDonald's", logoUrl: null, close: 258.4, changePct: -0.0016 },
  { ticker: "DIS", name: "Disney", logoUrl: null, close: 96.12, changePct: 0.0048 },
  { ticker: "ADBE", name: "Adobe", logoUrl: null, close: 512.66, changePct: -0.0074 },
];

async function fetchTickerItems(): Promise<TickerItem[]> {
  try {
    const companies = await prisma.company.findMany({
      where: { ticker: { in: TICKERS }, isActive: true },
      select: {
        ticker: true,
        name: true,
        logoUrl: true,
        prices: {
          orderBy: { date: "desc" },
          take: 2,
          select: { close: true },
        },
      },
    });

    const byTicker = new Map(companies.map((c) => [c.ticker, c]));
    const items: TickerItem[] = [];

    for (const ticker of TICKERS) {
      const company = byTicker.get(ticker);
      if (!company || company.prices.length === 0) continue;
      const close = Number(company.prices[0].close);
      const prev = company.prices[1] ? Number(company.prices[1].close) : null;
      items.push({
        ticker,
        name: company.name,
        logoUrl: company.logoUrl,
        close,
        changePct: prev && prev > 0 ? (close - prev) / prev : null,
      });
    }

    // Poucos resultados = BD por semear; o snapshot dá uma fita completa.
    return items.length >= 6 ? items : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const getTickerItems = unstable_cache(fetchTickerItems, ["landing-ticker"], {
  revalidate: 3600,
});
