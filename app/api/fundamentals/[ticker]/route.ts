import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Sem isto, o Next.js cacheia o resultado deste GET internamente por rota
// resolvida (por ticker) até ao próximo deploy — tickers visitados antes de
// uma atualização de dados (ex: backfill de revenueSegments) ficavam presos
// na resposta antiga indefinidamente. O Cache-Control abaixo continua a
// controlar a frescura ao nível do CDN/browser; isto garante que a função
// em si executa sempre a query.
export const dynamic = 'force-dynamic'

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

    // Mais recentes primeiro para o take, revertido para asc no fim (o que os
    // gráficos esperam). 60 períodos cobre 10 anos de trimestres + anuais.
    const fundamentals = await prisma.fundamental.findMany({
      where: {
        companyId: company.id,
      },
      orderBy: {
        periodEnd: 'desc',
      },
      take: 60,
    })
    fundamentals.reverse()

    if (fundamentals.length === 0) {
      return NextResponse.json({ error: "No fundamentals found" }, { status: 404 })
    }

    const serialized = fundamentals.map(f => {
      const obj: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(f)) {
        if (val !== null && typeof val === 'object' && 'toNumber' in val) {
          obj[key] = (val as { toNumber(): number }).toNumber()
        } else {
          obj[key] = val
        }
      }
      return obj
    })

    return NextResponse.json(serialized, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (error) {
    console.error("Error fetching fundamentals:", error)
    return NextResponse.json(
      { error: "Failed to fetch fundamentals" },
      { status: 500 }
    )
  }
}
