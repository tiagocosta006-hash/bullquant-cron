import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exigirPro, CACHE_PRIVADO } from "@/lib/api/acessoPro"
import { normalizarTicker } from "@/lib/ticker"
import { cotacao, get, simbolo, historico as historicoPrecos } from "@/lib/fmp/mercado"
import { analistas } from "@/lib/fmp/estimativas"
import { modeloFcffAplicavel } from "@/lib/finance/modelo/aplicabilidade"
import type { AnoHistorico } from "@/lib/finance/modelo"

/**
 * GET /api/dcf/modelo/[ticker]
 *
 * Tudo o que o modelo DCF completo precisa, numa resposta: 10 anos de
 * histórico anual, o consenso dos analistas, e os dados de mercado para a
 * WACC e para a ponte EV → valor por ação. Os cálculos correm no cliente
 * (lib/finance/modelo), como a calculadora rápida.
 *
 * Balanço (dívida, caixa, minoritários) e ações vêm do último TRIMESTRE, não
 * do último ano: a ponte tem de usar o balanço mais recente que existe.
 */

const n = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "object" && "toNumber" in (v as object)) return (v as { toNumber(): number }).toNumber()
  return null
}

export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const ticker = normalizarTicker((await params).ticker)
  if (!ticker) return NextResponse.json({ error: "Ticker inválido" }, { status: 400 })

  const acesso = await exigirPro({ ticker, demoAnonima: true })
  if (!acesso.ok) return acesso.resposta

  const company = await prisma.company.findUnique({
    where: { ticker },
    select: { id: true, ticker: true, name: true, sector: true, industry: true, logoUrl: true, isActive: true },
  })
  if (!company || !company.isActive) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const [anuais, trimestres] = await Promise.all([
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "ANNUAL" },
      orderBy: { periodEnd: "desc" },
      take: 10,
      select: {
        fiscalYear: true, periodEnd: true, revenue: true, costOfRevenue: true, grossProfit: true,
        operatingExpenses: true, operatingIncome: true, ebitda: true, depreciationAndAmortization: true,
        capex: true, accountsReceivable: true, inventory: true, accountsPayable: true, taxExpense: true,
        incomeBeforeTax: true, stockBasedCompensation: true, operatingCashFlow: true, freeCashFlow: true,
        reportedCurrency: true, revenueSegmentsByAxis: true,
        sharesOutstanding: true, totalDebt: true, cash: true, minorityInterest: true,
      },
    }),
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "QUARTERLY" },
      orderBy: { periodEnd: "desc" },
      take: 4,
      select: {
        periodEnd: true, totalDebt: true, cash: true, minorityInterest: true, sharesOutstanding: true,
        ebitda: true, interestExpense: true,
      },
    }),
  ])
  if (anuais.length < 2) return NextResponse.json({ error: "Histórico insuficiente" }, { status: 404 })

  const historico: AnoHistorico[] = anuais.reverse().map((a) => ({
    fiscalYear: a.fiscalYear,
    periodEnd: a.periodEnd.toISOString().slice(0, 10),
    revenue: n(a.revenue), costOfRevenue: n(a.costOfRevenue), grossProfit: n(a.grossProfit),
    operatingExpenses: n(a.operatingExpenses), operatingIncome: n(a.operatingIncome), ebitda: n(a.ebitda),
    depreciationAndAmortization: n(a.depreciationAndAmortization), capex: n(a.capex),
    accountsReceivable: n(a.accountsReceivable), inventory: n(a.inventory), accountsPayable: n(a.accountsPayable),
    taxExpense: n(a.taxExpense), incomeBeforeTax: n(a.incomeBeforeTax),
    stockBasedCompensation: n(a.stockBasedCompensation), operatingCashFlow: n(a.operatingCashFlow),
    freeCashFlow: n(a.freeCashFlow),
    segmentos: (a.revenueSegmentsByAxis ?? null) as AnoHistorico["segmentos"],
  }))
  const ultimoAnual = anuais[anuais.length - 1]
  const recente = trimestres[0]

  // Dados de mercado: preço, beta (perfil FMP), taxa do Tesouro a 10 anos.
  const hoje = new Date()
  const ha15dias = new Date(hoje.getTime() - 15 * 86_400_000)
  const inicioPrecos = new Date(anuais[0].periodEnd.getTime() - 10 * 86_400_000)
  const [q, perfil, tesouro, a, serie] = await Promise.all([
    cotacao(company.ticker),
    get<Array<{ beta?: number }>>("profile", { symbol: simbolo(company.ticker) }, 86_400),
    get<Array<{ date: string; year10?: number }>>(
      "treasury-rates",
      { from: ha15dias.toISOString().slice(0, 10), to: hoje.toISOString().slice(0, 10) },
      6 * 3600,
    ),
    analistas(company.ticker, ultimoAnual.reportedCurrency ?? "USD", {
      fiscalYear: ultimoAnual.fiscalYear,
      periodEnd: ultimoAnual.periodEnd,
    }).catch(() => null),
    historicoPrecos(company.ticker, inicioPrecos).catch(() => []),
  ])

  // EV/EBITDA no fim de cada ano fiscal, para o analista ver a que múltiplos
  // a empresa negociou antes de escolher o de saída. EV = preço no fecho do
  // ano × ações diluídas + dívida − caixa + minoritários.
  const precoEm = (d: Date): number | null => {
    const alvo = d.toISOString().slice(0, 10)
    let r: number | null = null
    for (const x of serie) { if (x.date > alvo) break; r = x.close }
    return r
  }
  const multiplosHistoricos = anuais.map((f) => {
    const preco = precoEm(f.periodEnd)
    const acoes = n(f.sharesOutstanding)
    const ebitda = n(f.ebitda)
    const ev = preco && acoes ? preco * acoes + (n(f.totalDebt) ?? 0) - (n(f.cash) ?? 0) + (n(f.minorityInterest) ?? 0) : null
    return { fiscalYear: f.fiscalYear, evEbitda: ev !== null && ebitda && ebitda > 0 ? ev / ebitda : null }
  })
  const ultimaTaxa = Array.isArray(tesouro)
    ? [...tesouro].sort((x, y) => (x.date < y.date ? 1 : -1)).find((t) => typeof t.year10 === "number")
    : undefined

  const acoes = n(recente?.sharesOutstanding) ?? null
  const divida = n(recente?.totalDebt) ?? 0
  const caixa = n(recente?.cash) ?? 0
  const minoritarios = n(recente?.minorityInterest) ?? 0
  const soma4 = (k: "ebitda" | "interestExpense") =>
    trimestres.length === 4 && trimestres.every((t) => n(t[k]) !== null)
      ? trimestres.reduce((s, t) => s + (n(t[k]) ?? 0), 0)
      : null
  const ebitdaTtm = soma4("ebitda")
  const jurosTtm = soma4("interestExpense")
  const preco = q?.price ?? null
  const valorMercado = preco && acoes ? preco * acoes : null
  const ev = valorMercado !== null ? valorMercado + divida - caixa : null

  return NextResponse.json(
    {
      empresa: {
        ticker: company.ticker, nome: company.name, setor: company.sector, industria: company.industry,
        logoUrl: company.logoUrl,
        // Bancos, seguradoras, corretoras: FCFF não mede nada (o balanço é
        // o negócio). A MSCI ou a Visa, apesar do setor, entram no modelo.
        financeira: !modeloFcffAplicavel(company.sector, company.industry, company.ticker),
      },
      historico,
      multiplosHistoricos,
      estimativas: (a?.anuais ?? []).map((e) => ({
        fiscalYear: e.fiscalYear, revenueAvg: e.revenueAvg, revenueLow: e.revenueLow, revenueHigh: e.revenueHigh,
        ebitAvg: e.ebitAvg, ebitdaAvg: e.ebitdaAvg, epsAvg: e.epsAvg, analistas: e.analistas,
      })),
      mercado: {
        preco,
        acoes,
        dividaTotal: divida,
        caixa,
        interessesMinoritarios: minoritarios,
        dataBalanco: recente ? recente.periodEnd.toISOString().slice(0, 10) : null,
      },
      contexto: {
        rf: ultimaTaxa?.year10 != null ? ultimaTaxa.year10 / 100 : null,
        dataRf: ultimaTaxa?.date ?? null,
        beta: typeof perfil?.[0]?.beta === "number" ? perfil[0].beta : null,
        custoDivida: jurosTtm !== null && divida > 0 ? Math.abs(jurosTtm) / divida : null,
        evEbitdaAtual: ev !== null && ebitdaTtm && ebitdaTtm > 0 ? ev / ebitdaTtm : null,
      },
    },
    { headers: { "Cache-Control": CACHE_PRIVADO } },
  )
}
