import { redirect } from 'next/navigation';
import { getUser } from "@/lib/supabase/server";

import {
  getCategoryCompaniesPage,
  getAvailableSectors,
  SCREENER_CATEGORIES,
  DEFAULT_CATEGORY,
  isValidCategory,
} from "@/lib/finance/screener";
import { getTranslations } from "next-intl/server";
import { TickerMarquee } from "@/components/marketing/TickerMarquee";
import { getTickerItems, GLOBAL_ETFS } from "@/lib/marketing/ticker";
import { DashboardClient } from "./DashboardClient";


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sector?: string }>;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  // O `tab` é uma chave estável (marketCap, gainers, ...) — o label é traduzido no cliente.
  const activeTab = isValidCategory(resolvedParams.tab) ? resolvedParams.tab : DEFAULT_CATEGORY;
  const activeSector = resolvedParams.sector || undefined;

  const [{ companies, hasMore }, sectors, ticker, tMarketing] = await Promise.all([
    getCategoryCompaniesPage(activeTab, 24, 0, activeSector),
    getAvailableSectors(),
    getTickerItems(),
    getTranslations("marketing"),
  ]);

  return (
    <>
      {/* Fita de ações (a mesma da landing): cada ticker abre a página da
          empresa. Full-bleed de ponta a ponta do ECRÃ — o `main` do layout é
          `mx-auto max-w-7xl`, por isso não chega anular o padding: o
          mx-[calc(50%-50vw)] escapa também ao max-width. O pt-24 do layout
          NÃO é anulado — é o espaço da TopNav fixa. */}
      <div className="mx-[calc(50%-50vw)] mb-6 w-screen flex flex-col border-y border-border/50 bg-card/40">
        <TickerMarquee
          items={ticker.items.filter(i => !GLOBAL_ETFS.includes(i.ticker))}
          label={ticker.live ? tMarketing("ticker.labelLive") : tMarketing("ticker.label")}
        />
      </div>

      <DashboardClient
        // Força remount ao mudar tab/setor — evita sincronizar props->estado via useEffect.
        key={`${activeTab}:${activeSector ?? ""}`}
        tabs={SCREENER_CATEGORIES}
        activeTab={activeTab}
        activeSector={activeSector}
        sectors={sectors}
        initialCompanies={companies}
        initialHasMore={hasMore}
      />
    </>
  );
}
