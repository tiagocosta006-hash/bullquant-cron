import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exigirPro, CACHE_PRIVADO } from "@/lib/api/acessoPro"
import { normalizarTicker } from "@/lib/ticker"
import { cotacao, historico } from "@/lib/fmp/mercado"
import { analistas } from "@/lib/fmp/estimativas"

/**
 * GET /api/dcf/simples/[ticker]
 *
 * Os dados do DCF simples (estilo Qualtrim): EPS e FCF por ação dos últimos
 * 10 anos e TTM, o preço no fim de cada ano fiscal (para os múltiplos P/E e
 * P/FCF históricos) e o crescimento que o consenso dos analistas implica.
 *
 * O crescimento do consenso calcula-se só entre estimativas (ano fiscal 1 →
 * 3): as estimativas usam lucro AJUSTADO e o nosso histórico é contabilístico;
 * comparar um com o outro misturava bases.
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
    select: { id: true, ticker: true, name: true, sector: true, industry: true, isActive: true },
  })
  if (!company || !company.isActive) return NextResponse.json({ error: "Company not found" }, { status: 404 })

  const [anuais, trimestres] = await Promise.all([
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "ANNUAL" },
      orderBy: { periodEnd: "desc" },
      take: 11,
      select: { fiscalYear: true, periodEnd: true, epsDiluted: true, freeCashFlow: true, sharesOutstanding: true, reportedCurrency: true },
    }),
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: "QUARTERLY" },
      orderBy: { periodEnd: "desc" },
      take: 4,
      select: { epsDiluted: true, freeCashFlow: true, sharesOutstanding: true },
    }),
  ])
  if (anuais.length < 2) return NextResponse.json({ error: "Histórico insuficiente" }, { status: 404 })
  anuais.reverse()
  const ultimo = anuais[anuais.length - 1]

  const desde = new Date(anuais[0].periodEnd.getTime() - 10 * 86_400_000)
  const [q, serie, a] = await Promise.all([
    cotacao(company.ticker),
    historico(company.ticker, desde),
    analistas(company.ticker, ultimo.reportedCurrency ?? "USD", { fiscalYear: ultimo.fiscalYear, periodEnd: ultimo.periodEnd }).catch(() => null),
  ])

  /** Último fecho até à data (inclusive). A série vem ordenada por data. */
  const precoEm = (d: Date): number | null => {
    const alvo = d.toISOString().slice(0, 10)
    let r: number | null = null
    for (const p of serie) {
      if (p.date > alvo) break
      r = p.close
    }
    return r
  }

  const hist = anuais.map((f) => {
    const eps = n(f.epsDiluted)
    const fcf = n(f.freeCashFlow)
    const acoes = n(f.sharesOutstanding)
    const fcfps = fcf !== null && acoes ? fcf / acoes : null
    const preco = precoEm(f.periodEnd)
    return {
      fiscalYear: f.fiscalYear,
      periodEnd: f.periodEnd.toISOString().slice(0, 10),
      eps,
      fcfPerShare: fcfps,
      preco,
      pe: preco && eps && eps > 0 ? preco / eps : null,
      pfcf: preco && fcfps && fcfps > 0 ? preco / fcfps : null,
    }
  })

  // TTM: soma dos últimos 4 trimestres; FCF por ação com as ações do último.
  const soma = (k: "epsDiluted" | "freeCashFlow") =>
    trimestres.length === 4 && trimestres.every((t) => n(t[k]) !== null) ? trimestres.reduce((s, t) => s + (n(t[k]) ?? 0), 0) : null
  const epsTtm = soma("epsDiluted")
  const fcfTtm = soma("freeCashFlow")
  const acoesRecentes = n(trimestres[0]?.sharesOutstanding)
  const fcfpsTtm = fcfTtm !== null && acoesRecentes ? fcfTtm / acoesRecentes : null
  const preco = q?.price ?? null

  const est = a?.anuais ?? []
  const g = (k: "epsAvg" | "revenueAvg") => {
    if (est.length < 2) return null
    const i = est[0][k], f = est[est.length - 1][k], anos = est.length - 1
    return i > 0 && f > 0 ? Math.pow(f / i, 1 / anos) - 1 : null
  }

  return NextResponse.json(
    {
      empresa: { ticker: company.ticker, nome: company.name, setor: company.sector, industria: company.industry },
      preco,
      historico: hist,
      ttm: {
        eps: epsTtm,
        fcfPerShare: fcfpsTtm,
        pe: preco && epsTtm && epsTtm > 0 ? preco / epsTtm : null,
        pfcf: preco && fcfpsTtm && fcfpsTtm > 0 ? preco / fcfpsTtm : null,
      },
      consenso: { epsGrowth: g("epsAvg"), revenueGrowth: g("revenueAvg"), analistas: est[0]?.analistas ?? 0, anos: est.length },
    },
    { headers: { "Cache-Control": CACHE_PRIVADO } },
  )
}
