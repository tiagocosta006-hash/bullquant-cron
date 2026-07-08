import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/lib/supabase/server"

type HistoryPoint = {
  date: string
  value: number
}

/**
 * Reconstrói uma aproximação do valor histórico do portfólio: para cada dia,
 * soma (quantidade ATUAL de cada posição × preço de fecho nesse dia). Não é
 * um histórico real de transações — assume que a quantidade detida hoje já
 * era a mesma no passado. É a melhor aproximação possível sem guardar
 * snapshots diários reais (não existem no schema atual).
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const months = Number(searchParams.get("months")) || 12

    const portfolio = await prisma.portfolio.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          where: { quantity: { not: null } },
          select: {
            quantity: true,
            company: { select: { ticker: true } },
          },
        },
      },
    })

    if (!portfolio || portfolio.items.length === 0) {
      return NextResponse.json({ points: [] })
    }

    const tickers = portfolio.items.map(item => item.company.ticker)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)

    const prices = await prisma.price.findMany({
      where: {
        ticker: { in: tickers },
        date: { gte: cutoff },
      },
      select: { ticker: true, date: true, close: true },
      orderBy: { date: "asc" },
    })

    // Agrupa preços por ticker, mantendo-os ordenados por data para fazer
    // "último preço conhecido até aqui" (forward-fill em fins de semana/feriados).
    const pricesByTicker = new Map<string, { date: string; close: number }[]>()
    for (const p of prices) {
      const key = p.date.toISOString().slice(0, 10)
      const list = pricesByTicker.get(p.ticker) || []
      list.push({ date: key, close: Number(p.close) })
      pricesByTicker.set(p.ticker, list)
    }

    const quantityByTicker = new Map(
      portfolio.items.map(item => [item.company.ticker, Number(item.quantity)])
    )

    // União de todas as datas em que pelo menos um ticker tem preço.
    const allDates = Array.from(
      new Set(prices.map(p => p.date.toISOString().slice(0, 10)))
    ).sort()

    if (allDates.length === 0) {
      return NextResponse.json({ points: [] })
    }

    // Ponteiro por ticker para o forward-fill (evita O(n²) refazendo find a cada data).
    const pointerByTicker = new Map<string, number>()
    for (const ticker of tickers) pointerByTicker.set(ticker, -1)

    const points: HistoryPoint[] = allDates.map(date => {
      let total = 0
      for (const ticker of tickers) {
        const quantity = quantityByTicker.get(ticker) ?? 0
        const series = pricesByTicker.get(ticker) || []
        let pointer = pointerByTicker.get(ticker) ?? -1
        while (pointer + 1 < series.length && series[pointer + 1].date <= date) {
          pointer++
        }
        pointerByTicker.set(ticker, pointer)
        const close = pointer >= 0 ? series[pointer].close : 0
        total += quantity * close
      }
      return { date, value: total }
    })

    return NextResponse.json({ points })
  } catch (error) {
    console.error("Error building portfolio history:", error)
    return NextResponse.json({ error: "Failed to build portfolio history" }, { status: 500 })
  }
}
