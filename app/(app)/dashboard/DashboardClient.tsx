"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Briefcase, Calculator, CalendarDays, SearchCode, ArrowUpRight, Loader2, LayoutDashboard, LucideIcon } from "lucide-react";
import { PageHeader, SectionLabel } from "@/components/layout/PageHeader";
import { StockCard } from "@/components/stock/StockCard";
import { ScreenerCompany, ScreenerCategory } from "@/lib/finance/screener";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PriceData {
  currentPrice?: number;
  changePercent?: number;
  error?: string;
}

interface DashboardClientProps {
  tabs: ScreenerCategory[];
  activeTab: ScreenerCategory;
  activeSector: string | undefined;
  sectors: string[];
  initialCompanies: ScreenerCompany[];
  initialHasMore: boolean;
}

export function DashboardClient({ tabs, activeTab, activeSector, sectors, initialCompanies, initialHasMore }: DashboardClientProps) {
  const router = useRouter();
  const t = useTranslations("dashboard");
  const [companies, setCompanies] = useState<ScreenerCompany[]>(initialCompanies);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [isPricesLoading, setIsPricesLoading] = useState(true);
  // Rastreia que tickers já têm pedido de preço feito/em curso, para "Carregar mais" só pedir os novos.
  // Nota: o componente é remontado (via `key` no page.tsx) sempre que tab/setor mudam,
  // por isso não é preciso sincronizar `initialCompanies`/`initialHasMore` via efeito aqui.
  const requestedTickers = useRef<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    const pending = companies.filter(c => !requestedTickers.current.has(c.ticker));
    if (pending.length === 0) {
      setIsPricesLoading(false);
      return;
    }

    async function fetchLivePrices() {
      setIsPricesLoading(true);
      const tickers = pending.map((c) => c.ticker);
      tickers.forEach(ticker => requestedTickers.current.add(ticker));

      try {
        const res = await fetch(`/api/prices/batch?tickers=${tickers.join(",")}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setPrices(prev => ({ ...prev, ...data }));
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

  const buildUrl = (tab: ScreenerCategory, sector: string | undefined) => {
    const params = new URLSearchParams({ tab });
    if (sector) params.set("sector", sector);
    return `/dashboard?${params.toString()}`;
  };

  const handleTabChange = (tab: ScreenerCategory) => {
    router.push(buildUrl(tab, activeSector));
  };

  const handleSectorChange = (sector: string | null) => {
    router.push(buildUrl(activeTab, sector && sector !== "ALL" ? sector : undefined));
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ tab: activeTab, offset: String(companies.length) });
      if (activeSector) params.set("sector", activeSector);

      const res = await fetch(`/api/dashboard/companies?${params.toString()}`);
      if (res.ok) {
        const data: { companies: ScreenerCompany[]; hasMore: boolean } = await res.json();
        setCompanies(prev => [...prev, ...data.companies]);
        setHasMore(data.hasMore);
      }
    } catch (err) {
      console.error("Failed to load more companies", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero editorial: título grande, subtítulo, respiro */}
      <PageHeader
        icon={<LayoutDashboard className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* Atalhos em vidro */}
      <div>
        <SectionLabel>{t("quickActionsTitle")}</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction href="/portfolio" icon={Briefcase} title={t("actions.portfolio")} desc={t("actions.portfolioDesc")} />
          <QuickAction href="/dcf" icon={Calculator} title={t("actions.dcf")} desc={t("actions.dcfDesc")} />
          <QuickAction href="/calendar" icon={CalendarDays} title={t("actions.calendar")} desc={t("actions.calendarDesc")} />
          <QuickAction href="/explore" icon={SearchCode} title={t("actions.explore")} desc={t("actions.exploreDesc")} />
        </div>
      </div>

      {/* Explorar: título + filtro de setor, tabs em pill de vidro + grelha */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SectionLabel className="mb-0">{t("exploreTitle")}</SectionLabel>
          <Select value={activeSector ?? "ALL"} onValueChange={handleSectorChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("sectorFilter.all")}>
                {(value: string | null) => !value || value === "ALL" ? t("sectorFilter.all") : value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("sectorFilter.all")}</SelectItem>
              {sectors.map(sector => (
                <SelectItem key={sector} value={sector}>{sector}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="glass mb-5 flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5" data-native-scroll>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>

        {/* Freshness note — os dados de variação/market cap usam o fecho do último dia útil ingerido, não tempo real */}
        {(activeTab === "gainers" || activeTab === "losers" || activeTab === "marketCap") && (
          <p className="mb-3 text-xs text-muted-foreground">{t("eodNotice")}</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 w-full">
          {companies.map((company) => {
            const priceData = prices[company.ticker];
            // "gainers"/"losers"/"marketCap" ordenam pela variação EOD (screener.ts) — o card
            // tem de mostrar essa mesma variação, senão a ordem e o sinal exibido divergem
            // (ex: uma empresa listada como "subida" ontem mas a cair agora em tempo real).
            // Nas outras tabs (sem ranking por variação) preferimos o preço live, com fallback a EOD.
            const isEodRankedTab = activeTab === "gainers" || activeTab === "losers" || activeTab === "marketCap";
            const currentPrice = isEodRankedTab
              ? company.lastClose ?? priceData?.currentPrice
              : priceData?.currentPrice ?? company.lastClose;
            const changePercent = isEodRankedTab
              ? company.lastChangePercent ?? priceData?.changePercent
              : priceData?.changePercent ?? company.lastChangePercent;
            const isLoadingCard = isPricesLoading && priceData === undefined && company.lastClose === null;

            return (
              <StockCard
                key={company.ticker}
                ticker={company.ticker}
                name={company.name}
                logoUrl={company.logoUrl}
                sharesOutstanding={company.sharesOutstanding}
                currentPrice={currentPrice ?? null}
                changePercent={changePercent ?? null}
                isLoading={isLoadingCard}
              />
            );
          })}
        </div>

        {companies.length === 0 && (
          <div className="py-20 text-center text-muted-foreground">
            {t("empty")}
          </div>
        )}

        {hasMore && (
          <div className="mt-6 flex justify-center">
            <Button variant="outline" onClick={handleLoadMore} disabled={isLoadingMore} className="gap-2 min-h-[48px] px-6 rounded-full w-full sm:w-auto">
              {isLoadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("loadMore")}
            </Button>
          </div>
        )}
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
      prefetch={false}
      className="glass group relative flex items-start gap-3 rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-tight transition-colors group-hover:text-primary">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{desc}</p>
      </div>
      <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
