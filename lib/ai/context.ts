import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Converte Decimal | null do Prisma para number | null.
function num(v: Prisma.Decimal | null | undefined): number | null {
  return v == null ? null : Number(v);
}

// Formata um número grande em $B/$M/K compacto (para o texto do prompt).
function big(v: number | null): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

function pct(v: number | null): string {
  return v == null ? "N/A" : `${(v * 100).toFixed(1)}%`;
}

export type CompanyContext = {
  text: string;
  hasSegments: boolean;
};

/**
 * Constrói um bloco de texto compacto com os números VERIFICADOS da nossa BD
 * (10 anos anuais + segmentos + métricas), para o Analista IA ancorar o
 * relatório em dados reais em vez de os inventar.
 */
export async function buildCompanyContext(company: {
  id: string;
  name: string;
  ticker: string;
  sector: string | null;
  industry: string | null;
  country: string;
  currency: string;
  employees: number | null;
}): Promise<CompanyContext> {
  const annuals = await prisma.fundamental.findMany({
    where: { companyId: company.id, periodType: "ANNUAL" },
    orderBy: { fiscalYear: "asc" },
    take: 12,
  });

  const lines: string[] = [];
  lines.push(`EMPRESA: ${company.name} (${company.ticker})`);
  lines.push(
    `Setor: ${company.sector || "N/A"} · Indústria: ${company.industry || "N/A"} · País: ${company.country} · Moeda: ${company.currency} · Funcionários: ${company.employees ?? "N/A"}`,
  );
  lines.push("");
  lines.push(
    "FINANCEIROS ANUAIS VERIFICADOS (da nossa base de dados — usa ESTES números, não inventes):",
  );
  lines.push(
    "Ano | Receita | Margem Bruta | Margem Oper. | Margem Líq. | Lucro Líq. | FCF | ROIC | Ações | Dívida | Caixa | EPS",
  );

  let hasSegments = false;
  for (const f of annuals) {
    lines.push(
      [
        f.fiscalYear,
        big(num(f.revenue)),
        pct(num(f.grossMargin)),
        pct(num(f.operatingMargin)),
        pct(num(f.netMargin)),
        big(num(f.netIncome)),
        big(num(f.freeCashFlow)),
        pct(num(f.roic)),
        big(num(f.sharesOutstanding)),
        big(num(f.totalDebt)),
        big(num(f.cash)),
        num(f.epsDiluted)?.toFixed(2) ?? "N/A",
      ].join(" | "),
    );
    if (f.revenueSegments && typeof f.revenueSegments === "object") hasSegments = true;
  }

  // Segmentos de receita (do último ano com dados) — dataset fiável do XBRL.
  const latestWithSeg = [...annuals]
    .reverse()
    .find((f) => f.revenueSegments && typeof f.revenueSegments === "object");
  if (latestWithSeg) {
    const segs = latestWithSeg.revenueSegments as Record<string, number>;
    lines.push("");
    lines.push(`RECEITA POR SEGMENTO (${latestWithSeg.fiscalYear}, verificado):`);
    for (const [k, v] of Object.entries(segs)) {
      lines.push(`  - ${k}: ${big(Number(v))}`);
    }
  }

  return { text: lines.join("\n"), hasSegments };
}
