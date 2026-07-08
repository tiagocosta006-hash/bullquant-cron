import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getCategoryCompaniesPage,
  getAvailableSectors,
  SCREENER_CATEGORIES,
  DEFAULT_CATEGORY,
  isValidCategory,
} from "@/lib/finance/screener";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sector?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  // O `tab` é uma chave estável (marketCap, gainers, ...) — o label é traduzido no cliente.
  const activeTab = isValidCategory(resolvedParams.tab) ? resolvedParams.tab : DEFAULT_CATEGORY;
  const activeSector = resolvedParams.sector || undefined;

  const [{ companies, hasMore }, sectors] = await Promise.all([
    getCategoryCompaniesPage(activeTab, 24, 0, activeSector),
    getAvailableSectors(),
  ]);

  return (
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
  );
}
