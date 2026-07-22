import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import type { Prisma } from "@prisma/client"

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

    // Devolve a lista de empresas filtradas — composto com AND (nunca
    // atribuir a whereClause.OR diretamente: sector/industry "Unknown" e a
    // pesquisa `q` usam OR cada um por si, e sobrescreviam-se um ao outro se
    // coexistissem). `industry` também trata "Unknown" como sector já
    // tratava (null OU literal "Unknown") — sem isto, a facet contava
    // `industry: null` como "Unknown" mas o filtro da lista exigia
    // igualdade literal, dando chip com contagem > 0 e lista vazia.
    const and: Prisma.CompanyWhereInput[] = []
    if (sector) {
      and.push(
        sector === "Unknown"
          ? { OR: [{ sector: null }, { sector: "Unknown" }] }
          : { sector }
      )
    }
    if (industry) {
      and.push(
        industry === "Unknown"
          ? { OR: [{ industry: null }, { industry: "Unknown" }] }
          : { industry }
      )
    }
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { ticker: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } }
        ]
      })
    }
    const whereClause: Prisma.CompanyWhereInput = { isActive: true, ...(and.length > 0 ? { AND: and } : {}) }

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
