import { prisma } from "@/lib/prisma";

export type ScreenerCompany = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  sharesOutstanding: number | null;
};

/**
 * Categorias do dashboard de Insights.
 *
 * IMPORTANTE: estas são **listas temáticas curadas**, não um screener por
 * métricas. Os tickers foram escolhidos à mão e validados contra a tabela
 * `companies` (universo S&P 500 seeded). NÃO consultam fundamentais para
 * ranquear por dividend growth / buybacks / crescimento real.
 *
 * TODO: substituir por screening real sobre `fundamentals` (CAGR de revenue,
 * sharesOutstanding decrescente, dividendPerShare crescente) quando a qualidade
 * dos dados de ingestão estiver verificada — neste momento há revenues por
 * empresa que vêm com tags XBRL erradas e poluiriam qualquer ranking.
 */
export type ScreenerCategory =
  | "sp500"
  | "trending"
  | "growth"
  | "dividend"
  | "buyback"
  | "ai";

export const SCREENER_CATEGORIES: ScreenerCategory[] = [
  "sp500",
  "trending",
  "growth",
  "dividend",
  "buyback",
  "ai",
];

export const DEFAULT_CATEGORY: ScreenerCategory = "sp500";

// Listas curadas — todos os tickers confirmados presentes na BD (S&P 500 seeded).
// "sp500" não tem lista: representa o universo inteiro.
export const CURATED_LISTS: Partial<Record<ScreenerCategory, string[]>> = {
  trending: ["TSLA", "NVDA", "AAPL", "AMD", "PLTR", "SMCI", "COIN", "MSFT", "META", "AMZN"],
  growth: ["CRWD", "PLTR", "DDOG", "NOW", "UBER", "DASH", "ABNB", "AMD", "NVDA", "CRM"],
  dividend: ["JNJ", "PG", "KO", "PEP", "MMM", "ABBV", "TGT", "WMT", "CVX", "XOM", "MCD", "CAT", "CL", "LOW", "HD"],
  buyback: ["AAPL", "GOOGL", "META", "MSFT", "ORCL", "QCOM", "LOW", "HD", "TXN"],
  ai: ["NVDA", "MSFT", "GOOGL", "META", "AMD", "AVGO", "QCOM", "INTC", "IBM", "MU", "CRM", "ADBE"],
};

export function isValidCategory(value: string | undefined): value is ScreenerCategory {
  return !!value && (SCREENER_CATEGORIES as string[]).includes(value);
}

export async function getCategoryCompanies(
  category: ScreenerCategory,
  limit = 20,
): Promise<ScreenerCompany[]> {
  const tickersIn = CURATED_LISTS[category];

  const companies = await prisma.company.findMany({
    // "sp500" = universo inteiro; restantes = lista curada.
    where: tickersIn ? { ticker: { in: tickersIn } } : {},
    take: limit,
    orderBy: tickersIn ? undefined : { ticker: "asc" },
    select: {
      ticker: true,
      name: true,
      logoUrl: true,
      fundamentals: {
        orderBy: { periodEnd: "desc" },
        take: 1,
        select: { sharesOutstanding: true },
      },
    },
  });

  const mapped: ScreenerCompany[] = companies.map((c) => ({
    ticker: c.ticker,
    name: c.name,
    logoUrl: c.logoUrl,
    sharesOutstanding: c.fundamentals[0]?.sharesOutstanding
      ? Number(c.fundamentals[0].sharesOutstanding)
      : null,
  }));

  // Preservar a ordem exata da lista curada.
  if (tickersIn) {
    return mapped.sort((a, b) => tickersIn.indexOf(a.ticker) - tickersIn.indexOf(b.ticker));
  }

  return mapped;
}
