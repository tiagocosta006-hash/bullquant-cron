import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

// Multi-watchlists (hub "Outros" do explore) — separado do WatchlistItem
// flat que o botão "Seguir" continua a usar. Cap de 20 listas por user:
// suficiente para organizar temas (ex.: "Dividendos", "Watch depois do
// Q3") sem abrir espaço para abuso/spam de linhas na BD.
const MAX_WATCHLISTS_PER_USER = 20

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
})

// GET — lista as watchlists nomeadas do utilizador (com contagem de empresas)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const watchlists = await prisma.watchlist.findMany({
      where: { userId: user.id },
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json({
      watchlists: watchlists.map((w) => ({
        id: w.id,
        name: w.name,
        count: w._count.entries,
        createdAt: w.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Error listing watchlists:", error)
    return NextResponse.json({ error: "Failed to fetch watchlists" }, { status: 500 })
  }
}

// POST { name } — cria uma nova watchlist nomeada
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

    const parseResult = createSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const existingCount = await prisma.watchlist.count({ where: { userId: user.id } })
    if (existingCount >= MAX_WATCHLISTS_PER_USER) {
      return NextResponse.json(
        { error: `Limite de ${MAX_WATCHLISTS_PER_USER} watchlists atingido` },
        { status: 400 },
      )
    }

    const watchlist = await prisma.watchlist.create({
      data: { userId: user.id, name: parseResult.data.name },
    })

    return NextResponse.json(
      { id: watchlist.id, name: watchlist.name, count: 0, createdAt: watchlist.createdAt.toISOString() },
      { status: 201 },
    )
  } catch (error) {
    console.error("Error creating watchlist:", error)
    return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 })
  }
}
