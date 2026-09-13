import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exigirPro, CACHE_PRIVADO } from "@/lib/api/acessoPro"

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

    // DOIS níveis, não três: o ticker da demo é aberto a toda a gente e o
    // resto exige PRO. Uma conta gratuita vê exactamente o que vê quem não
    // faz login — antes via os fundamentais completos das sete grandes, e
    // isso fazia do registo um atalho para conteúdo pago.
    //
    // Espelha o `isPro || eDemo` da página de ação. Sem guarda nenhum, este
    // endpoint devolvia 117 KB do histórico financeiro a quem não tinha conta.
    const acesso = await exigirPro({ ticker, demoAnonima: true })
    if (!acesso.ok) return acesso.resposta

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
      take: 100,
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
      headers: { 'Cache-Control': CACHE_PRIVADO },
    })
  } catch (error) {
    console.error("Error fetching fundamentals:", error)
    return NextResponse.json(
      { error: "Failed to fetch fundamentals" },
      { status: 500 }
    )
  }
}
