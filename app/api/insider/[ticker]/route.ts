import { NextRequest, NextResponse } from "next/server";
import { insiders } from "@/lib/fmp/calendario";
import { normalizarTicker } from "@/lib/ticker";
import { exigirPro, CACHE_PRIVADO } from "@/lib/api/acessoPro"

/**
 * GET /api/insider/[ticker]
 * Transações de insiders (SEC Form 4) de uma empresa, mais recentes primeiro,
 * + um resumo de compras/vendas na janela recente. Vêm da FMP
 * (lib/fmp/calendario.ts); degrada para lista vazia se a FMP falhar.
 */
const WINDOW_DAYS = 90;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  // Validar antes de chamar a FMP: um ticker inventado seria um pedido novo.
  const ticker = normalizarTicker((await params).ticker);
  if (!ticker) return NextResponse.json({ error: "Ticker inválido" }, { status: 400 });

  // Vive no separador que a página protege com `canViewProTabs` (só PRO).
  const acesso = await exigirPro();
  if (!acesso.ok) return acesso.resposta;

  try {
    const transactions = await insiders(ticker);

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

    return NextResponse.json(
      { transactions, summary },
      { headers: { "Cache-Control": CACHE_PRIVADO } },
    );
  } catch (error) {
    console.error("Error fetching insider transactions:", error);
    return NextResponse.json({ transactions: [], summary: null, unavailable: true });
  }
}
