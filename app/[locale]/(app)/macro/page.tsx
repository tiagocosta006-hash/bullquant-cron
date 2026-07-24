import { prisma } from "@/lib/prisma";
import { MacroDashboardClient } from "./MacroDashboardClient";
import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MACRO_TICKERS = [
  '^DGS1MO', '^DGS10', '^DGS30', '^T10Y2Y', 
  '^FEDFUNDS', '^CPI_YOY', '^GDP_YOY', '^UNRATE', '^VIX'
];

export default async function MacroPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch macro data from DB
  const rawData = await prisma.price.findMany({
    where: {
      ticker: { in: MACRO_TICKERS }
    },
    orderBy: { date: 'asc' },
    select: { ticker: true, date: true, close: true }
  });

  const series: Record<string, { date: string; value: number }[]> = {};
  for (const ticker of MACRO_TICKERS) {
    series[ticker] = [];
  }

  for (const row of rawData) {
    if (series[row.ticker]) {
      series[row.ticker].push({
        date: row.date.toISOString().split("T")[0],
        value: Number(row.close)
      });
    }
  }

  // Fetch Admin Commentaries
  const commentaries = await prisma.macroCommentary.findMany();
  const commentaryDict = commentaries.reduce((acc, curr) => {
    acc[curr.type] = { content: curr.content, updatedAt: curr.updatedAt.toISOString() };
    return acc;
  }, {} as Record<string, { content: string; updatedAt: string }>);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-20 pb-16">
      <MacroDashboardClient initialData={series} commentaries={commentaryDict} />
    </div>
  );
}
