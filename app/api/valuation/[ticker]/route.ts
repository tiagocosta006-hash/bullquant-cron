import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    
    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() }
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const allPrices = await prisma.price.findMany({
      where: { ticker: ticker.toUpperCase() },
      orderBy: { date: 'asc' }
    })

    if (allPrices.length === 0) {
      return NextResponse.json({ error: "No prices found" }, { status: 404 })
    }

    const allFundamentals = await prisma.fundamental.findMany({
      where: { companyId: company.id },
      orderBy: { periodEnd: 'asc' }
    })

    const fundamentalsWithDate = allFundamentals.map(f => ({
      ...f,
      availableAt: f.filedAt ? f.filedAt.getTime() : f.periodEnd.getTime()
    })).sort((a, b) => a.availableAt - b.availableAt)

    const quarters = fundamentalsWithDate.filter(f => f.periodType === 'QUARTERLY')
    const annuals = fundamentalsWithDate.filter(f => f.periodType === 'ANNUAL')

    const weeklyPrices = allPrices

    function getTtm(latest4: typeof quarters) {
      let ttmEps = 0;
      let ttmRev = 0;
      let ttmFcf: number | null = 0;
      
      let hasAllEps = true;
      let hasAllRev = true;
      let hasAllFcf = true;

      let totalCapex = 0;
      let capexCount = 0;
      for (const q of latest4) {
        const c = q.capex?.toNumber();
        if (c !== undefined && c !== null) {
          totalCapex += c;
          capexCount++;
        }
      }
      const avgCapex = capexCount > 0 ? totalCapex / capexCount : 0;

      for (const q of latest4) {
        const eps = q.epsDiluted?.toNumber();
        if (eps !== undefined && eps !== null) ttmEps += eps; else hasAllEps = false;

        const rev = q.revenue?.toNumber();
        if (rev !== undefined && rev !== null) ttmRev += rev; else hasAllRev = false;

        let fcf = q.freeCashFlow?.toNumber();
        if (fcf === undefined || fcf === null) {
          const ocf = q.operatingCashFlow?.toNumber();
          if (ocf !== undefined && ocf !== null) {
            fcf = ocf - Math.abs(avgCapex);
          }
        }
        if (fcf !== undefined && fcf !== null) ttmFcf += fcf; else hasAllFcf = false;
      }
      return {
        ttmEps: hasAllEps ? ttmEps : null,
        ttmRev: hasAllRev ? ttmRev : null,
        ttmFcf: hasAllFcf ? ttmFcf : null
      }
    }

    const results = []

    for (const p of weeklyPrices) {
      const priceTime = p.date.getTime()
      const priceVal = p.close.toNumber()
      
      let ttmEps: number | null = null
      let ttmRev: number | null = null
      let ttmFcf: number | null = null
      let shares: number | null = null
      let foundTtm = false;

      const validQ = quarters.filter(f => f.availableAt <= priceTime)
      if (validQ.length > 0) {
        const qMap = new Map()
        for (const q of validQ) {
          qMap.set(`${q.fiscalYear}-${q.fiscalQuarter}`, q)
        }
        const latest4 = Array.from(qMap.values())
          .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())
          .slice(0, 4)
        
        if (latest4.length === 4) {
          const daysDiff = (latest4[0].periodEnd.getTime() - latest4[3].periodEnd.getTime()) / (1000 * 3600 * 24);
          if (daysDiff > 200 && daysDiff < 400) {
            const ttm = getTtm(latest4)
            if (ttm.ttmEps !== null || ttm.ttmRev !== null) {
              ttmEps = ttm.ttmEps
              ttmRev = ttm.ttmRev
              ttmFcf = ttm.ttmFcf
              shares = latest4[0].sharesOutstanding?.toNumber() || null
              foundTtm = true
            }
          }
        }
      }

      if (!foundTtm) {
        const validA = annuals.filter(f => f.availableAt <= priceTime)
        if (validA.length > 0) {
          const latest = validA[validA.length - 1]
          ttmEps = latest.epsDiluted ? latest.epsDiluted.toNumber() : null
          ttmRev = latest.revenue ? latest.revenue.toNumber() : null
          
          let fcf = latest.freeCashFlow?.toNumber();
          if (fcf === undefined || fcf === null) {
            const ocf = latest.operatingCashFlow?.toNumber();
            const capex = latest.capex?.toNumber();
            if (ocf !== undefined && ocf !== null) {
              fcf = ocf - Math.abs(capex || 0);
            }
          }
          ttmFcf = fcf !== undefined ? fcf : null
          shares = latest.sharesOutstanding ? latest.sharesOutstanding.toNumber() : null
        }
      }

      const obj: any = {
        date: p.date.toISOString().split('T')[0],
        price: priceVal
      }

      if (ttmEps !== null && ttmEps > 0) {
        obj.pe = priceVal / ttmEps
      }
      if (shares !== null && shares > 0) {
        const marketCap = priceVal * shares
        if (ttmRev !== null && ttmRev > 0) {
          obj.ps = marketCap / ttmRev
        }
        if (ttmFcf !== null) {
          obj.fcfYield = ttmFcf / marketCap
        }
      }

      if (obj.pe !== undefined || obj.ps !== undefined || obj.fcfYield !== undefined) {
        results.push(obj)
      }
    }

    // Rota pesada (histórico completo + série de múltiplos) — a CDN absorve os hits
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    })
  } catch (error) {
    console.error("Error fetching valuation:", error)
    return NextResponse.json(
      { error: "Failed to fetch valuation metrics" },
      { status: 500 }
    )
  }
}
