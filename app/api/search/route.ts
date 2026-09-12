import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

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
        OR: [
          { ticker: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
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

    return NextResponse.json(companies, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    })
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
