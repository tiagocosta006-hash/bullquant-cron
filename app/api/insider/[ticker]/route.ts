import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/insider/[ticker]
 * Transações de insiders (SEC Form 4) de uma empresa, mais recentes primeiro,
 * + um resumo de compras/vendas na janela recente. Decimais → number antes do
 * browser. Degrada para lista vazia se a tabela ainda não estiver populada.
 */
const WINDOW_DAYS = 90;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  try {
    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { id: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const rows = await prisma.insiderTransaction.findMany({
      where: { companyId: company.id },
      orderBy: { transactionDate: "desc" },
      take: 100,
    });

    const transactions = rows.map((r) => ({
      id: r.id,
      insiderName: r.insiderName,
      title: r.title,
      type: r.type, // BUY | SELL | OTHER
      transactionCode: r.transactionCode,
      shares: Number(r.shares),
      sharesChange: r.sharesChange !== null ? Number(r.sharesChange) : null,
      price: r.price !== null ? Number(r.price) : null,
      value: r.value !== null ? Number(r.value) : null,
      sharesOwnedAfter:
        r.sharesOwnedAfter !== null ? Number(r.sharesOwnedAfter) : null,
      transactionDate: r.transactionDate.toISOString().slice(0, 10),
      filedAt: r.filedAt ? r.filedAt.toISOString().slice(0, 10) : null,
    }));

    // Resumo da janela recente
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS);
    const recent = transactions.filter((t) => new Date(t.transactionDate) >= cutoff);

    const summary = {
      windowDays: WINDOW_DAYS,
      buyCount: recent.filter((t) => t.type === "BUY").length,
      sellCount: recent.filter((t) => t.type === "SELL").length,
      buyValue: recent
        .filter((t) => t.type === "BUY")
        .reduce((s, t) => s + (t.value ?? 0), 0),
      sellValue: recent
        .filter((t) => t.type === "SELL")
        .reduce((s, t) => s + (t.value ?? 0), 0),
    };

    return NextResponse.json({ transactions, summary });
  } catch (error) {
    // Tabela ainda não migrada/populada → degrada graciosamente
    console.error("Error fetching insider transactions:", error);
    return NextResponse.json({ transactions: [], summary: null, unavailable: true });
  }
}
