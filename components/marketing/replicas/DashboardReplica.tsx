"use client";

import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

/**
 * DashboardReplica — mock fiel do bento "Tudo num terminal": pill tabs +
 * grelha de StockCards, cópia das class strings reais de
 * app/(app)/dashboard/DashboardClient.tsx (pill de tabs) e
 * components/stock/StockCard.tsx (card individual). Preço/variação/cap
 * hardcoded (não precisam de i18n); logos reais (AAPL/MSFT/NVDA) vêm do
 * `ticker.items` já pedido em page.tsx (getTickerItems) — sem fetch extra
 * aqui, só passagem de prop.
 */

const MOCK_STOCKS = [
  { ticker: "AAPL", name: "Apple Inc.", price: "227,34 $", change: "+0,82%", up: true, cap: "3,4 T$" },
  { ticker: "MSFT", name: "Microsoft Corp.", price: "448,90 $", change: "+0,41%", up: true, cap: "3,3 T$" },
  { ticker: "NVDA", name: "NVIDIA Corp.", price: "131,62 $", change: "−1,13%", up: false, cap: "3,2 T$" },
] as const;

export function DashboardReplica({
  tabs,
  marketCapLabel,
  logos,
}: {
  /** dashboard.tabs.* — só os labels, key "sp500" fica ativa */
  tabs: string[];
  /** dashboard.marketCap */
  marketCapLabel: string;
  /** logoUrl real por ticker (AAPL/MSFT/NVDA) — vem do TickerItem já pedido em page.tsx, sem fetch extra */
  logos?: Partial<Record<(typeof MOCK_STOCKS)[number]["ticker"], string | null>>;
}) {
  return (
    <div className="mt-5 space-y-3">
      {/* pill tabs — cópia fiel de DashboardClient.tsx */}
      <div className="glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5">
        {tabs.map((tab, i) => (
          <span
            key={tab}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              i === 0 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {tab}
          </span>
        ))}
      </div>

      {/* grelha de StockCards — cópia fiel de components/stock/StockCard.tsx */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {MOCK_STOCKS.map((s) => (
          <div
            key={s.ticker}
            className="glass group relative flex h-full flex-col overflow-hidden rounded-xl p-3.5 transition-transform duration-200 hover:-translate-y-0.5"
          >
            {/* hairline dourada no topo, ao hover — idêntica ao StockCard real */}
            <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <CompanyLogo src={logos?.[s.ticker] ?? null} alt={s.ticker} fallback={s.ticker} size={32} className="rounded-md" />
                <div className="flex min-w-0 flex-col overflow-hidden">
                  <span className="truncate text-sm font-bold">{s.ticker}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{s.name}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end pl-2">
                <span className="nums text-sm font-semibold">{s.price}</span>
                <span className={cn("nums mt-0.5 text-[11px] font-semibold", s.up ? "text-bull" : "text-bear")}>
                  {s.change}
                </span>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {marketCapLabel}
              </span>
              <span className="nums text-xs font-semibold text-foreground/90">{s.cap}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
