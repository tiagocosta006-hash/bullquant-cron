import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const tickerSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
})

// GET — lista de observação do utilizador (com dados da empresa + último anual)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const items = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      include: {
        company: {
          select: {
            id: true,
            ticker: true,
            name: true,
            logoUrl: true,
            exchange: true,
            sector: true,
            industry: true,
            fundamentals: {
              where: { periodType: "ANNUAL" },
              orderBy: { periodEnd: "desc" },
              take: 1,
              select: {
                roic: true,
                grossMargin: true,
              },
            },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    })

    return NextResponse.json({ items })
  } catch (error) {
    console.error("Error fetching watchlist:", error)
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 })
  }
}

// POST { ticker } — seguir uma empresa (idempotente)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    const parseResult = tickerSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const company = await prisma.company.findUnique({
      where: { ticker: parseResult.data.ticker },
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    // Upsert para tolerar duplo-clique
    const item = await prisma.watchlistItem.upsert({
      where: {
        userId_companyId: { userId: user.id, companyId: company.id },
      },
      update: {},
      create: { userId: user.id, companyId: company.id },
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 })
  }
}

// DELETE { ticker } — deixar de seguir
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    const parseResult = tickerSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const company = await prisma.company.findUnique({
      where: { ticker: parseResult.data.ticker },
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    await prisma.watchlistItem.deleteMany({
      where: { userId: user.id, companyId: company.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error removing from watchlist:", error)
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 })
  }
}
