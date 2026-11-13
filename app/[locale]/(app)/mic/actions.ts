"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { getUser } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { clearMicAccess, isMicAnalyst, micDisplayName, prepareMicAccess, validMicPassword } from "@/lib/mic/access"
import { checkRateLimit } from "@/lib/rateLimit"
import type { User } from "@supabase/supabase-js"
import {
  capitalSchema, executeMicOrder, getMicQuote, MIC_ID, MicError, orderSchema, ticketSchema, tradeTotal,
  type MicErrorCode,
} from "@/lib/mic/orders"

function micIdentity(user: User) {
  return { analystId: user.id, analystName: micDisplayName(user) }
}

async function analyst() {
  const user = await getUser()
  return user && await isMicAnalyst(user.id) ? user : null
}

export async function unlockMic(password: unknown) {
  const user = await getUser()
  if (!user) return { error: "forbidden" as const }
  const limit = await checkRateLimit(`mic:${user.id}`, "auth")
  if (!limit.success) return { error: "gateRate" as const }
  if (!validMicPassword(password)) return { error: "gateInvalid" as const }

  try {
    const grant = await prepareMicAccess(user.id)
    if (!grant) return { error: "forbidden" as const }
    await prisma.micActivity.create({ data: { ...micIdentity(user), event: "UNLOCK" } })
    await grant()
    revalidatePath("/[locale]/mic", "page")
    return { unlocked: true }
  } catch (error) {
    return { error: reportActionError(error) }
  }
}

export async function lockMic() {
  const user = await analyst()
  await clearMicAccess()
  if (user) {
    try {
      await prisma.micActivity.create({ data: { ...micIdentity(user), event: "LOCK" } })
    } catch (error) {
      reportActionError(error)
    }
  }
  revalidatePath("/[locale]/mic", "page")
}

function reportActionError(error: unknown): MicErrorCode {
  if (error instanceof MicError) return error.code
  console.error("[MIC] Operation failed", error instanceof Error ? error.name : "Unknown error")
  return "unavailable"
}

export async function startMicPortfolio(capital: string) {
  const user = await analyst()
  if (!user) return { error: "forbidden" as const }
  const result = capitalSchema.safeParse(capital)
  if (!result.success) return { error: "invalid" as const }
  try {
    const identity = micIdentity(user)
    const created = await prisma.$transaction(async (tx) => {
      const portfolio = await tx.micPortfolio.createMany({
        data: { id: MIC_ID, initialCapital: result.data, cash: result.data },
        skipDuplicates: true,
      })
      if (portfolio.count) {
        await tx.micActivity.create({ data: { ...identity, event: "START" } })
      }
      return portfolio
    })
    revalidatePath("/[locale]/mic", "page")
    return { alreadyStarted: created.count === 0 }
  } catch (error) {
    return { error: reportActionError(error) }
  }
}

export async function reviewMicOrder(input: unknown) {
  if (!await analyst()) return { error: "forbidden" as const }
  const result = ticketSchema.safeParse(input)
  if (!result.success) return { error: "invalid" as const }
  const ticket = result.data

  try {
    const account = await prisma.micPortfolio.findUnique({ where: { id: MIC_ID }, select: { cash: true } })
    if (!account) return { error: "notStarted" as const }

    const quote = await getMicQuote(ticket.ticker, ticket.side)
    const total = tradeTotal(ticket.quantity, quote.price)
    if (total.lte(0)) return { error: "invalid" as const }
    if (ticket.side === "BUY" && account.cash.lt(total)) return { error: "cash" as const }
    if (ticket.side === "SELL") {
      const position = await prisma.micPosition.findUnique({
        where: { portfolioId_ticker: { portfolioId: MIC_ID, ticker: ticket.ticker } },
        select: { quantity: true },
      })
      if (!position || position.quantity.lt(ticket.quantity)) return { error: "position" as const }
    }

    return { order: {
      id: randomUUID(),
      name: quote.name,
      ticker: ticket.ticker,
      side: ticket.side,
      quantity: ticket.quantity.toFixed(),
      reviewedPrice: quote.price.toFixed(),
      quotedAt: quote.quotedAt.toISOString(),
      total: total.toString(),
    }}
  } catch (error) {
    return { error: reportActionError(error) }
  }
}

export async function submitMicOrder(input: unknown) {
  const user = await analyst()
  if (!user) return { error: "forbidden" as const }
  const result = orderSchema.safeParse(input)
  if (!result.success) return { error: "invalid" as const }
  try {
    const identity = micIdentity(user)
    const trade = await executeMicOrder(identity.analystId, result.data, identity.analystName)
    revalidatePath("/[locale]/mic", "page")
    return { executed: { price: trade.price.toString(), total: trade.total.toString(), ticker: trade.ticker } }
  } catch (error) {
    return { error: reportActionError(error) }
  }
}
