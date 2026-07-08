import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/crypto"
import { fetchTrading212Positions, extractExchangeTicker, Trading212ApiError } from "@/lib/broker/trading212"

type SyncResult = {
  ticker: string
  status: "synced" | "unsupported"
}

type AggregatedPosition = {
  ticker: string
  quantity: number
  totalCost: number
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connection = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
  })
  if (!connection) {
    return NextResponse.json({ error: "No Trading212 connection found" }, { status: 404 })
  }

  try {
    const apiKey = decryptSecret(connection.encryptedApiKey)
    const apiSecret = decryptSecret(connection.encryptedApiSecret)

    const positions = await fetchTrading212Positions(apiKey, apiSecret)

    const portfolio = await prisma.portfolio.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, name: "O Meu Portfólio" },
    })

    // O mesmo ISIN pode aparecer como múltiplas posições T212 (ex: listagem
    // "normal" e fracionada da mesma ação, com tickers internos diferentes
    // como "AMZN_US_EQ" e "AMZd_EQ") — agregar por ISIN antes de resolver a
    // Company evita criar/gravar posições duplicadas para a mesma empresa.
    const byIsin = new Map<string, AggregatedPosition>()
    for (const position of positions) {
      const ticker = extractExchangeTicker(position.ticker)
      const existing = byIsin.get(position.isin)
      if (existing) {
        existing.quantity += position.quantity
        existing.totalCost += position.quantity * position.averagePricePaid
      } else {
        byIsin.set(position.isin, {
          ticker,
          quantity: position.quantity,
          totalCost: position.quantity * position.averagePricePaid,
        })
      }
    }

    const results: SyncResult[] = []

    for (const aggregated of byIsin.values()) {
      const company = await prisma.company.findUnique({ where: { ticker: aggregated.ticker } })

      if (!company) {
        results.push({ ticker: aggregated.ticker, status: "unsupported" })
        continue
      }

      const avgBuyPrice = aggregated.totalCost / aggregated.quantity

      await prisma.portfolioItem.upsert({
        where: { portfolioId_companyId: { portfolioId: portfolio.id, companyId: company.id } },
        update: {
          quantity: aggregated.quantity,
          avgBuyPrice,
        },
        create: {
          portfolioId: portfolio.id,
          companyId: company.id,
          quantity: aggregated.quantity,
          avgBuyPrice,
        },
      })

      results.push({ ticker: aggregated.ticker, status: "synced" })
    }

    await prisma.brokerConnection.update({
      where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    })

    return NextResponse.json({ results })
  } catch (error) {
    const message = error instanceof Trading212ApiError
      ? error.message
      : "Failed to sync with Trading212"

    await prisma.brokerConnection.update({
      where: { userId_broker: { userId: user.id, broker: "TRADING212" } },
      data: { lastSyncError: message },
    })

    console.error("Error syncing Trading212:", error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
