import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD[&watchlist=1]
 * Serve os eventos de resultados no intervalo (default: mês atual).
 * Com watchlist=1 restringe ao portfólio do utilizador autenticado.
 */
export async function GET(request: NextRequest) {
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

    const events = await prisma.earningsEvent.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(companyIds ? { companyId: { in: companyIds } } : {}),
      },
      orderBy: [{ date: 'asc' }, { company: { ticker: 'asc' } }],
      include: {
        company: { select: { ticker: true, name: true, logoUrl: true, employees: true } },
      },
    })

    // Serializar Decimals → number
    const data = events.map(e => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      hour: e.hour,
      fiscalYear: e.fiscalYear,
      fiscalQuarter: e.fiscalQuarter,
      epsEstimate: e.epsEstimate !== null ? Number(e.epsEstimate) : null,
      epsActual: e.epsActual !== null ? Number(e.epsActual) : null,
      revenueEstimate: e.revenueEstimate !== null ? Number(e.revenueEstimate) : null,
      revenueActual: e.revenueActual !== null ? Number(e.revenueActual) : null,
      ticker: e.company.ticker,
      name: e.company.name,
      logoUrl: e.company.logoUrl,
      employees: e.company.employees
    }))

    // O calendário geral é público e igual para todos; o ramo watchlist é
    // por-utilizador e NUNCA pode ir para a cache partilhada da CDN.
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': watchlistOnly
          ? 'private, no-store'
          : 'public, s-maxage=1800, stale-while-revalidate=86400',
      },
    })
  } catch (error) {
    console.error('Error fetching earnings:', error)
    return NextResponse.json({ error: 'Failed to fetch earnings' }, { status: 500 })
  }
}
