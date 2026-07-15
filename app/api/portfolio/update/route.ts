import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

// Edição direta de uma posição (SEM merge — substitui os valores).
// Nota: numa posição sincronizada da Trading212, quantity/avgBuyPrice serão
// sobrescritos no próximo sync; os detalhes (data/corretora/fees/notas) ficam.
const updatePositionSchema = z.object({
  ticker: z.string().min(1).max(10).trim().toUpperCase(),
  quantity: z.number().positive(),
  avgBuyPrice: z.number().positive(),
  buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  broker: z.string().max(60).nullable().optional(),
  currency: z.string().max(6).nullable().optional(),
  fees: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
})

export async function PATCH(request: Request) {
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

    const parseResult = updatePositionSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 })
    }

    const { ticker, quantity, avgBuyPrice, buyDate, broker, currency, fees, notes } = parseResult.data

    const item = await prisma.portfolioItem.findFirst({
      where: {
        portfolio: { userId: user.id },
        company: { ticker },
      },
    })

    if (!item) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 })
    }

    const updated = await prisma.portfolioItem.update({
      where: { id: item.id },
      data: {
        quantity,
        avgBuyPrice,
        // undefined = não mexer; null = limpar; valor = definir
        buyDate: buyDate === undefined ? undefined : buyDate ? new Date(`${buyDate}T00:00:00Z`) : null,
        broker: broker === undefined ? undefined : broker?.trim() || null,
        currency: currency === undefined ? undefined : currency?.trim().toUpperCase() || null,
        fees: fees === undefined ? undefined : fees,
        notes: notes === undefined ? undefined : notes?.trim() || null,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating position:", error)
    return NextResponse.json({ error: "Failed to update position" }, { status: 500 })
  }
}
