"use client";

import { Link } from '@/i18n/routing';
import { useTranslations } from "next-intl";
import { formatLargeNumber } from "@/lib/finance/format";
import { CompanyLogo } from "@/components/ui/CompanyLogo";

interface StockCardProps {
  ticker: string;
  name: string;
  logoUrl: string | null;
  sharesOutstanding: number | null;
  currentPrice: number | null;
  changePercent: number | null;
  isLoading: boolean;
  currencySymbol?: string;
}

export function StockCard({
  ticker,
  name,
  logoUrl,
  sharesOutstanding,
  currentPrice,
  changePercent,
  isLoading,
  currencySymbol = "$",
}: StockCardProps) {
  const t = useTranslations("dashboard");
  // Calculate Market Cap
  const marketCap =
    sharesOutstanding && currentPrice
      ? sharesOutstanding * currentPrice
      : null;

  const isPositive = changePercent ? changePercent >= 0 : true;

  return (
    <Link href={`/stock/${ticker}`} prefetch={false} className="block group">
      <div className="glass hover:-translate-y-0.5 duration-200 transition-transform p-3.5 rounded-xl flex flex-col h-full relative overflow-hidden">
        {/* Gold top hairline on hover */}
        <div className="gold-rule absolute inset-x-0 top-0 h-px opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <CompanyLogo
              src={logoUrl}
              alt={ticker}
              fallback={ticker}
              size={32}
              className="rounded-md"
              imgClassName="p-0.5"
            />
            <div className="flex flex-col overflow-hidden min-w-0">
              <span className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                {ticker}
              </span>
              <span className="text-[11px] text-muted-foreground truncate">
                {name}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 pl-2">
            {isLoading ? (
              <div className="h-5 w-14 bg-muted animate-pulse rounded"></div>
            ) : (
              <span className="nums font-semibold text-sm">
                {currentPrice ? `${currencySymbol}${currentPrice.toFixed(2)}` : "N/A"}
              </span>
            )}

            {isLoading ? (
              <div className="h-3.5 w-10 bg-muted animate-pulse rounded mt-1"></div>
            ) : (
              changePercent !== null && (
                <span
                  className={`nums text-[11px] font-semibold mt-0.5 ${
                    isPositive ? "text-bull" : "text-bear"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {changePercent.toFixed(2)}%
                </span>
              )
            )}
          </div>
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t("marketCap")}</span>
          <span className="nums text-xs font-semibold text-foreground/90">
            {marketCap ? formatLargeNumber(marketCap, currencySymbol) : "N/A"}
          </span>
        </div>
      </div>
    </Link>
  );
}
