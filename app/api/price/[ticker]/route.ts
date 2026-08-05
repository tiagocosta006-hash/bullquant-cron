import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function getDbPriceFallback(ticker: string) {
  try {
    const prices = await prisma.price.findMany({
      where: { ticker },
      orderBy: { date: 'desc' },
      take: 2,
    })
    if (!prices || prices.length === 0) return null
    const last = Number(prices[0].close)
    const prev = prices.length > 1 ? Number(prices[1].close) : last
    const change = Number((last - prev).toFixed(4))
    const changePercent = prev !== 0 ? Number((((last - prev) / prev) * 100).toFixed(2)) : 0
    return {
      ticker,
      currentPrice: last,
      change,
      changePercent,
      high: prices[0].high ? Number(prices[0].high) : last,
      low: prices[0].low ? Number(prices[0].low) : last,
      open: prices[0].open ? Number(prices[0].open) : last,
      previousClose: prev,
      isFallback: true,
    }
  } catch (err) {
    console.error(`Database price fallback failed for ${ticker}:`, err)
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const resolvedParams = await params
  const ticker = resolvedParams.ticker.toUpperCase()

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    const fallback = await getDbPriceFallback(ticker)
    if (fallback) {
      return NextResponse.json(fallback, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      })
    }
    return NextResponse.json(
      { error: 'Finnhub API key not configured and no price in database' },
      { status: 404 }
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
      const fallback = await getDbPriceFallback(ticker)
      if (fallback) {
        return NextResponse.json(fallback, {
          headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
        })
      }
      return NextResponse.json(
        { error: 'Failed to fetch price from Finnhub' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // O Finnhub retorna c=0 se o ticker não for encontrado ou não suportado
    if (data.c === 0 && data.d === null) {
      const fallback = await getDbPriceFallback(ticker)
      if (fallback) {
        return NextResponse.json(fallback, {
          headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
        })
      }
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
    const fallback = await getDbPriceFallback(ticker)
    if (fallback) {
      return NextResponse.json(fallback, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      })
    }
    return NextResponse.json(
      { error: 'Internal server error while fetching price' },
      { status: 500 }
    )
  }
}

