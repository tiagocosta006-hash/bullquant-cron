import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const resolvedParams = await params
  const ticker = resolvedParams.ticker.toUpperCase()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Finnhub API key not configured' },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`,
      {
        next: { revalidate: 60 } // Cache opcional no servidor (60 segundos)
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch price from Finnhub' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // O Finnhub retorna c=0 se o ticker não for encontrado ou não suportado
    if (data.c === 0 && data.d === null) {
      return NextResponse.json(
        { error: 'Ticker not found on Finnhub' },
        { status: 404 }
      )
    }

    // Mapear o formato do Finnhub para algo mais legível pelo nosso frontend
    const priceData = {
      ticker,
      currentPrice: data.c, // Preço atual
      change: data.d,       // Variação diária em $
      changePercent: data.dp, // Variação diária em %
      high: data.h,         // Máximo do dia
      low: data.l,          // Mínimo do dia
      open: data.o,         // Abertura
      previousClose: data.pc // Fecho anterior
    }

    // Absorve os fetches duplicados do mesmo quote (header/snapshot/chart) na CDN
    return NextResponse.json(priceData, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error)
    return NextResponse.json(
      { error: 'Internal server error while fetching price' },
      { status: 500 }
    )
  }
}
