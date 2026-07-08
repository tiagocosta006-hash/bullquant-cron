import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { mergePosition } from "@/lib/finance/portfolio"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { ticker, quantity, avgBuyPrice } = body

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required" }, { status: 400 })
    }

    const hasPosition = quantity !== undefined && avgBuyPrice !== undefined
    if (hasPosition && (!(quantity > 0) || !(avgBuyPrice > 0))) {
      return NextResponse.json({ error: "quantity and avgBuyPrice must be positive numbers" }, { status: 400 })
    }

    // Find the company
    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() }
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

    // Se já existe posição (própria ou vinda desta chamada), funde por média ponderada.
    let positionFields: { quantity?: number; avgBuyPrice?: number } = {}
    if (hasPosition) {
      if (existing?.quantity && existing?.avgBuyPrice) {
        positionFields = mergePosition(
          { quantity: Number(existing.quantity), avgBuyPrice: Number(existing.avgBuyPrice) },
          { quantity, avgBuyPrice }
        )
      } else {
        positionFields = { quantity, avgBuyPrice }
      }
    }

    // Add to portfolio using upsert to prevent race conditions (double-click)
    const item = await prisma.portfolioItem.upsert({
      where: {
        portfolioId_companyId: {
          portfolioId: portfolio.id,
          companyId: company.id
        }
      },
      update: hasPosition ? positionFields : {},
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
