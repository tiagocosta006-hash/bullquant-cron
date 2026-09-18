import { NextResponse } from "next/server"
import { carregarSeriesReduzidas } from "@/lib/finance/seriesMacro"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get("tickers")
  const startDateParam = searchParams.get("startDate") // YYYY-MM-DD

  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers parameter" }, { status: 400 })
  }

  const tickers = tickersParam.split(",").map((t) => t.trim()).filter(Boolean)

  let desde: Date | undefined
  if (startDateParam) {
    const d = new Date(startDateParam)
    if (!isNaN(d.getTime())) desde = d
  }

  try {
    // A redução para ~800 pontos acontece no SQL, não aqui (ver
    // lib/finance/seriesMacro.ts). Antes trazia-se a série inteira da base e
    // reduzia-se em JavaScript — o browser ficava leve e o Postgres continuava
    // a mandar megabytes por chamada.
    const grouped = await carregarSeriesReduzidas(tickers, { desde })

    return NextResponse.json(grouped, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error("GET /api/macro/data error:", error)
    return NextResponse.json({ error: "Failed to fetch macro data" }, { status: 500 })
  }
}
