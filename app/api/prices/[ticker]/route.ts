import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizarTicker } from "@/lib/ticker"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const bruto = await params
    const ticker = normalizarTicker(bruto.ticker)
    if (!ticker) {
      return NextResponse.json({ error: "Ticker inválido" }, { status: 400 })
    }
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') ?? '5y'

    // Cap rows by period to avoid sending thousands of records
    const periodMap: Record<string, number> = {
      '1m':  22,
      '6m':  130,
      '1y':  252,
      '5y':  1260,
    }
    // O 'max' não tinha limite nenhum: devolvia a série diária completa, que
    // na Apple são 3.793 pontos e noutras empresas muito mais. O gráfico tem
    // ~800 px de largura, portanto quatro em cada cinco pontos caíam uns por
    // cima dos outros — e cada um deles saiu da base de dados e contou para o
    // egress do Supabase.
    //
    // Passa a ser amostrado NO SQL, como as séries macro: um ponto a cada
    // passo, com o mais recente sempre preservado por ser o valor de hoje.
    const take = period === 'max' ? undefined : (periodMap[period] ?? 1260)

    const prices = take === undefined
      ? (await prisma.$queryRawUnsafe<Array<{ date: Date; close: number }>>(
          `SELECT s.date, s.close FROM (
             SELECT date, close,
                    row_number() OVER (ORDER BY date) AS rn,
                    count(*)     OVER ()              AS total
             FROM prices WHERE ticker = $1
           ) s
           WHERE s.rn % GREATEST(1, CEIL(s.total::numeric / $2)::int) = 0
              OR s.rn = s.total
           ORDER BY s.date`,
          ticker.toUpperCase(), 800,
        ))
      : (await prisma.price.findMany({
          where: { ticker: ticker.toUpperCase() },
          orderBy: { date: 'desc' },
          take,
          select: { date: true, close: true },
        })).reverse()

    if (!prices || prices.length === 0) {
      return NextResponse.json({ error: "No price history found" }, { status: 404 })
    }

    // Convert decimal to number for frontend charting and format dates
    const formattedPrices = prices.map(p => ({
      date: p.date.toISOString(),
      close: Number(p.close),
    }))

    // EOD: muda 1x/dia — a CDN da Vercel serve os hits sem invocar a function
    return NextResponse.json(formattedPrices, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (error) {
    console.error("Error fetching price history:", error)
    return NextResponse.json(
      { error: "Failed to fetch price history" },
      { status: 500 }
    )
  }
}
