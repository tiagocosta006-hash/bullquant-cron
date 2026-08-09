"use client";

import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

/**
 * DashboardReplica — mock fiel do bento "Tudo num terminal": pill tabs +
 * grelha 3x3 de logos, cópia das class strings reais de
 * app/(app)/dashboard/DashboardClient.tsx (pill de tabs). Preço/variação
 * hardcoded (não precisam de i18n); logos reais vêm do `ticker.items` já
 * pedido em page.tsx (getTickerItems) — sem fetch extra aqui, só passagem
 * de prop. Os 9 tickers já fazem parte da lista TICKERS de
 * lib/marketing/ticker.ts, por isso não há custo extra de API.
 *
 * 9 empresas em vez de 3, em grelha 3x3 — tiles quadrados (aspect-square)
 * em vez da linha larga anterior. Com 9 tiles não cabe o layout completo do
 * StockCard (nome + preço + cap + variação): reduzido a logo + ticker +
 * variação, que é o que continua legível a ~1/3 da largura do cartão.
 */

const MOCK_STOCKS = [
  { ticker: "AAPL", price: "227,34 $", cap: "3,4 T$", change: "+0,82%", up: true },
  { ticker: "MSFT", price: "448,90 $", cap: "3,3 T$", change: "+0,41%", up: true },
  { ticker: "NVDA", price: "131,62 $", cap: "3,2 T$", change: "−1,13%", up: false },
  { ticker: "GOOGL", price: "182,15 $", cap: "2,2 T$", change: "+0,27%", up: true },
  { ticker: "AMZN", price: "197,48 $", cap: "2,1 T$", change: "+0,65%", up: true },
  { ticker: "META", price: "578,02 $", cap: "1,5 T$", change: "−0,38%", up: false },
  { ticker: "TSLA", price: "246,70 $", cap: "790 B$", change: "+1,54%", up: true },
  { ticker: "NFLX", price: "692,55 $", cap: "300 B$", change: "+0,19%", up: true },
  { ticker: "V", price: "288,11 $", cap: "580 B$", change: "+0,08%", up: true },
] as const;

export function DashboardReplica({
  tabs,
  marketCapLabel,
  logos,
  variant = "A",
}: {
  /** dashboard.tabs.* — só os labels, key "sp500" fica ativa */
  tabs: string[];
  /** dashboard.marketCap */
  marketCapLabel: string;
  /** logoUrl real por ticker — vem do TickerItem já pedido em page.tsx, sem fetch extra */
  logos?: Partial<Record<(typeof MOCK_STOCKS)[number]["ticker"], string | null>>;
  /** Tile layout variant: A (rodapé real) | B (badge no rodapé) | C (centrado) */
  variant?: "A" | "B" | "C";
}) {
  return (
    <div data-replica className="mt-5 space-y-3">
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

      {/* grelha 3x3 de tiles quadrados — 3 variantes de layout */}
      <div className="grid grid-cols-3 gap-2">
        {MOCK_STOCKS.map((s) =>
          variant === "A" ? (
            // Opção A: rodapé real com legenda "CAPITALIZAÇÃO" separada
            <div
              key={s.ticker}
              className="glass group relative flex aspect-square flex-col overflow-hidden rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center gap-1.5">
                <CompanyLogo
                  src={logos?.[s.ticker] ?? null}
                  alt={s.ticker}
                  fallback={s.ticker}
                  size={20}
                  className="shrink-0 rounded-md"
                />
                <span className="truncate text-xs font-bold">{s.ticker}</span>
              </div>
              <span className="nums mt-1.5 text-base font-bold leading-none">{s.price}</span>
              <span className={cn("nums mt-1 text-[10px] font-semibold", s.up ? "text-bull" : "text-bear")}>
                {s.change}
              </span>
              <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {marketCapLabel}
                </span>
                <span className="nums text-[10px] font-semibold text-foreground/90">{s.cap}</span>
              </div>
            </div>
          ) : variant === "B" ? (
            // Opção B: variação como badge no rodapé
            <div
              key={s.ticker}
              className="glass group relative flex aspect-square flex-col overflow-hidden rounded-xl p-2.5 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center gap-1.5">
                <CompanyLogo
                  src={logos?.[s.ticker] ?? null}
                  alt={s.ticker}
                  fallback={s.ticker}
                  size={20}
                  className="shrink-0 rounded-md"
                />
                <span className="truncate text-xs font-bold">{s.ticker}</span>
              </div>
              <span className="nums mt-1.5 text-base font-bold leading-none">{s.price}</span>
              <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-1.5">
                <span className="nums text-[10px] font-semibold text-foreground/90">{s.cap}</span>
                <span
                  className={cn(
                    "nums rounded-full px-1.5 py-px text-[10px] font-bold",
                    s.up ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear",
                  )}
                >
                  {s.change}
                </span>
              </div>
            </div>
          ) : (
            // Opção C: centrado, cap discreto por baixo
            <div
              key={s.ticker}
              className="glass group relative flex aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-xl p-2.5 text-center transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100" />
              <CompanyLogo
                src={logos?.[s.ticker] ?? null}
                alt={s.ticker}
                fallback={s.ticker}
                size={26}
                className="shrink-0 rounded-md"
              />
              <span className="truncate text-xs font-bold">{s.ticker}</span>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="nums text-sm font-bold leading-none">{s.price}</span>
                <span className={cn("nums text-[10px] font-semibold", s.up ? "text-bull" : "text-bear")}>
                  {s.change}
                </span>
              </div>
              <span className="nums text-[10px] text-muted-foreground/70">{s.cap}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
