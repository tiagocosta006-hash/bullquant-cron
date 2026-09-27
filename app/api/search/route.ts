import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  // ?empresas=1: só empresas (sem ETFs, guardados com exchange MACRO) — para
  // o DCF, onde um ETF não tem demonstrações financeiras para modelar.
  const soEmpresas = searchParams.get('empresas') === '1'

  if (!query || query.length < 2) {
    return NextResponse.json([])
  }

  try {
    const companies = await prisma.company.findMany({
      where: {
        // Sem o isActive, uma empresa retirada continuava a aparecer no
        // autocomplete e levava a uma página sem dados — o screener e o
        // /explore já filtravam, só a pesquisa é que não.
        isActive: true,
        // Índices (^GSPC, ^IXIC, ^VIX) vivem em `companies` para alimentar
        // gráficos de contexto, mas não são empresas: procurar "Nasdaq"
        // devolvia o ^IXIC e o clique levava a uma página de ação com todos
        // os blocos de fundamentais a N/A. Com a aba Macro fora, não há
        // sequer destino onde um índice faça sentido.
        NOT: { ticker: { startsWith: '^' } },
        ...(soEmpresas ? { exchange: { not: 'MACRO' } } : {}),
        OR: [
          { ticker: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      // Pede-se mais do que se mostra e ordena-se por relevância: por ordem
      // alfabética, procurar "msci" devolvia cinco ETFs iShares MSCI e a
      // própria MSCI ficava de fora.
      take: 40,
      select: {
        ticker: true,
        name: true,
        exchange: true,
        logoUrl: true,
      },
      orderBy: {
        ticker: 'asc'
      }
    })

    const q = query.toUpperCase()
    const peso = (c: { ticker: string; name: string }) =>
      c.ticker === q ? 0 : c.ticker.startsWith(q) ? 1 : c.name.toUpperCase().startsWith(q) ? 2 : c.ticker.includes(q) ? 3 : 4
    const ordenadas = companies
      .sort((a, b) => peso(a) - peso(b) || a.ticker.localeCompare(b.ticker))
      .slice(0, 5)

    return NextResponse.json(ordenadas, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
