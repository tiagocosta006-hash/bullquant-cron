import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { exigirPro, CACHE_PRIVADO } from '@/lib/api/acessoPro'
import { empresasPorTicker, calendarioResultados, calendarioCorporativo, calendarioMacro } from '@/lib/fmp/calendario'

type Kind = 'earnings' | 'corporate' | 'macro'
const ALL_KINDS: Kind[] = ['earnings', 'corporate', 'macro']

type Scope = 'all' | 'watchlist' | 'portfolio'

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&scope=all|watchlist|portfolio][&types=earnings,corporate,macro]
 * Calendário unificado: earnings + eventos corporativos (dividendos/splits) +
 * eventos macro (FOMC/CPI/...). Cada item tem um discriminador `kind`.
 * `scope=watchlist` restringe earnings/corporate à watchlist do utilizador
 * (WatchlistItem — a mesma lista usada em /api/watchlist e /watchlist).
 * `scope=portfolio` restringe às empresas realmente no portefólio
 * (Portfolio/PortfolioItem — a mesma lista usada em /api/portfolio e /portfolio).
 * Macro nunca depende de scope (é market-wide).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const scopeParam = searchParams.get('scope')
  const scope: Scope = scopeParam === 'watchlist' || scopeParam === 'portfolio' ? scopeParam : 'all'
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
  // Cada semana do intervalo são pedidos à FMP. A página pede um mês (com as
  // pontas da grelha, ~6 semanas); mais de ~3 meses não tem uso legítimo.
  if (to.getTime() - from.getTime() > 100 * 86_400_000 || to < from) {
    return NextResponse.json({ error: 'Date range too large' }, { status: 400 })
  }

  // A página /calendar é PRO (ProGate por cima), mas o ramo `scope=all` não
  // pedia nada a ninguém — e servia 12 KB do calendário de resultados em
  // `public, s-maxage=1800`, ou seja também na cache partilhada do CDN.
  const acesso = await exigirPro()
  if (!acesso.ok) return acesso.resposta

  try {
    let companyIds: string[] | undefined
    if (scope === 'watchlist') {
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
    } else if (scope === 'portfolio') {
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

    // Os eventos vêm da FMP (lib/fmp/calendario.ts); a base só diz que
    // empresas existem e, nos ramos watchlist/portfolio, quais são do user.
    const empresas = await empresasPorTicker()
    const porId = new Map(Object.values(empresas).map(e => [e.id, e.ticker]))
    const tickers = new Set(
      companyIds ? companyIds.map(id => porId.get(id)).filter((t): t is string => !!t) : Object.keys(empresas)
    )
    const meta = (ticker: string) => {
      const e = empresas[ticker]
      return { ticker, name: e?.name ?? ticker, logoUrl: e?.logoUrl ?? null, employees: e?.employees ?? null }
    }

    const [earnings, corporate, macro] = await Promise.all([
      kinds.has('earnings') ? calendarioResultados(from, to, tickers) : [],
      kinds.has('corporate') ? calendarioCorporativo(from, to, tickers) : [],
      // Macro é market-wide: nunca filtra por watchlist.
      kinds.has('macro') ? calendarioMacro(from, to) : [],
    ])

    const data = [
      ...earnings.map(e => {
        // A FMP não diz o trimestre fiscal: aproxima-se pelo trimestre de
        // calendário que acabou antes do anúncio (os resultados saem 3-8
        // semanas depois do fecho).
        const fecho = new Date(new Date(e.date + 'T00:00:00Z').getTime() - 45 * 86_400_000)
        return {
          kind: 'earnings' as const,
          id: `e|${e.ticker}|${e.date}`,
          date: e.date,
          hour: 'UNKNOWN' as const,
          fiscalYear: fecho.getUTCFullYear(),
          fiscalQuarter: Math.floor(fecho.getUTCMonth() / 3) + 1,
          epsEstimate: e.epsEstimate,
          epsActual: e.epsActual,
          revenueEstimate: e.revenueEstimate,
          revenueActual: e.revenueActual,
          ...meta(e.ticker),
        }
      }),
      ...corporate.map(c => ({
        kind: 'corporate' as const,
        id: `c|${c.ticker}|${c.type}|${c.date}`,
        type: c.type,
        date: c.date,
        payDate: c.payDate,
        amount: c.amount,
        splitRatio: c.splitRatio,
        note: null,
        ...meta(c.ticker),
      })),
      ...macro.map(m => ({ kind: 'macro' as const, ...m })),
    ].sort((a, b) => a.date.localeCompare(b.date))

    // O calendário geral é público e igual para todos; os ramos watchlist/portfolio
    // são por-utilizador e NUNCA podem ir para a cache partilhada da CDN.
    return NextResponse.json(data, {
      headers: {
        // Nunca `public`: a resposta passou a depender de quem pergunta, e
        // uma cópia na cache do CDN serviria conteúdo pago a quem não paga.
        'Cache-Control': scope === 'all' ? CACHE_PRIVADO : 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Error fetching calendar:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}
