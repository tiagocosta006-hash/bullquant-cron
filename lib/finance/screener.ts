import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cotacoes } from "@/lib/fmp/mercado";
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
  lastclose: Prisma.Decimal | number | null;
  previousclose: Prisma.Decimal | number | null;
};

function toNumber(value: Prisma.Decimal | number | null): number | null {
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

type Ordem = "marketCap" | "gainers" | "losers";

/**
 * Empresas de uma categoria, com a cotação da FMP.
 *
 * Antes juntava a tabela `prices` num LATERAL para ir buscar os dois últimos
 * fechos de cada empresa. Os preços deixaram de estar na base (ver
 * lib/fmp/mercado.ts): a base dá as empresas e as ações em circulação, e o
 * `batch-quote` da FMP dá as cotações de todas numa só chamada.
 *
 * A ordenação passou do SQL para aqui porque depende do preço, que já não
 * está no SQL. São ~560 empresas — ordená-las em memória é instantâneo.
 */
async function queryCompanies(
  ordem: Ordem,
  limit: number,
  offset: number,
  sector?: string,
  isEtf?: boolean,
): Promise<{ rows: RawRow[] }> {
  const sectorFilter = sector ? Prisma.sql`AND c.sector = ${sector}` : Prisma.empty;
  const etfFilter = isEtf
    ? Prisma.sql`AND c.exchange = 'MACRO' AND c.ticker NOT LIKE '^%'`
    // O `^` exclui índices (^GSPC, ^DJI, ^VIX): estão em `companies` para
    // alimentar gráficos de contexto, não são empresas.
    : Prisma.sql`AND (c.exchange IS NULL OR c.exchange != 'MACRO') AND c.ticker NOT LIKE '^%'`;

  const base = await prisma.$queryRaw<Omit<RawRow, "lastclose" | "previousclose">[]>`
    SELECT
      c.ticker, c.name, c."logoUrl" AS logourl, c.sector,
      lf."sharesOutstanding" AS sharesoutstanding
    FROM companies c
    LEFT JOIN LATERAL (
      SELECT f."sharesOutstanding"
      FROM fundamentals f
      WHERE f."companyId" = c.id
      ORDER BY f."periodEnd" DESC
      LIMIT 1
    ) lf ON true
    WHERE c."isActive" = true
    ${sectorFilter}
    ${etfFilter}
  `;

  const quotes = await cotacoes(base.map((r) => r.ticker));
  const rows: RawRow[] = base.map((r) => {
    const q = quotes.get(r.ticker);
    return { ...r, lastclose: q?.price ?? null, previousclose: q?.previousClose ?? null };
  });

  const variacao = (r: RawRow) => {
    const last = toNumber(r.lastclose);
    const prev = toNumber(r.previousclose);
    return last !== null && prev ? (last - prev) / prev : null;
  };
  const marketCap = (r: RawRow) => (toNumber(r.sharesoutstanding) ?? 0) * (toNumber(r.lastclose) ?? 0);

  // Nulos sempre no fim, como o NULLS LAST que estava no SQL.
  const chave = (r: RawRow) =>
    ordem === "marketCap" ? marketCap(r) : variacao(r);
  rows.sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return ordem === "losers" ? ka - kb : kb - ka;
  });

  return { rows: rows.slice(offset, offset + limit) };
}

/**
 * Estas listas mudam uma vez por dia, depois da ingestão — mas eram
 * recalculadas a CADA visita ao dashboard.
 *
 * As páginas do grupo (app) chamam getUser(), que lê cookies, e isso torna-as
 * dinâmicas por natureza: o CDN nunca as pode cachear. O que se cacheia é o
 * trabalho de base de dados lá dentro, que é onde está o custo. Mesma técnica
 * que o getTickerItems (lib/marketing/ticker.ts) já usava.
 *
 * Uma hora é o prazo certo: a ingestão corre de madrugada, e ninguém precisa
 * de ver a lista de maiores subidas a mudar ao segundo.
 */
const TTL_LISTAS = 3600;

export async function getCategoryCompaniesPage(
  category: ScreenerCategory,
  limit = 24,
  offset = 0,
  sector?: string,
): Promise<ScreenerPage> {
  return unstable_cache(
    () => carregarPaginaCategoria(category, limit, offset, sector),
    // A chave TEM de incluir tudo o que muda o resultado: duas categorias a
    // partilhar entrada serviriam a lista errada.
    ["screener", category, String(limit), String(offset), sector ?? "todos"],
    { revalidate: TTL_LISTAS, tags: ["screener"] },
  )();
}

async function carregarPaginaCategoria(
  category: ScreenerCategory,
  limit: number,
  offset: number,
  sector?: string,
): Promise<ScreenerPage> {
  const isEtf = category === "etfs";
  // marketCap, sp500 e etfs ordenam por Market Cap.
  const ordem: Ordem = category === "gainers" ? "gainers"
    : category === "losers" ? "losers"
    : "marketCap";

  // Pede 1 a mais para saber se há próxima página, sem precisar de um COUNT(*) à parte.
  const { rows } = await queryCompanies(ordem, limit + 1, offset, sector, isEtf);
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
export const getAvailableSectors = unstable_cache(
  async (): Promise<string[]> => {
    const groups = await prisma.company.groupBy({
      by: ["sector"],
      where: { isActive: true, sector: { not: null } },
      _count: { sector: true },
      orderBy: { _count: { sector: "desc" } },
    });
    return groups.map(g => g.sector).filter((s): s is string => !!s);
  },
  ["setores-disponiveis"],
  // Os setores só mudam quando entra uma empresa nova — dia inteiro chega.
  { revalidate: 86400, tags: ["screener"] },
);
