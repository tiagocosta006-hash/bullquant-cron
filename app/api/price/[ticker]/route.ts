import { NextRequest, NextResponse } from "next/server"
import { normalizarTicker } from "@/lib/ticker"
import { cotacao } from "@/lib/fmp/mercado"

/**
 * Cotação atual de uma ação.
 *
 * Vinha da Finnhub com a tabela `prices` como reserva. Passa a vir só da FMP —
 * ver `lib/fmp/mercado.ts`. A forma da resposta é a mesma, para o frontend não
 * mudar.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  // Validar antes de chamar a API: um ticker inventado seria uma chave de cache
  // nova e, com ela, um pedido novo. Ver lib/ticker.ts.
  const ticker = normalizarTicker((await params).ticker)
  if (!ticker) {
    return NextResponse.json({ error: "Ticker inválido" }, { status: 400 })
  }

  try {
    const q = await cotacao(ticker)
    if (!q) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 })
    }
    return NextResponse.json(
      {
        ticker,
        currentPrice: q.price,
        change: q.change,
        changePercent: q.changePercentage,
        high: q.dayHigh ?? q.price,
        low: q.dayLow ?? q.price,
        open: q.open ?? q.price,
        previousClose: q.previousClose,
      },
      // Absorve na CDN os pedidos repetidos do mesmo quote (header, snapshot, gráfico).
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    )
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error)
    return NextResponse.json({ error: "Internal server error while fetching price" }, { status: 500 })
  }
}
