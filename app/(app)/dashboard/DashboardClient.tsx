"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Briefcase, Calculator, CalendarDays, MessageSquareText, ArrowUpRight, LucideIcon } from "lucide-react";
import { StockCard } from "@/components/stock/StockCard";
import { ScreenerCompany, ScreenerCategory } from "@/lib/finance/screener";
import { cn } from "@/lib/utils";

interface PriceData {
  currentPrice?: number;
  changePercent?: number;
  error?: string;
}

interface DashboardClientProps {
  tabs: ScreenerCategory[];
  activeTab: ScreenerCategory;
  companies: ScreenerCompany[];
}

export function DashboardClient({ tabs, activeTab, companies }: DashboardClientProps) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isPricesLoading, setIsPricesLoading] = useState(true);

  // Fetch prices only when companies array changes (tab changes)
  useEffect(() => {
    let isMounted = true;

    async function fetchLivePrices() {
      if (companies.length === 0) return;

      setIsPricesLoading(true);
      const tickers = companies.map((c) => c.ticker);

      try {
        const res = await fetch(`/api/prices/batch?tickers=${tickers.join(",")}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setPrices(data);
          }
        }
      } catch (err) {
        console.error("Failed to fetch live prices", err);
      } finally {
        if (isMounted) {
          setIsPricesLoading(false);
        }
      }
    }

    fetchLivePrices();

    return () => {
      isMounted = false;
    };
  }, [companies]);

  const handleTabChange = (tab: ScreenerCategory) => {
    // Clear prices optimistic UI
    setIsPricesLoading(true);
    setPrices({});
    router.push(`/dashboard?tab=${tab}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/20">
      {/* Header (compacto, alinhado à esquerda) */}
      <div className="w-full max-w-[1600px] mx-auto px-6 pt-8 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          {t("subtitle")}
        </p>
      </div>

      {/* Quick Actions / Shortcuts */}
      <div className="w-full max-w-[1600px] mx-auto px-6 pb-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
          {t("quickActionsTitle")}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction href="/portfolio" icon={Briefcase} title={t("actions.portfolio")} desc={t("actions.portfolioDesc")} />
          <QuickAction href="/dcf" icon={Calculator} title={t("actions.dcf")} desc={t("actions.dcfDesc")} />
          <QuickAction href="/calendar" icon={CalendarDays} title={t("actions.calendar")} desc={t("actions.calendarDesc")} />
          <QuickAction href="/transcripts" icon={MessageSquareText} title={t("actions.transcripts")} desc={t("actions.transcriptsDesc")} />
        </div>
      </div>

      {/* Explore companies heading */}
      <div className="w-full max-w-[1600px] mx-auto px-6 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("exploreTitle")}
        </h2>
      </div>

      {/* Tabs Section */}
      <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center overflow-x-auto no-scrollbar px-6 max-w-[1600px] mx-auto">
          <div className="flex space-x-1 py-1 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={cn(
                  "px-4 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 rounded-t-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  activeTab === tab
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid Section */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="max-w-[1600px] mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {companies.map((company) => {
              const priceData = prices[company.ticker];

              return (
                <StockCard
                  key={company.ticker}
                  ticker={company.ticker}
                  name={company.name}
                  logoUrl={company.logoUrl}
                  sharesOutstanding={company.sharesOutstanding}
                  currentPrice={priceData?.currentPrice ?? null}
                  changePercent={priceData?.changePercent ?? null}
                  isLoading={isPricesLoading}
                />
              );
            })}
          </div>

          {companies.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              {t("empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  desc,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex items-start gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-all hover:border-primary/40 hover:bg-card/80"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{desc}</p>
      </div>
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
