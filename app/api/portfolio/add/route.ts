import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { mergePosition } from "@/lib/finance/portfolio"
import { z } from "zod"

// O portfólio guarda POSIÇÕES REAIS: quantidade e preço médio são obrigatórios.
// Para "seguir" uma empresa sem posição existe a watchlist (/api/watchlist).
// Detalhes opcionais: data de compra, corretora, moeda, taxas e notas.
const addPortfolioSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  quantity: z.number().positive(),
  avgBuyPrice: z.number().positive(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  broker: z.string().max(60).optional(),
  currency: z.string().max(6).optional(),
  fees: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
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

    const { ticker, quantity, avgBuyPrice, buyDate, broker, currency, fees, notes } = parseResult.data

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

    // Detalhes no reforço de posição: fees SOMAM; data mantém a primeira
    // compra; corretora/moeda/notas mantêm o que existe (só preenchem vazios).
    const detailFields = {
      buyDate: existing?.buyDate ?? (buyDate ? new Date(`${buyDate}T00:00:00Z`) : undefined),
      broker: existing?.broker ?? broker?.trim() ?? undefined,
      currency: existing?.currency ?? currency?.trim().toUpperCase() ?? undefined,
      fees: fees !== undefined
        ? Number(existing?.fees ?? 0) + fees
        : existing?.fees ?? undefined,
      notes: existing?.notes ?? notes?.trim() ?? undefined,
    }

    // Add to portfolio using upsert to prevent race conditions (double-click)
    const item = await prisma.portfolioItem.upsert({
      where: {
        portfolioId_companyId: {
          portfolioId: portfolio.id,
          companyId: company.id
        }
      },
      update: { ...positionFields, ...detailFields },
      create: {
        portfolioId: portfolio.id,
        companyId: company.id,
        ...positionFields,
        ...detailFields,
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
