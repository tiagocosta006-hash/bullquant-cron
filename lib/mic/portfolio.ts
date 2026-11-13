import { Prisma } from "@prisma/client"
import { cotacoes, historico } from "@/lib/fmp/mercado"
import { prisma } from "@/lib/prisma"
import { MIC_ID, usableMicQuote } from "./orders"

export async function readMicPortfolio(analyst: boolean) {
  // Saldo, posições e operações vêm do mesmo snapshot, mesmo durante uma execução.
  const account = await prisma.$transaction((tx) => tx.micPortfolio.findUnique({
    where: { id: MIC_ID },
    include: {
      positions: { orderBy: { ticker: "asc" } },
      trades: {
        orderBy: { sequence: "desc" },
        take: 25,
        select: { id: true, ticker: true, side: true, quantity: true, price: true, total: true, executedAt: true, analystName: analyst },
      },
    },
  }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  if (!account) return null

  const quotes = await cotacoes(account.positions.map(({ ticker }) => ticker)).catch(() => new Map())
  const positions = account.positions.map((position) => {
    const quote = usableMicQuote(quotes.get(position.ticker))
    const value = quote?.price.mul(position.quantity) ?? null
    return {
      ticker: position.ticker,
      name: position.name,
      quantity: position.quantity,
      averageCost: position.costBasis.div(position.quantity),
      price: quote?.price ?? null,
      quotedAt: quote?.quotedAt ?? null,
      value,
      returnPct: value && position.costBasis.gt(0) ? value.div(position.costBasis).sub(1) : null,
    }
  })

  const value = positions.every((position) => position.value !== null)
    ? positions.reduce((sum, position) => sum.add(position.value!), account.cash)
    : null

  return { ...account, positions, value, returnPct: value?.div(account.initialCapital).sub(1) ?? null }
}

const tradingDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
})

export async function readMicHistory() {
  const account = await prisma.micPortfolio.findUnique({
    where: { id: MIC_ID },
    select: {
      createdAt: true,
      initialCapital: true,
      trades: {
        orderBy: { sequence: "asc" },
        select: { ticker: true, side: true, quantity: true, total: true, executedAt: true },
      },
    },
  })
  if (!account) return []

  const now = new Date()
  const end = tradingDate.format(now)
  const start = tradingDate.format(new Date(Math.max(+account.createdAt, +now - 365 * 86_400_000)))
  const firstHistoryDay = new Date(Date.parse(start) - 7 * 86_400_000)
  const holdings = new Map<string, Prisma.Decimal>()
  let cash = account.initialCapital

  const applyTrade = (trade: typeof account.trades[number]) => {
    const quantity = holdings.get(trade.ticker) ?? new Prisma.Decimal(0)
    const buying = trade.side === "BUY"
    const remaining = buying ? quantity.add(trade.quantity) : quantity.sub(trade.quantity)
    if (remaining.isZero()) holdings.delete(trade.ticker)
    else holdings.set(trade.ticker, remaining)
    cash = buying ? cash.sub(trade.total) : cash.add(trade.total)
  }

  let index = 0
  while (account.trades[index] && tradingDate.format(account.trades[index].executedAt) < start) {
    applyTrade(account.trades[index++])
  }
  const tickers = [...new Set([...holdings.keys(), ...account.trades.slice(index).map((trade) => trade.ticker)])]
  const history = new Map<string, Awaited<ReturnType<typeof historico>>>()
  for (let i = 0; i < tickers.length; i += 8) {
    await Promise.all(tickers.slice(i, i + 8).map(async (ticker) => {
      const closes = await historico(ticker, firstHistoryDay).catch(() => [])
      history.set(ticker, closes.filter((point) => Number.isFinite(point.close) && point.close > 0))
    }))
  }

  const points: { date: string; value: number }[] = []
  const latest = new Map<string, { date: string; close: number }>()
  const cursors = new Map<string, number>()
  // O gráfico só usa fechos de dias anteriores. O valor atual surge no resumo.
  for (let time = Date.parse(start); time < Date.parse(end); time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10)
    while (account.trades[index] && tradingDate.format(account.trades[index].executedAt) <= day) {
      applyTrade(account.trades[index++])
    }

    for (const [ticker, rows] of history) {
      let cursor = cursors.get(ticker) ?? 0
      while (rows[cursor] && rows[cursor].date <= day) latest.set(ticker, rows[cursor++])
      cursors.set(ticker, cursor)
    }

    let value: Prisma.Decimal | null = cash
    for (const [ticker, quantity] of holdings) {
      const close = latest.get(ticker)
      if (!close || time - Date.parse(close.date) > 4 * 86_400_000) {
        value = null
        break
      }
      value = value.add(quantity.mul(close.close))
    }
    if (value !== null) points.push({ date: day, value: value.toNumber() })
  }
  return points
}
