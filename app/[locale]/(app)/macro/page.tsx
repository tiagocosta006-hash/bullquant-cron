import { prisma } from "@/lib/prisma";
import { MacroDashboardClient } from "./MacroDashboardClient";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MacroPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch macro data from DB
  const rawData = await prisma.price.findMany({
    where: {
      ticker: { in: ['^DGS10', '^T10Y2Y', '^FEDFUNDS', '^CPI_YOY'] }
    },
    orderBy: { date: 'asc' },
    select: { ticker: true, date: true, close: true }
  });

  // Organize data by ticker
  const series: Record<string, { date: string; value: number }[]> = {
    '^DGS10': [],
    '^T10Y2Y': [],
    '^FEDFUNDS': [],
    '^CPI_YOY': []
  };

  for (const row of rawData) {
    series[row.ticker].push({
      date: row.date.toISOString(),
      value: Number(row.close)
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-20 pb-16">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Macroeconomia
        </h1>
        <p className="mt-2 text-muted-foreground">
          Indicadores vitais para análise do ciclo económico e avaliação de mercado.
        </p>
      </div>

      <MacroDashboardClient initialData={series} />
    </div>
  );
}
