import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizarTicker } from '@/lib/ticker'

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

// Cache em memória por ticker, com o mesmo TTL do Cache-Control da resposta.
//
// O `next: { revalidate: 60 }` já evitava a ida à Finnhub, mas NÃO evitava o
// ciclo: a pausa de 250ms entre chunks corria à mesma, porque é incondicional.
// Resultado: o dashboard pede 24 tickers, tudo vem de cache, e mesmo assim
// esperava-se 1 segundo em pausas — medido em 1049ms no browser. Filtrando os
// tickers frescos ANTES de entrar no ciclo, um pedido inteiramente em cache
// não paga pausa nenhuma.
const PRICE_TTL_MS = 60_000;
const priceCache = new Map<string, { at: number; value: PriceResult }>();

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

    // Validar CADA ticker e limitar quantos: esta rota faz uma chamada à
    // Finnhub por ticker pedido, e não tinha nem uma coisa nem outra. Um
    // pedido com dez mil símbolos inventados eram dez mil chamadas — e cada
    // símbolo diferente é também uma chave de cache nova, portanto o
    // `revalidate: 60` não travava nada. O plano gratuito da Finnhub são 60
    // chamadas por minuto: bastava um pedido para os preços ao vivo pararem
    // para toda a gente.
    //
    // 100 é folgado para o que a aplicação pede de facto (o dashboard pede 24,
    // a watchlist e o portefólio raramente passam de algumas dezenas).
    const MAX_TICKERS = 100
    const pedidos = tickersParam.split(',').map(t => normalizarTicker(t)).filter(Boolean) as string[]
    const tickers = pedidos.slice(0, MAX_TICKERS)

    if (tickers.length === 0) {
      return NextResponse.json({ error: 'Valid tickers are required' }, { status: 400 })
    }

    const apiKey = process.env.FINNHUB_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Finnhub API key not configured' }, { status: 500 })
    }

    // Só vão ao ciclo (e às pausas) os tickers cujo preço já expirou.
    const agora = Date.now()
    const emCache: PriceResult[] = []
    const porBuscar: string[] = []
    for (const t of tickers) {
      const hit = priceCache.get(t)
      if (hit && agora - hit.at < PRICE_TTL_MS) emCache.push(hit.value)
      else porBuscar.push(t)
    }

    const buscados = porBuscar.length > 0 ? await fetchWithDelay(porBuscar, apiKey) : []
    for (const r of buscados) {
      // Um erro não entra em cache: à próxima tenta outra vez.
      if (!r.error) priceCache.set(r.ticker, { at: agora, value: r })
    }

    const pricesRecord = [...emCache, ...buscados].reduce((acc, curr) => {
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
