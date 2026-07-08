import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') ?? '5y'

    // Cap rows by period to avoid sending thousands of records
    const periodMap: Record<string, number> = {
      '1m':  22,
      '6m':  130,
      '1y':  252,
      '5y':  1260,
      'max': 99999,
    }
    const take = periodMap[period] ?? 1260
    
    // Fetch historical prices for the ticker, ordered by date descending to get the latest
    const prices = await prisma.price.findMany({
      where: {
        ticker: ticker.toUpperCase(),
      },
      orderBy: {
        date: 'desc',
      },
      take,
      select: {
        date: true,
        close: true,
      }
    })
    
    // Reverse to chronological order (asc) for the chart
    prices.reverse()

    if (!prices || prices.length === 0) {
      return NextResponse.json({ error: "No price history found" }, { status: 404 })
    }

    // Convert decimal to number for frontend charting and format dates
    const formattedPrices = prices.map(p => ({
      date: p.date.toISOString(),
      close: Number(p.close),
    }))

    return NextResponse.json(formattedPrices)
  } catch (error) {
    console.error("Error fetching price history:", error)
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    )
  }
}
