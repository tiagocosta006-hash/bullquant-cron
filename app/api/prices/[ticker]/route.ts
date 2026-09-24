import { NextResponse } from "next/server"
import { normalizarTicker } from "@/lib/ticker"
import { historico, amostrar } from "@/lib/fmp/mercado"

/**
 * Histórico de preços para o gráfico da página da ação.
 *
 * Vem da FMP, não da tabela `prices` — ver `lib/fmp/mercado.ts`. A forma da
 * resposta é a mesma de sempre ({ date: ISO, close }[]), para o frontend não
 * ter de mudar.
 */

/** Pontos por período, em dias de bolsa. O 'max' são os 10 anos, amostrados. */
const PONTOS: Record<string, number> = { "1m": 22, "6m": 130, "1y": 252, "5y": 1260 }

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const ticker = normalizarTicker((await params).ticker)
    if (!ticker) {
      return NextResponse.json({ error: "Ticker inválido" }, { status: 400 })
    }
    const period = new URL(request.url).searchParams.get("period") ?? "5y"

    const serie = await historico(ticker)
    if (serie.length === 0) {
      return NextResponse.json({ error: "No price history found" }, { status: 404 })
    }

    const recorte = period === "max"
      ? amostrar(serie, 800)
      : serie.slice(-(PONTOS[period] ?? 1260))

    const pontos = recorte.map((p) => ({
      date: new Date(p.date + "T00:00:00Z").toISOString(),
      close: p.close,
    }))

    // EOD: muda uma vez por dia — o CDN serve os hits sem invocar a função.
    return NextResponse.json(pontos, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  } catch (error) {
    console.error("Error fetching price history:", error)
    return NextResponse.json({ error: "Failed to fetch price history" }, { status: 500 })
  }
}
