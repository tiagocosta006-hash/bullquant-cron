import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { exigirPro, CACHE_PRIVADO } from '@/lib/api/acessoPro'
import { empresasPorTicker, calendarioResultados } from '@/lib/fmp/calendario'

/**
 * GET /api/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD[&watchlist=1]
 * Serve os eventos de resultados no intervalo (default: mês atual).
 * Com watchlist=1 restringe ao portfólio do utilizador autenticado.
 */
export async function GET(request: NextRequest) {
  // Sem consumidores na aplicação — o calendário passou a usar /api/calendar
  // — mas continuava a servir 10 KB do calendário de resultados a quem
  // passasse por aqui, em cache partilhada do CDN. Fica com o mesmo guarda do
  // /api/calendar em vez de se apagar: se algo externo ainda lhe bater, um
  // 401 diz-nos isso, um 404 seria só silêncio.
  const acesso = await exigirPro()
  if (!acesso.ok) return acesso.resposta

  const { searchParams } = request.nextUrl
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const watchlistOnly = searchParams.get('watchlist') === '1'

  const now = new Date()
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
  const to = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth() + 1, 0)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }
  if (to.getTime() - from.getTime() > 100 * 86_400_000 || to < from) {
    return NextResponse.json({ error: 'Date range too large' }, { status: 400 })
  }

  try {
    let companyIds: string[] | undefined
    if (watchlistOnly) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const portfolio = await prisma.portfolio.findUnique({
        where: { userId: user.id },
        include: { items: { select: { companyId: true } } },
      })
      companyIds = portfolio?.items.map(i => i.companyId) ?? []
    }

    const empresas = await empresasPorTicker()
    const porId = new Map(Object.values(empresas).map(e => [e.id, e.ticker]))
    const tickers = new Set(
      companyIds ? companyIds.map(id => porId.get(id)).filter((t): t is string => !!t) : Object.keys(empresas)
    )
    const eventos = await calendarioResultados(from, to, tickers)

    const data = eventos.map(e => {
      const fecho = new Date(new Date(e.date + 'T00:00:00Z').getTime() - 45 * 86_400_000)
      return {
        id: `e|${e.ticker}|${e.date}`,
        date: e.date,
        hour: 'UNKNOWN',
        fiscalYear: fecho.getUTCFullYear(),
        fiscalQuarter: Math.floor(fecho.getUTCMonth() / 3) + 1,
        epsEstimate: e.epsEstimate,
        epsActual: e.epsActual,
        revenueEstimate: e.revenueEstimate,
        revenueActual: e.revenueActual,
        ticker: e.ticker,
        name: empresas[e.ticker]?.name ?? e.ticker,
        logoUrl: empresas[e.ticker]?.logoUrl ?? null,
        employees: empresas[e.ticker]?.employees ?? null,
      }
    })

    // O calendário geral é público e igual para todos; o ramo watchlist é
    // por-utilizador e NUNCA pode ir para a cache partilhada da CDN.
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': watchlistOnly ? 'private, no-store' : CACHE_PRIVADO,
      },
    })
  } catch (error) {
    console.error('Error fetching earnings:', error)
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 })
  }
}
