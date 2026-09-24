import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cotacoes } from "@/lib/fmp/mercado";

/**
 * Ticker do hero da landing e do topo da dashboard.
 *
 * Nome e logo vêm da base; a cotação vem da FMP (`batch-quote`, uma chamada
 * para todos os tickers), cacheada no servidor. Se a FMP falhar, a fita usa
 * um snapshot estático e o flag `live` diz à UI que não pode apresentar
 * esses preços como sendo de hoje.
 */
export interface TickerItem {
  ticker: string;
  name: string;
  logoUrl: string | null;
  close: number;
  /** variação diária em decimal (0.0082 = +0,82%); null sem dia anterior */
  changePct: number | null;
}

export interface TickerData {
  items: TickerItem[];
  /** true = cotações reais da Finnhub; false = fechos da BD / snapshot */
  live: boolean;
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
  "DIS",
  "ADBE",
];

export const GLOBAL_ETFS = [
  "SPY",
  "QQQ",
  "DIA",
  "IWM",
  "FEZ",
  "EWU",
  "EWG",
  "EWQ",
  "EWJ",
  "MCHI",
  "INDA",
  "EEM",
  "GLD",
  "USO",
  "TLT",
  "VNQ"
];

// Combina tudo para o fetch
const ALL_TICKERS = [...GLOBAL_ETFS, ...TICKERS];

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

/** Metadados (nome/logo) — vêm da BD; o preço vem da FMP. */
type CompanyMeta = { name: string; logoUrl: string | null };

/**
 * ⚠️ Era aqui que estava o maior consumo de egress da plataforma.
 *
 * A versão anterior pedia `prices: { orderBy: { date: "desc" }, take: 2 }`
 * numa relação. O Prisma NÃO leva esse `take` para o SQL: gera
 * `SELECT ticker, date, close FROM prices WHERE ticker IN (...)`, traz o
 * histórico INTEIRO de cada ticker e só corta para 2 em memória. Medido no
 * pg_stat_statements a 2026-09-24: ~110 000 linhas por chamada, 21 chamadas
 * em duas horas, ~700 MB de egress por dia — e corria em cada cache miss da
 * fita da página inicial, mesmo quando os preços vinham da Finnhub.
 *
 * Aqui só se lê o que é nosso: nome e logo.
 */
async function fetchCompanyMeta(): Promise<Map<string, CompanyMeta>> {
  const companies = await prisma.company.findMany({
    where: { ticker: { in: ALL_TICKERS } },
    select: { ticker: true, name: true, logoUrl: true },
  });
  return new Map(companies.map((c) => [c.ticker, { name: c.name, logoUrl: c.logoUrl }]));
}

async function fetchTickerItems(): Promise<TickerData> {
  try {
    const [meta, quotes] = await Promise.all([fetchCompanyMeta(), cotacoes(ALL_TICKERS)]);
    const items: TickerItem[] = [];
    for (const ticker of ALL_TICKERS) {
      const q = quotes.get(ticker);
      const company = meta.get(ticker);
      if (!q || !company || !q.price) continue;
      items.push({
        ticker,
        name: company.name,
        logoUrl: company.logoUrl,
        close: q.price,
        // A FMP dá a variação em percentagem (-0,8 = -0,8%); o TickerItem
        // guarda decimal, daí o /100.
        changePct: q.changePercentage != null ? q.changePercentage / 100 : null,
      });
    }
    // Poucos resultados = FMP indisponível; o snapshot dá uma fita completa e
    // o `live: false` faz a UI não afirmar que os preços são de hoje.
    if (items.length >= 6) return { items, live: true };
  } catch {
    // cai para o snapshot
  }
  return { items: FALLBACK, live: false };
}

export const getTickerItems = unstable_cache(fetchTickerItems, ["landing-ticker"], {
  revalidate: 300,
});
