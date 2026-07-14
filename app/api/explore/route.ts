import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sector = searchParams.get("sector")
  const industry = searchParams.get("industry")
  const q = searchParams.get("q")
  const mode = searchParams.get("mode") // "facets" or "companies"

  try {
    if (mode === "facets") {
      // Devolve a contagem agrupada por setor e indústria
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { sector: true, industry: true }
      })

      const sectors: Record<string, { count: number; industries: Record<string, number> }> = {}

      for (const comp of companies) {
        const sec = comp.sector || "Unknown"
        const ind = comp.industry || "Unknown"

        if (!sectors[sec]) {
          sectors[sec] = { count: 0, industries: {} }
        }
        sectors[sec].count++

        if (!sectors[sec].industries[ind]) {
          sectors[sec].industries[ind] = 0
        }
        sectors[sec].industries[ind]++
      }

      // private: a rota é auth-gated — s-maxage na CDN deixaria não-autenticados
      // ler cópias cacheadas, contornando o 401. Cache só no browser.
      return NextResponse.json({ sectors }, {
        headers: { "Cache-Control": "private, max-age=120" },
      })
    }

    // Devolve a lista de empresas filtradas
    const whereClause: any = { isActive: true }
    if (sector) {
      if (sector === "Unknown") {
        whereClause.OR = [{ sector: null }, { sector: "Unknown" }]
      } else {
        whereClause.sector = sector
      }
    }
    if (industry) {
      whereClause.industry = industry
    }
    if (q) {
      whereClause.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { ticker: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } }
      ]
    }

    const companies = await prisma.company.findMany({
      where: whereClause,
      select: {
        id: true,
        ticker: true,
        name: true,
        logoUrl: true,
        sector: true,
        industry: true,
        description: true,
        geographicFocus: true,
        bullCase: true,
        bearCase: true,
        swot: true,
        extraInfo: true,
        ceo: true,
        fundamentals: {
          where: { periodType: 'ANNUAL' },
          orderBy: { periodEnd: 'desc' },
          take: 1,
          select: {
            revenue: true,
            netMargin: true,
            roic: true,
            periodEnd: true,
            revenueSegments: true
          }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Flatten os dados para o frontend (puxar as âncoras para a raiz do objeto)
    const formatted = companies.map(c => {
      const lastAnnual = c.fundamentals.length > 0 ? c.fundamentals[0] : null
      return {
        id: c.id,
        ticker: c.ticker,
        name: c.name,
        logoUrl: c.logoUrl,
        sector: c.sector || "Unknown",
        industry: c.industry || "Unknown",
        description: c.description,
        geographicFocus: c.geographicFocus,
        bullCase: c.bullCase,
        bearCase: c.bearCase,
        swot: c.swot,
        extraInfo: c.extraInfo,
        ceo: c.ceo,
        revenue: lastAnnual && lastAnnual.revenue ? Number(lastAnnual.revenue) : null,
        netMargin: lastAnnual && lastAnnual.netMargin ? Number(lastAnnual.netMargin) : null,
        roic: lastAnnual && lastAnnual.roic ? Number(lastAnnual.roic) : null,
        revenueSegments: lastAnnual ? lastAnnual.revenueSegments : null,
      }
    })

    return NextResponse.json({ companies: formatted }, {
      headers: { "Cache-Control": "private, max-age=120" },
    })
  } catch (error) {
    console.error("Explore API Error:", error)
    return NextResponse.json({ error: "Failed to fetch explore data" }, { status: 500 })
  }
}
