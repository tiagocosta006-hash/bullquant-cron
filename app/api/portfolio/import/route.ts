import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { mergePosition } from "@/lib/finance/portfolio"

type ImportRow = {
  ticker: string
  quantity: number
  avgBuyPrice: number
}

type ImportResult = {
  ticker: string
  status: "added" | "merged" | "unsupported" | "invalid"
}

const MAX_ROWS = 500

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const rows: unknown[] = Array.isArray(body?.rows) ? body.rows : []

    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows to import" }, { status: 400 })
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 400 })
    }

    const portfolio = await prisma.portfolio.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: "O Meu Portfólio",
      }
    })

    const results: ImportResult[] = []

    for (const raw of rows) {
      const ticker = typeof (raw as ImportRow)?.ticker === "string" ? (raw as ImportRow).ticker.trim().toUpperCase() : ""
      const quantity = Number((raw as ImportRow)?.quantity)
      const avgBuyPrice = Number((raw as ImportRow)?.avgBuyPrice)

      if (!ticker || !(quantity > 0) || !(avgBuyPrice > 0)) {
        results.push({ ticker: ticker || "?", status: "invalid" })
        continue
      }

      const company = await prisma.company.findUnique({ where: { ticker } })
      if (!company) {
        results.push({ ticker, status: "unsupported" })
        continue
      }

      const existing = await prisma.portfolioItem.findUnique({
        where: {
          portfolioId_companyId: {
            portfolioId: portfolio.id,
            companyId: company.id,
          }
        }
      })

      const position = existing?.quantity && existing?.avgBuyPrice
        ? mergePosition(
            { quantity: Number(existing.quantity), avgBuyPrice: Number(existing.avgBuyPrice) },
            { quantity, avgBuyPrice }
          )
        : { quantity, avgBuyPrice }

      await prisma.portfolioItem.upsert({
        where: {
          portfolioId_companyId: {
            portfolioId: portfolio.id,
            companyId: company.id,
          }
        },
        update: position,
        create: {
          portfolioId: portfolio.id,
          companyId: company.id,
          ...position,
        }
      })

      results.push({ ticker, status: existing ? "merged" : "added" })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error("Error importing portfolio:", error)
    return NextResponse.json(
      { error: "Failed to import portfolio" },
      { status: 500 }
    )
  }
}
