import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getCategoryCompanies,
  SCREENER_CATEGORIES,
  DEFAULT_CATEGORY,
  isValidCategory,
} from "@/lib/finance/screener";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  // O `tab` é uma chave estável (sp500, growth, ...) — o label é traduzido no cliente.
  const activeTab = isValidCategory(resolvedParams.tab) ? resolvedParams.tab : DEFAULT_CATEGORY;

  // Buscar empresas do backend (Prisma)
  const companies = await getCategoryCompanies(activeTab, 24);

  return (
    <DashboardClient
      tabs={SCREENER_CATEGORIES}
      activeTab={activeTab}
      companies={companies}
    />
  );
}
