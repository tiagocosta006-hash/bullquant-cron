import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const renameSchema = z.object({
  name: z.string().trim().min(1).max(60),
})

// GET /api/watchlists/[id] — meta + empresas da lista (shape do CompanyCard)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Sempre scoped por userId — nunca confiar só no id (evita ler/editar
    // uma lista de outro utilizador só por adivinhar o cuid).
    const watchlist = await prisma.watchlist.findFirst({
      where: { id, userId: user.id },
      include: {
        entries: {
          orderBy: { addedAt: "desc" },
          include: {
            company: {
              select: {
                id: true,
                ticker: true,
                name: true,
                logoUrl: true,
                sector: true,
                industry: true,
                description: true,
                ceo: true,
                fundamentals: {
                  where: { periodType: "ANNUAL" },
                  orderBy: { periodEnd: "desc" },
                  take: 1,
                  select: {
                    revenue: true,
                    netMargin: true,
                    roic: true,
                    revenueSegments: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!watchlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const companies = watchlist.entries.map((e) => {
      const c = e.company
      const lastAnnual = c.fundamentals.length > 0 ? c.fundamentals[0] : null
      return {
        id: c.id,
        ticker: c.ticker,
        name: c.name,
        logoUrl: c.logoUrl,
        sector: c.sector || "Unknown",
        industry: c.industry || "Unknown",
        description: c.description,
        ceo: c.ceo,
        revenue: lastAnnual?.revenue != null ? Number(lastAnnual.revenue) : null,
        netMargin: lastAnnual?.netMargin != null ? Number(lastAnnual.netMargin) : null,
        roic: lastAnnual?.roic != null ? Number(lastAnnual.roic) : null,
        revenueSegments: lastAnnual ? lastAnnual.revenueSegments : null,
      }
    })

    return NextResponse.json({
      id: watchlist.id,
      name: watchlist.name,
      createdAt: watchlist.createdAt.toISOString(),
      companies,
    })
  } catch (error) {
    console.error("Error fetching watchlist:", error)
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 })
  }
}

// PATCH { name } — renomear (scoped por userId)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
    }

    const parseResult = renameSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const res = await prisma.watchlist.updateMany({
      where: { id, userId: user.id },
      data: { name: parseResult.data.name },
    })

    if (res.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error renaming watchlist:", error)
    return NextResponse.json({ error: "Failed to rename watchlist" }, { status: 500 })
  }
}

// DELETE — apagar a lista (scoped por userId; cascade trata das entries)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const res = await prisma.watchlist.deleteMany({
      where: { id, userId: user.id },
    })

    if (res.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error deleting watchlist:", error)
    return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 })
  }
}
