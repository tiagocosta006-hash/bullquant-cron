import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizarTicker } from '@/lib/ticker'
import { cotacoes } from '@/lib/fmp/mercado'

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

    // Validar CADA ticker e limitar quantos: cada combinação diferente de
    // símbolos é uma chave de cache nova e, com ela, um pedido novo à FMP.
    //
    // 100 é folgado para o que a aplicação pede de facto (o dashboard pede 24,
    // a watchlist e o portefólio raramente passam de algumas dezenas).
    const MAX_TICKERS = 100
    const pedidos = tickersParam.split(',').map(t => normalizarTicker(t)).filter(Boolean) as string[]
    const tickers = pedidos.slice(0, MAX_TICKERS)

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'Valid tickers are required' }, { status: 400 })
    }

    // Uma só chamada à FMP (`batch-quote`) para todos, com cache de 5 min na
    // Data Cache do Next — ver lib/fmp/mercado.ts. Antes eram chamadas uma a
    // uma à Finnhub, em blocos de 5 com pausas.
    const quotes = await cotacoes(tickers)
    const pricesRecord: Record<string, PriceResult> = {}
    for (const t of tickers) {
      const q = quotes.get(t)
      pricesRecord[t] = q
        ? {
            ticker: t,
            currentPrice: q.price,
            change: q.change ?? undefined,
            changePercent: q.changePercentage ?? undefined,
            high: q.dayHigh ?? undefined,
            low: q.dayLow ?? undefined,
            open: q.open ?? undefined,
            previousClose: q.previousClose ?? undefined,
          }
        : { ticker: t, error: 'Not found' }
    }

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
