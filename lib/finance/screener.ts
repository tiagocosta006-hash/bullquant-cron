import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ScreenerCompany = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  sector: string | null;
  sharesOutstanding: number | null;
  /** Preço de fecho do último dia útil ingerido (EOD) — não é tempo real. */
  lastClose: number | null;
  /** Variação % face ao fecho anterior — mesmo dia/fonte que `lastClose`. */
  lastChangePercent: number | null;
};

export type ScreenerPage = {
  companies: ScreenerCompany[];
  hasMore: boolean;
};

/**
 * Categorias do dashboard de Insights — todas calculadas a partir de dados
 * reais já na BD (Fundamental.sharesOutstanding + Price EOD), sem chamadas
 * externas. Nenhuma lista de tickers hardcoded.
 *
 * NOTA: "marketCap", "gainers" e "losers" usam o preço de FECHO do último dia
 * útil ingerido (cron pós-fecho, ver .github/workflows/ingest-prices.yml) —
 * não é uma variação intraday em tempo real.
 */
export type ScreenerCategory =
  | "sp500"
  | "marketCap"
  | "gainers"
  | "losers"
  | "etfs";

export const SCREENER_CATEGORIES: ScreenerCategory[] = [
  "marketCap",
  "gainers",
  "losers",
  "sp500",
  "etfs",
];

export const DEFAULT_CATEGORY: ScreenerCategory = "marketCap";

export function isValidCategory(value: string | undefined): value is ScreenerCategory {
  return !!value && (SCREENER_CATEGORIES as string[]).includes(value);
}

type RawRow = {
  ticker: string;
  name: string;
  logourl: string | null;
  sector: string | null;
  sharesoutstanding: Prisma.Decimal | null;
  lastclose: Prisma.Decimal | null;
  previousclose: Prisma.Decimal | null;
};

function toNumber(value: Prisma.Decimal | null): number | null {
  if (value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function mapRawRow(r: RawRow): ScreenerCompany {
  const sharesOutstanding = toNumber(r.sharesoutstanding);
  const lastClose = toNumber(r.lastclose);
  const previousClose = toNumber(r.previousclose);

  const lastChangePercent = lastClose !== null && previousClose !== null && previousClose !== 0
    ? ((lastClose - previousClose) / previousClose) * 100
    : null;

  return {
    ticker: r.ticker,
    name: r.name,
    logoUrl: r.logourl,
    sector: r.sector,
    sharesOutstanding,
    lastClose,
    lastChangePercent,
  };
}

/**
 * Últimos 2 preços por ticker via LATERAL JOIN (top-N por grupo) em vez do
 * `include: { prices: { take: 2 } }` do Prisma — esse padrão traz TODAS as
 * linhas de `prices` para os tickers pedidos e só corta para 2 em memória no
 * Node, o que com ~530 empresas e ~620k linhas de preços custava 4-8s por
 * pedido. O LATERAL faz o corte dentro do Postgres, ~300-400ms.
 */
async function queryCompanies(
  orderBy: Prisma.Sql,
  limit: number,
  offset: number,
  sector?: string,
  isEtf?: boolean,
): Promise<{ rows: RawRow[] }> {
  const sectorFilter = sector ? Prisma.sql`AND c.sector = ${sector}` : Prisma.empty;
  const etfFilter = isEtf 
    ? Prisma.sql`AND c.exchange = 'MACRO' AND c.ticker NOT LIKE '^%'`
    : Prisma.sql`AND (c.exchange IS NULL OR c.exchange != 'MACRO')`;

  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      c.ticker, c.name, c."logoUrl" AS logourl, c.sector,
      lf."sharesOutstanding" AS sharesoutstanding,
      lp.last_close AS lastclose,
      lp.previous_close AS previousclose
    FROM companies c
    LEFT JOIN LATERAL (
      SELECT f."sharesOutstanding"
      FROM fundamentals f
      WHERE f."companyId" = c.id
      ORDER BY f."periodEnd" DESC
      LIMIT 1
    ) lf ON true
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(p2.close ORDER BY p2.date DESC))[1] AS last_close,
        (array_agg(p2.close ORDER BY p2.date DESC))[2] AS previous_close
      FROM (
        SELECT p.close, p.date
        FROM prices p
        WHERE p.ticker = c.ticker
        ORDER BY p.date DESC
        LIMIT 2
      ) p2
    ) lp ON true
    WHERE c."isActive" = true
    ${sectorFilter}
    ${etfFilter}
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `;

  return { rows };
}

const ORDER_BY_MARKET_CAP = Prisma.sql`(COALESCE(lf."sharesOutstanding", 0) * COALESCE(lp.last_close, 0)) DESC NULLS LAST`;
const ORDER_BY_GAINERS = Prisma.sql`
  CASE WHEN lp.previous_close IS NOT NULL AND lp.previous_close != 0
    THEN (lp.last_close - lp.previous_close) / lp.previous_close
    ELSE NULL END DESC NULLS LAST
`;
const ORDER_BY_LOSERS = Prisma.sql`
  CASE WHEN lp.previous_close IS NOT NULL AND lp.previous_close != 0
    THEN (lp.last_close - lp.previous_close) / lp.previous_close
    ELSE NULL END ASC NULLS LAST
`;

export async function getCategoryCompaniesPage(
  category: ScreenerCategory,
  limit = 24,
  offset = 0,
  sector?: string,
): Promise<ScreenerPage> {
  const isEtf = category === "etfs";
  const orderBy = category === "gainers" ? ORDER_BY_GAINERS
    : category === "losers" ? ORDER_BY_LOSERS
    : ORDER_BY_MARKET_CAP; // marketCap, sp500 e etfs ordenam por Market Cap (sendo que ETFs não devem ter, vão ficar com ordem arbitrária, mas okay)

  // Pede 1 a mais para saber se há próxima página, sem precisar de um COUNT(*) à parte.
  const { rows } = await queryCompanies(orderBy, limit + 1, offset, sector, isEtf);
  const hasMore = rows.length > limit;
  const companies = rows.slice(0, limit).map(mapRawRow);

  return { companies, hasMore };
}

/** Mantido para compatibilidade — primeira página apenas. */
export async function getCategoryCompanies(
  category: ScreenerCategory,
  limit = 24,
  sector?: string,
): Promise<ScreenerCompany[]> {
  const { companies } = await getCategoryCompaniesPage(category, limit, 0, sector);
  return companies;
}

/** Setores distintos presentes na BD, ordenados por nº de empresas (desc). */
export async function getAvailableSectors(): Promise<string[]> {
  const groups = await prisma.company.groupBy({
    by: ["sector"],
    where: { isActive: true, sector: { not: null } },
    _count: { sector: true },
    orderBy: { _count: { sector: "desc" } },
  });
  return groups.map(g => g.sector).filter((s): s is string => !!s);
}
