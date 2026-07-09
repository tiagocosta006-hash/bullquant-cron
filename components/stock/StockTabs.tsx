"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/fx/LiquidGlass";

const TAB_KEYS = ["overview", "financials", "kpis", "valuation", "company", "news"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * StockTabs — a página de stock deixou de ser um scroll infinito de
 * 8 secções: organiza-se por intenção (Resumo · Fundamentais · KPIs ·
 * Valuation · Empresa · Notícias) numa barra de tabs em vidro, presa
 * por baixo da TopNav. As secções ficam montadas (SSR/SEO intactos) e
 * alternam por visibilidade — os gráficos remedem ao voltar.
 */
export function StockTabs({
  overview,
  financials,
  kpis,
  valuation,
  company,
  news,
}: Record<TabKey, React.ReactNode>) {
  const t = useTranslations("stock.tabs");
  const [active, setActive] = useState<TabKey>("overview");
  const slots: Record<TabKey, React.ReactNode> = { overview, financials, kpis, valuation, company, news };

  return (
    <div>
      <div className="sticky top-20 z-40 mb-6 flex justify-center md:justify-start">
        <LiquidGlass className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5" data-native-scroll>
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
                active === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {t(key)}
            </button>
          ))}
        </LiquidGlass>
      </div>

      {TAB_KEYS.map((key) => (
        <div key={key} className={cn("space-y-8", active !== key && "hidden")}>
          {slots[key]}
        </div>
      ))}
    </div>
  );
}
