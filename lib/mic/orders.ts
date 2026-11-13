import { Prisma } from "@prisma/client"
import { z } from "zod"
import { cotacoes } from "@/lib/fmp/mercado"
import { prisma } from "@/lib/prisma"

export const MIC_ID = "MIC"

export const tickerSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9.-]{0,19}$/)
const quantitySchema = z.string().regex(/^\d{1,7}(?:[.,]\d{1,6})?$/)
  .transform((value) => new Prisma.Decimal(value.replace(",", ".")))
  .refine((value) => value.gt(0) && value.lte(1_000_000))
export const capitalSchema = z.string().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/)
  .transform((value) => new Prisma.Decimal(value.replace(",", ".")))
  .refine((value) => value.gt(0) && value.lte(1_000_000_000))

export const ticketSchema = z.object({
  ticker: tickerSchema,
  side: z.enum(["BUY", "SELL"]),
  quantity: quantitySchema,
})

export const orderSchema = ticketSchema.extend({
  id: z.uuid(),
  reviewedPrice: quantitySchema,
})

export type MicErrorCode =
  | "forbidden" | "invalid" | "notStarted" | "instrument" | "quote"
  | "cash" | "position" | "priceChanged" | "orderConflict" | "unavailable"

export class MicError extends Error {
  constructor(readonly code: MicErrorCode) {
    super(code)
  }
}

export function tradeTotal(quantity: Prisma.Decimal, price: Prisma.Decimal) {
  return quantity.mul(price).toDecimalPlaces(4)
}

export function usableMicQuote(quote: { price: number; timestamp?: number } | undefined) {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 ||
    !quote.timestamp || !Number.isFinite(quote.timestamp)) return null
  const age = Date.now() - quote.timestamp * 1_000
  // Fins de semana e feriados podem usar a última negociação publicada.
  if (age < -60_000 || age > 4 * 86_400_000) return null
  const price = new Prisma.Decimal(quote.price).toDecimalPlaces(6)
  return price.gt(0) && price.lte(1_000_000) ? { price, quotedAt: new Date(quote.timestamp * 1_000) } : null
}

export async function getMicQuote(ticker: string, side: "BUY" | "SELL") {
  const [company, position] = await Promise.all([
    prisma.company.findUnique({
      where: { ticker },
      select: { ticker: true, name: true, currency: true, exchange: true, isActive: true },
    }),
    side === "SELL" ? prisma.micPosition.findUnique({
      where: { portfolioId_ticker: { portfolioId: MIC_ID, ticker } },
      select: { ticker: true, name: true },
    }) : null,
  ])

  const instrument = position ?? (
    company?.isActive && company.currency === "USD" && company.exchange !== "INDEX" ? company : null
  )
  if (!instrument) throw new MicError(side === "SELL" ? "position" : "instrument")

  const quotes = await cotacoes([ticker], 0)
  const quote = usableMicQuote(quotes.get(ticker))
  if (!quote) throw new MicError("quote")
  return { ...instrument, ...quote }
}

function sameOrder(trade: { analystId: string; ticker: string; side: string; quantity: Prisma.Decimal },
  analystId: string, order: z.output<typeof orderSchema>) {
  if (trade.analystId !== analystId || trade.ticker !== order.ticker
    || trade.side !== order.side || !trade.quantity.equals(order.quantity)) {
    throw new MicError("orderConflict")
  }
}

export async function executeMicOrder(analystId: string, order: z.output<typeof orderSchema>, analystName = "") {
  const existing = await prisma.micTrade.findUnique({ where: { id: order.id } })
  if (existing) {
    sameOrder(existing, analystId, order)
    return existing
  }

  const quote = await getMicQuote(order.ticker, order.side)
  const total = tradeTotal(order.quantity, quote.price)
  if (total.lte(0)) throw new MicError("invalid")

  return prisma.$transaction(async (tx) => {
    // A mesma linha serializa todas as operações na carteira partilhada.
    const [account] = await tx.$queryRaw<Array<{ cash: Prisma.Decimal }>>`
      SELECT cash FROM mic_portfolio WHERE id = ${MIC_ID} FOR UPDATE
    `
    if (!account) throw new MicError("notStarted")

    const duplicate = await tx.micTrade.findUnique({ where: { id: order.id } })
    if (duplicate) {
      sameOrder(duplicate, analystId, order)
      return duplicate
    }

    const buy = order.side === "BUY"
    if (buy ? quote.price.gt(order.reviewedPrice) : quote.price.lt(order.reviewedPrice)) {
      throw new MicError("priceChanged")
    }

    const key = { portfolioId: MIC_ID, ticker: order.ticker }
    const where = { portfolioId_ticker: key }
    const position = await tx.micPosition.findUnique({ where })
    if (buy) {
      if (account.cash.lt(total)) throw new MicError("cash")
      await tx.micPosition.upsert({
        where,
        create: { ...key, name: quote.name, quantity: order.quantity, costBasis: total },
        update: { quantity: { increment: order.quantity }, costBasis: { increment: total } },
      })
    } else {
      if (!position || position.quantity.lt(order.quantity)) throw new MicError("position")
      if (position.quantity.equals(order.quantity)) {
        await tx.micPosition.delete({ where })
      } else {
        // Custo médio ponderado das unidades que ficam em carteira.
        const quantity = position.quantity.sub(order.quantity)
        const costBasis = position.costBasis.mul(quantity).div(position.quantity).toDecimalPlaces(4)
        await tx.micPosition.update({ where, data: { quantity, costBasis } })
      }
    }

    await tx.micPortfolio.update({
      where: { id: MIC_ID },
      data: { cash: { increment: buy ? total.negated() : total } },
    })
    return tx.micTrade.create({
      data: {
        id: order.id, portfolioId: MIC_ID, analystId, analystName, ticker: order.ticker, name: quote.name,
        quantity: order.quantity, side: order.side, price: quote.price, total, quotedAt: quote.quotedAt,
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
