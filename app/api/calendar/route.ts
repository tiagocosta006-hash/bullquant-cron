import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

type Kind = 'earnings' | 'corporate' | 'macro'
const ALL_KINDS: Kind[] = ['earnings', 'corporate', 'macro']

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&watchlist=1][&types=earnings,corporate,macro]
 * Calendário unificado: earnings + eventos corporativos (dividendos/splits) +
 * eventos macro (FOMC/CPI/...). Cada item tem um discriminador `kind`.
 * `watchlist=1` restringe earnings/corporate à watchlist do utilizador
 * (WatchlistItem — a mesma lista usada em /api/watchlist e /watchlist).
 * Macro nunca depende de watchlist (é market-wide).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const watchlistOnly = searchParams.get('watchlist') === '1'
  const typesParam = searchParams.get('types')
  const kinds = new Set<Kind>(
    typesParam
      ? (typesParam.split(',').filter((k): k is Kind => ALL_KINDS.includes(k as Kind)))
      : ALL_KINDS
  )

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
      const items = await prisma.watchlistItem.findMany({
        where: { userId: user.id },
        select: { companyId: true },
      })
      companyIds = items.map(i => i.companyId)
    }

    const companyFilter = companyIds ? { companyId: { in: companyIds } } : {}

    const [earnings, corporate, macro] = await Promise.all([
      kinds.has('earnings')
        ? prisma.earningsEvent.findMany({
            where: { date: { gte: from, lte: to }, ...companyFilter },
            orderBy: [{ date: 'asc' }, { company: { ticker: 'asc' } }],
            include: { company: { select: { ticker: true, name: true, logoUrl: true, employees: true } } },
          })
        : [],
      kinds.has('corporate')
        ? prisma.corporateEvent.findMany({
            where: { date: { gte: from, lte: to }, ...companyFilter },
            orderBy: [{ date: 'asc' }, { company: { ticker: 'asc' } }],
            include: { company: { select: { ticker: true, name: true, logoUrl: true, employees: true } } },
          })
        : [],
      // Macro é market-wide: nunca filtra por watchlist.
      kinds.has('macro')
        ? prisma.marketEvent.findMany({
            where: { date: { gte: from, lte: to } },
            orderBy: { date: 'asc' },
          })
        : [],
    ])

    const data = [
      ...earnings.map(e => ({
        kind: 'earnings' as const,
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
        employees: e.company.employees,
      })),
      ...corporate.map(c => ({
        kind: 'corporate' as const,
        id: c.id,
        type: c.type,
        date: c.date.toISOString().slice(0, 10),
        payDate: c.payDate ? c.payDate.toISOString().slice(0, 10) : null,
        amount: c.amount !== null ? Number(c.amount) : null,
        splitRatio: c.splitRatio,
        note: c.note,
        ticker: c.company.ticker,
        name: c.company.name,
        logoUrl: c.company.logoUrl,
        employees: c.company.employees,
      })),
      ...macro.map(m => ({
        kind: 'macro' as const,
        id: m.id,
        type: m.type,
        date: m.date.toISOString().slice(0, 10),
        time: m.time,
        title: m.title,
        importance: m.importance,
        country: m.country,
        actual: m.actual,
        estimate: m.estimate,
        previous: m.previous,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))

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
    console.error('Error fetching calendar:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}
