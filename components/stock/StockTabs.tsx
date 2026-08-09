"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LiquidGlass } from "@/components/fx/LiquidGlass";

const TAB_KEYS = ["overview", "financials", "analista", "valuation", "company", "news"] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * StockTabs — a página de stock deixou de ser um scroll infinito de
 * 8 secções: organiza-se por intenção (Resumo · Fundamentais · Analista ·
 * Valuation · Empresa · Notícias) numa barra de tabs em vidro, presa
 * por baixo da TopNav. As secções ficam montadas (SSR/SEO intactos) e
 * alternam por visibilidade — os gráficos remedem ao voltar.
 */
// Tabs cujo conteúdo é (pelo menos parcialmente) Pro. Mostra-se um indicador
// dourado no próprio botão — antes de clicar — para quem ainda não é Pro
// (guest, FREE, ou a ver a demo pública) perceber que há valor extra lá
// dentro, em vez de descobrir só depois de entrar na tab e bater no lock.
const PRO_TABS: TabKey[] = ["valuation"];

export function StockTabs({
  overview,
  financials,
  analista,
  valuation,
  company,
  news,
  isEtf = false,
  hasPro = false,
}: Record<TabKey, React.ReactNode> & { isEtf?: boolean; hasPro?: boolean }) {
  const t = useTranslations("stock.tabs");
  const tProGate = useTranslations("stock.proGate");
  const [active, setActive] = useState<TabKey>("overview");
  const slots: Record<TabKey, React.ReactNode> = { overview, financials, analista, valuation, company, news };

  const tabsToShow = isEtf
    ? TAB_KEYS.filter(k => k === "overview" || k === "news")
    : TAB_KEYS;

  return (
    <div>
      <div className="sticky top-20 z-40 mb-6 flex justify-center md:justify-start">
        <LiquidGlass className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5" data-native-scroll>
          {tabsToShow.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
                active === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {t(key)}
              {!hasPro && PRO_TABS.includes(key) && (
                <span
                  title={tProGate("title")}
                  className={cn(
                    "inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-bold uppercase tracking-wider",
                    active === key
                      ? "border-primary-foreground/40 bg-primary-foreground/15 text-primary-foreground"
                      : "border-primary/30 bg-primary/10 text-primary",
                  )}
                >
                  {tProGate("title")}
                </span>
              )}
            </button>
          ))}
        </LiquidGlass>
      </div>

      {tabsToShow.map((key) => (
        <div key={key} className={cn("space-y-8", active !== key && "hidden")}>
          {slots[key]}
        </div>
      ))}
    </div>
  );
}
