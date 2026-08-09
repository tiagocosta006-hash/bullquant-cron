import { notFound } from "next/navigation";

import { TypingTerminal, type TerminalCompany } from "@/components/marketing/heroes/TypingTerminal";
import { CTA, Peek } from "@/components/marketing/heroes/shared";
import { prisma } from "@/lib/prisma";

const fmtB = (n: number | null) => (n === null ? "N/A" : `$${(n / 1e9).toFixed(1)}B`);
const fmtPct = (n: number | null) => (n === null ? "N/A" : `${(n * 100).toFixed(1)}%`);

/** /preview-3 — "O terminal a escrever-se": o produto a funcionar sozinho. */
export default async function Preview3() {
  if (process.env.NODE_ENV !== "development") notFound();

  const tickers = ["AAPL", "MSFT", "NVDA"];
  const rows = await prisma.company.findMany({
    where: { ticker: { in: tickers } },
    select: {
      ticker: true,
      name: true,
      fundamentals: {
        where: { periodType: "ANNUAL", revenue: { not: null } },
        orderBy: { fiscalYear: "desc" },
        take: 1,
        select: {
          fiscalYear: true,
          revenue: true,
          freeCashFlow: true,
          netMargin: true,
          roic: true,
        },
      },
    },
  });

  // N/A nunca 0 (CLAUDE.md §7): se o campo não existe, dizemo-lo.
  const companies: TerminalCompany[] = tickers
    .map((tk) => rows.find((r) => r.ticker === tk))
    .filter((c): c is NonNullable<typeof c> => !!c && c.fundamentals.length > 0)
    .map((c) => {
      const f = c.fundamentals[0];
      return {
        ticker: c.ticker,
        name: c.name,
        rows: [
          { label: `Receita FY${f.fiscalYear}`, value: fmtB(f.revenue ? Number(f.revenue) : null) },
          { label: "Free Cash Flow", value: fmtB(f.freeCashFlow ? Number(f.freeCashFlow) : null) },
          { label: "Margem líquida", value: fmtPct(f.netMargin ? Number(f.netMargin) : null) },
          { label: "ROIC", value: fmtPct(f.roic ? Number(f.roic) : null) },
        ],
      };
    });

  if (!companies.length) notFound();

  return (
    <section className="flex min-h-[calc(100svh-4rem)] items-center px-6 py-20 md:px-8">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 lg:grid-cols-2">
        <div>
          <h1 className="max-w-[14ch] text-balance text-5xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-6xl md:text-7xl">
            Escreve um ticker.
            <br />
            <span className="text-primary">Vê os números.</span>
          </h1>
          <p className="mt-8 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Sem folhas de cálculo e sem procurar o relatório. Os fundamentais das 500 empresas do
            S&amp;P 500, retirados dos filings da SEC — em português e de graça.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <CTA>Criar conta grátis</CTA>
            <Peek />
          </div>
        </div>

        <TypingTerminal companies={companies} />
      </div>
    </section>
  );
}
