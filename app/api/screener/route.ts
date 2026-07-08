import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import type { Prisma } from '@prisma/client'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { sector, minGrossMargin, minRoic, minRevenue, minEarningsYield } = body

    const companyFilter: Prisma.CompanyWhereInput = { isActive: true }
    if (sector && sector !== 'ALL') {
      companyFilter.sector = sector
    }

    const whereClause: Prisma.FundamentalWhereInput = {
      periodType: 'ANNUAL',
      company: companyFilter,
    }

    if (minGrossMargin) {
      whereClause.grossMargin = { gte: minGrossMargin }
    }

    if (minRoic) {
      whereClause.roic = { gte: minRoic }
    }

    if (minRevenue) {
      whereClause.revenue = { gte: minRevenue }
    }

    const results = await prisma.fundamental.findMany({
      where: whereClause,
      distinct: ['companyId'],
      orderBy: [
        { companyId: 'asc' },
        { periodEnd: 'desc' },
      ],
      include: {
        company: {
          include: {
            prices: {
              orderBy: { date: 'desc' },
              take: 1,
            },
          },
        },
      },
      take: 500,
    })

    let companies = results.map(fund => {
      let earningsYield = null

      const latestPrice = fund.company.prices?.[0]?.close
      if (latestPrice && fund.sharesOutstanding) {
        const marketCap = Number(latestPrice) * Number(fund.sharesOutstanding)
        const debt = Number(fund.totalDebt || 0)
        const cash = Number(fund.cash || 0)
        const ev = marketCap + debt - cash
        const ebit = Number(fund.operatingIncome || 0)
        if (ev > 0 && ebit !== 0) {
          earningsYield = ebit / ev
        }
      }

      return {
        id: fund.company.id,
        ticker: fund.company.ticker,
        name: fund.company.name,
        logoUrl: fund.company.logoUrl,
        sector: fund.company.sector,
        revenue: fund.revenue ? Number(fund.revenue) : null,
        grossMargin: fund.grossMargin ? Number(fund.grossMargin) : null,
        roic: fund.roic ? Number(fund.roic) : null,
        dividendPerShare: fund.dividendPerShare ? Number(fund.dividendPerShare) : null,
        earningsYield,
      }
    })

    if (minEarningsYield && minEarningsYield > 0) {
      companies = companies.filter(c => c.earningsYield !== null && c.earningsYield >= minEarningsYield)
    }

    companies.sort((a, b) => (b.revenue || 0) - (a.revenue || 0))

    return NextResponse.json(companies)
  } catch (error) {
    console.error('Failed to fetch screener results:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
