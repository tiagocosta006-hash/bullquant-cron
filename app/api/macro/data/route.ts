import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickersParam = searchParams.get("tickers")
  const startDateParam = searchParams.get("startDate") // YYYY-MM-DD

  if (!tickersParam) {
    return NextResponse.json({ error: "Missing tickers parameter" }, { status: 400 })
  }

  const tickers = tickersParam.split(",")
  const whereClause: any = { ticker: { in: tickers } }

  if (startDateParam) {
    const startDate = new Date(startDateParam)
    if (!isNaN(startDate.getTime())) {
      whereClause.date = { gte: startDate }
    }
  }

  try {
    const prices = await prisma.price.findMany({
      where: whereClause,
      select: {
        ticker: true,
        date: true,
        close: true,
      },
      orderBy: { date: "asc" },
    })

    // Group by ticker for easier consumption on frontend
    const grouped = prices.reduce((acc, curr) => {
      if (!acc[curr.ticker]) {
        acc[curr.ticker] = []
      }
      acc[curr.ticker].push({
        date: curr.date.toISOString().split("T")[0],
        value: Number(curr.close),
      })
      return acc
    }, {} as Record<string, { date: string; value: number }[]>)

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
