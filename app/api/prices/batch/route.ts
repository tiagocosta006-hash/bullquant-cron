import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface PriceResult {
  ticker: string
  currentPrice?: number
  change?: number
  changePercent?: number
  high?: number
  low?: number
  open?: number
  previousClose?: number
  error?: string
}

const CHUNK_SIZE = 5;
const CHUNK_DELAY_MS = 250;

async function fetchWithDelay(tickers: string[], apiKey: string): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  
  for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
    const chunk = tickers.slice(i, i + CHUNK_SIZE);
    
    const fetchPromises = chunk.map(async (ticker) => {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`,
        { next: { revalidate: 60 } }
      )
      
      if (!response.ok) {
        return { ticker, error: 'Failed to fetch' }
      }
      
      const data = await response.json()
      
      if (data.c === 0 && data.d === null) {
        return { ticker, error: 'Not found' }
      }

      return {
        ticker,
        currentPrice: data.c,
        change: data.d,
        changePercent: data.dp,
        high: data.h,
        low: data.l,
        open: data.o,
        previousClose: data.pc
      }
    })

    const settledResults = await Promise.allSettled(fetchPromises);
    
    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // We log the error but don't fail the whole batch
        console.error('Promise rejected for a ticker in batch:', result.reason);
      }
    }

    // Add delay between chunks if not the last chunk
    if (i + CHUNK_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }

  return results;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const tickersParam = searchParams.get('tickers')

    if (!tickersParam) {
      return NextResponse.json({ error: 'Tickers parameter is required' }, { status: 400 })
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    
    if (tickers.length === 0) {
      return NextResponse.json({ error: 'Valid tickers are required' }, { status: 400 })
    }

    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Finnhub API key not configured' }, { status: 500 })
    }

    const results = await fetchWithDelay(tickers, apiKey);
    
    const pricesRecord = results.reduce((acc, curr) => {
      acc[curr.ticker] = curr
      return acc
    }, {} as Record<string, PriceResult>)

    return NextResponse.json(pricesRecord, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
      }
    })
  } catch (error) {
    console.error(`Error fetching batch prices:`, error)
    return NextResponse.json(
      { error: 'Internal server error while fetching batch prices' },
      { status: 500 }
    )
  }
}
