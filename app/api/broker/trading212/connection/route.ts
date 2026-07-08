import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { encryptSecret } from "@/lib/crypto"
import { fetchTrading212Positions, Trading212ApiError } from "@/lib/broker/trading212"

/** Devolve se o utilizador já tem uma ligação Trading212 (nunca as credenciais). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connection = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
    select: { broker: true, lastSyncedAt: true, lastSyncError: true },
  })

  return NextResponse.json({ connection })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey, apiSecret } = body

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "apiKey and apiSecret are required" }, { status: 400 })
    }

    // Valida as credenciais contra a API real antes de as guardar.
    try {
      await fetchTrading212Positions(apiKey, apiSecret)
    } catch (err) {
      if (err instanceof Trading212ApiError && (err.status === 401 || err.status === 403)) {
        return NextResponse.json({ error: "Invalid Trading212 credentials" }, { status: 400 })
      }
      throw err
    }

    await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
      update: {
        encryptedApiKey: encryptSecret(apiKey),
        encryptedApiSecret: encryptSecret(apiSecret),
        lastSyncError: null,
      },
      create: {
        userId: user.id,
        broker: "TRADING212",
        encryptedApiKey: encryptSecret(apiKey),
        encryptedApiSecret: encryptSecret(apiSecret),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error connecting Trading212:", error)
    return NextResponse.json({ error: "Failed to connect Trading212" }, { status: 500 })
  }
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await prisma.brokerConnection.deleteMany({ where: { userId: user.id, broker: "TRADING212" } })
  return NextResponse.json({ success: true })
}
