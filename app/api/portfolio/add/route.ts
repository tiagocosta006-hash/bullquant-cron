import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { mergePosition } from "@/lib/finance/portfolio"
import { z } from "zod"

// O portfólio guarda POSIÇÕES REAIS: quantidade e preço médio são obrigatórios.
// Para "seguir" uma empresa sem posição existe a watchlist (/api/watchlist).
const addPortfolioSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  quantity: z.number().positive(),
  avgBuyPrice: z.number().positive()
})

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body;
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    const parseResult = addPortfolioSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const { ticker, quantity, avgBuyPrice } = parseResult.data

    // Find the company
    const company = await prisma.company.findUnique({
      where: { ticker }
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    // Find or create portfolio using upsert to prevent race conditions
    const portfolio = await prisma.portfolio.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: "O Meu Portfólio",
      }
    })

    const existing = await prisma.portfolioItem.findUnique({
      where: {
        portfolioId_companyId: {
          portfolioId: portfolio.id,
          companyId: company.id
        }
      }
    })

    // Se já existe posição, funde por média ponderada.
    const positionFields =
      existing?.quantity && existing?.avgBuyPrice
        ? mergePosition(
            { quantity: Number(existing.quantity), avgBuyPrice: Number(existing.avgBuyPrice) },
            { quantity, avgBuyPrice }
          )
        : { quantity, avgBuyPrice }

    // Add to portfolio using upsert to prevent race conditions (double-click)
    const item = await prisma.portfolioItem.upsert({
      where: {
        portfolioId_companyId: {
          portfolioId: portfolio.id,
          companyId: company.id
        }
      },
      update: positionFields,
      create: {
        portfolioId: portfolio.id,
        companyId: company.id,
        ...positionFields,
      }
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error adding to portfolio:", error)
    return NextResponse.json(
      { error: "Failed to add to portfolio" },
      { status: 500 }
    )
  }
}
