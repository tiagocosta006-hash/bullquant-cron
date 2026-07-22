import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const tickerSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
})

// POST { ticker } — adicionar uma empresa a uma watchlist nomeada
export async function POST(
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

    // Confirmar dono ANTES de tocar em qualquer coisa — nunca deixar
    // adicionar/remover empresas numa lista de outro utilizador.
    const watchlist = await prisma.watchlist.findFirst({ where: { id, userId: user.id } })
    if (!watchlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
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

    const company = await prisma.company.findUnique({ where: { ticker: parseResult.data.ticker } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const entry = await prisma.watchlistEntry.upsert({
      where: { watchlistId_companyId: { watchlistId: id, companyId: company.id } },
      update: {},
      create: { watchlistId: id, companyId: company.id },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json({ error: "Failed to add company" }, { status: 500 })
  }
}

// DELETE { ticker } — remover uma empresa de uma watchlist nomeada
export async function DELETE(
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

    const watchlist = await prisma.watchlist.findFirst({ where: { id, userId: user.id } })
    if (!watchlist) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
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

    const company = await prisma.company.findUnique({ where: { ticker: parseResult.data.ticker } })
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    await prisma.watchlistEntry.deleteMany({
      where: { watchlistId: id, companyId: company.id },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error removing from watchlist:", error)
    return NextResponse.json({ error: "Failed to remove company" }, { status: 500 })
  }
}
