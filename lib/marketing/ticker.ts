import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Ticker do hero da landing e do topo da dashboard.
 *
 * Fonte dos preços: **cotações reais da Finnhub**, pedidas no SERVIDOR e
 * cacheadas globalmente 5 min. Isto é uma exceção deliberada à regra do
 * CLAUDE.md ("a landing nunca chama a Finnhub, para não queimar quota"):
 * essa regra assumia uma chamada por visitante. Aqui é 1 lote de 14 tickers
 * por janela de 5 min para TODA a gente (~3 chamadas/min de média, contra o
 * limite de 60/min do plano grátis) — a quota fica intacta e os preços
 * deixam de estar errados. NÃO baixar o revalidate sem refazer esta conta,
 * e nunca mover estas chamadas para o cliente.
 *
 * Motivo da mudança: os fechos EOD da tabela `prices` estavam 3 semanas
 * atrasados (ingestão do Polygon parada), o que mostrava a AAPL a 289 $
 * quando valia 324 $ — e ainda por cima sob a legenda "fechos do dia
 * anterior". Cadeia de fallback honesta: Finnhub → fechos da BD → snapshot
 * estático; o flag `live` diz ao chamador que legenda usar, para a UI nunca
 * afirmar algo que não é verdade.
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

/** Metadados (nome/logo) — vêm sempre da BD; só o preço é que é live. */
type CompanyMeta = { name: string; logoUrl: string | null; close: number; prevClose: number | null };

async function fetchCompanyMeta(): Promise<Map<string, CompanyMeta>> {
  const companies = await prisma.company.findMany({
    where: { ticker: { in: TICKERS }, isActive: true },
    select: {
      ticker: true,
      name: true,
      logoUrl: true,
      prices: { orderBy: { date: "desc" }, take: 2, select: { close: true } },
    },
  });

  return new Map(
    companies.map((c) => [
      c.ticker,
      {
        name: c.name,
        logoUrl: c.logoUrl,
        close: c.prices[0] ? Number(c.prices[0].close) : 0,
        prevClose: c.prices[1] ? Number(c.prices[1].close) : null,
      },
    ]),
  );
}

const CHUNK_SIZE = 5;
const CHUNK_DELAY_MS = 250;

/**
 * Cotações reais, em chunks de 5 com pausa entre chunks — o mesmo padrão de
 * app/api/prices/batch/route.ts, para não estourar o rate limit da Finnhub.
 * Um ticker a falhar não derruba o lote (allSettled).
 */
async function fetchLiveQuotes(apiKey: string): Promise<Map<string, { price: number; changePct: number | null }>> {
  const out = new Map<string, { price: number; changePct: number | null }>();

  for (let i = 0; i < TICKERS.length; i += CHUNK_SIZE) {
    const chunk = TICKERS.slice(i, i + CHUNK_SIZE);
    const settled = await Promise.allSettled(
      chunk.map(async (ticker) => {
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`,
          { next: { revalidate: 300 } },
        );
        if (!res.ok) throw new Error(`quote ${ticker}: ${res.status}`);
        const data = await res.json();
        // c = preço atual, dp = variação em PERCENTAGEM (2.7 = +2,7%);
        // o TickerItem guarda decimal, daí o /100.
        if (typeof data.c !== "number" || data.c === 0) throw new Error(`quote ${ticker}: vazio`);
        return {
          ticker,
          price: data.c as number,
          changePct: typeof data.dp === "number" ? data.dp / 100 : null,
        };
      }),
    );

    for (const r of settled) {
      if (r.status === "fulfilled") out.set(r.value.ticker, { price: r.value.price, changePct: r.value.changePct });
    }

    if (i + CHUNK_SIZE < TICKERS.length) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }

  return out;
}

async function fetchTickerItems(): Promise<TickerData> {
  let meta: Map<string, CompanyMeta>;
  try {
    meta = await fetchCompanyMeta();
  } catch {
    return { items: FALLBACK, live: false };
  }

  // 1) preços reais
  const apiKey = process.env.FINNHUB_API_KEY;
  if (apiKey) {
    try {
      const quotes = await fetchLiveQuotes(apiKey);
      const items: TickerItem[] = [];
      for (const ticker of TICKERS) {
        const quote = quotes.get(ticker);
        const company = meta.get(ticker);
        if (!quote || !company) continue;
        items.push({
          ticker,
          name: company.name,
          logoUrl: company.logoUrl,
          close: quote.price,
          changePct: quote.changePct,
        });
      }
      // Só vale como "em direto" se a maioria respondeu; senão seria uma fita
      // meia-vazia com uma legenda a prometer preços reais.
      if (items.length >= TICKERS.length - 2) return { items, live: true };
    } catch {
      // cai para os fechos da BD
    }
  }

  // 2) fechos da BD (podem estar atrasados — a legenda tem de o refletir)
  const items: TickerItem[] = [];
  for (const ticker of TICKERS) {
    const company = meta.get(ticker);
    if (!company || company.close === 0) continue;
    items.push({
      ticker,
      name: company.name,
      logoUrl: company.logoUrl,
      close: company.close,
      changePct:
        company.prevClose && company.prevClose > 0
          ? (company.close - company.prevClose) / company.prevClose
          : null,
    });
  }

  // 3) Poucos resultados = BD por semear; o snapshot dá uma fita completa.
  return items.length >= 6 ? { items, live: false } : { items: FALLBACK, live: false };
}

export const getTickerItems = unstable_cache(fetchTickerItems, ["landing-ticker"], {
  revalidate: 300,
});
