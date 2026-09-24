import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deriveFcff, deriveEffectiveTaxRate, type FcfSourceRecord } from "@/lib/finance/fcf"
import { exigirPro } from "@/lib/api/acessoPro"
import { normalizarTicker } from "@/lib/ticker"
import { cotacao, get, simbolo } from "@/lib/fmp/mercado"
import { eFinanceira } from "@/lib/fmp/mapear"

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
  try {
    const q = await cotacao(ticker)
    return q && q.price > 0 ? q.price : null
  } catch {
    return null
  }
}

async function fetchBeta(ticker: string): Promise<number | null> {
  try {
    const perfil = await get<Array<{ beta?: number }>>("profile", { symbol: simbolo(ticker) }, 86_400)
    const beta = perfil?.[0]?.beta
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
    // Validado antes de chegar à FMP (duas chamadas abaixo) — ver lib/ticker.ts.
    const upper = normalizarTicker(ticker)
    if (!upper) {
      return NextResponse.json({ error: "Ticker inválido" }, { status: 400 })
    }

    // A calculadora DCF é uma página PRO (ver (app)/dcf/page.tsx). O
    // autopreencher é o que a torna útil, e estava aberto a toda a gente.
    const acesso = await exigirPro({ ticker: upper, demoAnonima: true })
    if (!acesso.ok) return acesso.resposta

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
    let fcfe0 = baseRecord ? num(baseRecord.freeCashFlow) : null

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

    // ── Pressupostos por omissão ─────────────────────────────────────────
    //
    // Antes: FCF do último ano e crescimento = CAGR do FCF entre o ano mais
    // antigo e o mais recente. Os dados estavam certos, os pressupostos não.
    // Na Amazon, o FCF de 2025 foi 7,7 mil M (capex da AWS de 131,8 mil M,
    // contra 83 mil M no ano anterior) e o de 2016 foi quase igual — o CAGR
    // dava ~0% e o valor justo $14 contra um preço de $250. Um ano de
    // investimento pesado não é o fluxo normal da empresa, e dois pontos
    // soltos de uma série volátil não são uma taxa de crescimento.
    //
    //   · FCF inicial = média dos últimos 3 anos (se houver 3 e a média for
    //     positiva); senão o último, como antes.
    //   · Crescimento = CAGR da RECEITA a 5 anos, que é estável e é o que
    //     sustenta o FCF a prazo. Limitado a [−5%, 25%]. Sem receita, cai no
    //     CAGR do FCFF como antes.
    const fcffAnual = annuals.map((f) =>
      deriveFcff({
        fiscalYear: f.fiscalYear,
        operatingCashFlow: num(f.operatingCashFlow),
        capex: num(f.capex),
        interestExpense: num(f.interestExpense),
        taxExpense: num(f.taxExpense),
        operatingIncome: num(f.operatingIncome),
      }).fcff,
    )
    const media3 = (vals: Array<number | null>): number | null => {
      const ultimos = vals.slice(0, 3)
      if (ultimos.length < 3 || ultimos.some((v) => v === null)) return null
      const m = (ultimos as number[]).reduce((a, b) => a + b, 0) / 3
      return m > 0 ? m : null
    }
    // O último ano, salvo se cair mais de 30% abaixo da média de 3 anos —
    // aí é um ano atípico (capex extraordinário, pagamento pontual) e a média
    // representa melhor. Usar sempre a média penalizava quem cresce depressa
    // (a Nvidia ficava com 62 mil M em vez de 97).
    const normalizar = (vals: Array<number | null>): number | null => {
      const ultimo = vals[0] ?? null
      const media = media3(vals)
      if (media === null) return ultimo
      if (ultimo === null || ultimo < media * 0.7) return media
      return ultimo
    }
    const idxBase = baseRecord ? annuals.indexOf(baseRecord) : -1
    if (idxBase >= 0) {
      fcff0 = normalizar(fcffAnual.slice(idxBase)) ?? fcff0
      fcfe0 = normalizar(annuals.slice(idxBase).map((f) => num(f.freeCashFlow))) ?? fcfe0
    }

    // Bancos, corretoras e seguradoras: o cash flow operacional inclui os
    // depósitos e o dinheiro dos clientes, e o "FCF" não mede nada (a IBKR
    // dava $1 331 por ação contra $90). O padrão para financeiras é descontar
    // o lucro líquido, e a dívida faz parte da operação — não se subtrai.
    const financeira = eFinanceira(company.sector)
    let netDebtFinal = netDebt
    if (financeira) {
      const lucro = normalizar(annuals.map((f) => num(f.netIncome)))
      fcff0 = lucro
      fcfe0 = lucro
      netDebtFinal = 0
    }

    let suggestedGrowth: number | null = null
    const receitas = annuals.map((f) => num(f.revenue))
    const anosReceita = Math.min(5, receitas.length - 1)
    if (anosReceita >= 3 && receitas[0] && receitas[anosReceita] && receitas[0]! > 0 && receitas[anosReceita]! > 0) {
      const cagr = Math.pow(receitas[0]! / receitas[anosReceita]!, 1 / anosReceita) - 1
      suggestedGrowth = Math.max(-0.05, Math.min(0.25, cagr))
    } else {
      const fcffSeries = fcffAnual.filter((v): v is number => v !== null && v > 0)
      if (fcffSeries.length >= 2) {
        const cagr = Math.pow(fcffSeries[0] / fcffSeries[fcffSeries.length - 1], 1 / (fcffSeries.length - 1)) - 1
        suggestedGrowth = Math.max(-0.1, Math.min(0.3, cagr))
      }
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
      netDebt: netDebtFinal,
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
