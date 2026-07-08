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

    return NextResponse.json(companies)
  } catch (error) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 })
  }
}
