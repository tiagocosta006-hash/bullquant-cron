import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deriveFcff, deriveEffectiveTaxRate, type FcfSourceRecord } from "@/lib/finance/fcf"

function num(val: unknown): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === "number") return val
  if (typeof val === "bigint") return Number(val)
  if (typeof val === "object" && "toNumber" in val) {
    return (val as { toNumber(): number }).toNumber()
  }
  return null
}

async function fetchCurrentPrice(ticker: string): Promise<number | null> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.c === "number" && data.c > 0 ? data.c : null
  } catch {
    return null
  }
}

async function fetchBeta(ticker: string): Promise<number | null> {
  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`,
      { next: { revalidate: 3600 } } // cache 1 hora
    )
    if (!res.ok) return null
    const data = await res.json()
    // Beta pode estar em data.metric.beta ou data.metric.52WeekBeta
    const beta = data.metric?.beta ?? data.metric?.["52WeekBeta"]
    return typeof beta === "number" && beta > 0 && beta < 10 ? beta : null
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params
    const upper = ticker.toUpperCase()

    const company = await prisma.company.findUnique({
      where: { ticker: upper },
    })

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    const annuals = await prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "ANNUAL" },
      orderBy: { periodEnd: "desc" },
      take: 10,
    })

    // Base record: o anual mais recente com FCF não-nulo
    const baseRecord = annuals.find((f) => num(f.freeCashFlow) !== null)
    const fcfe0 = baseRecord ? num(baseRecord.freeCashFlow) : null

    // FCFF derivado do baseRecord
    let fcff0: number | null = null
    let effectiveTaxRate = 0.21
    if (baseRecord) {
      const result = deriveFcff({
        fiscalYear: baseRecord.fiscalYear,
        operatingCashFlow: num(baseRecord.operatingCashFlow),
        capex: num(baseRecord.capex),
        interestExpense: num(baseRecord.interestExpense),
        taxExpense: num(baseRecord.taxExpense),
        operatingIncome: num(baseRecord.operatingIncome),
      })
      fcff0 = result.fcff
      effectiveTaxRate = result.effectiveTaxRate
    }

    // Ações (com fallback duplo como antes)
    const shares =
      num(baseRecord?.sharesOutstanding) ??
      num(annuals.find((f) => num(f.sharesOutstanding) !== null)?.sharesOutstanding)

    // **Bug #2 fix:** totalDebt e cash também com fallback duplo
    const totalDebt =
      num(baseRecord?.totalDebt) ??
      num(annuals.find((f) => num(f.totalDebt) !== null)?.totalDebt) ??
      0
    const cash =
      num(baseRecord?.cash) ??
      num(annuals.find((f) => num(f.cash) !== null)?.cash) ??
      0
    const netDebt = totalDebt - cash

    const interestExpense =
      num(baseRecord?.interestExpense) ??
      num(annuals.find((f) => num(f.interestExpense) !== null)?.interestExpense) ??
      null

    // CAGR de FCFF para sugestão de crescimento
    let suggestedGrowth: number | null = null
    const fcffSeries = annuals
      .map((f) => {
        const result = deriveFcff({
          fiscalYear: f.fiscalYear,
          operatingCashFlow: num(f.operatingCashFlow),
          capex: num(f.capex),
          interestExpense: num(f.interestExpense),
          taxExpense: num(f.taxExpense),
          operatingIncome: num(f.operatingIncome),
        })
        return result.fcff
      })
      .filter((v): v is number => v !== null && v > 0)

    if (fcffSeries.length >= 2) {
      const latest = fcffSeries[0]
      const oldest = fcffSeries[fcffSeries.length - 1]
      const years = fcffSeries.length - 1
      const cagr = Math.pow(latest / oldest, 1 / years) - 1
      suggestedGrowth = Math.max(-0.1, Math.min(0.3, cagr))
    }

    // Série completa de FCF para suavização na Fase 5
    const annualFcfSeries: FcfSourceRecord[] = annuals.map((f) => ({
      fiscalYear: f.fiscalYear,
      operatingCashFlow: num(f.operatingCashFlow),
      capex: num(f.capex),
      interestExpense: num(f.interestExpense),
      taxExpense: num(f.taxExpense),
      operatingIncome: num(f.operatingIncome),
    }))

    const [currentPrice, beta] = await Promise.all([
      fetchCurrentPrice(upper),
      fetchBeta(upper),
    ])

    return NextResponse.json({
      ticker: upper,
      name: company.name,
      currency: company.currency,
      logoUrl: company.logoUrl,
      fcfe0,
      fcff0,
      effectiveTaxRate,
      shares,
      netDebt,
      totalDebt,
      interestExpense,
      currentPrice,
      beta,
      suggestedGrowth,
      annualFcfSeries,
    })
  } catch (error) {
    console.error("Error fetching DCF data:", error)
    return NextResponse.json(
      { error: "Failed to fetch DCF data" },
      { status: 500 }
    )
  }
}
