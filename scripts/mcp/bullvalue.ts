/**
 * Servidor MCP local da BullValue, para o Claude Desktop.
 *
 *   npx tsx scripts/mcp/bullvalue.ts        (o Claude Desktop arranca-o sozinho)
 *
 * ── Porque é local ────────────────────────────────────────────────────────
 *
 * Dá ao Claude os MESMOS números que a plataforma mostra — fundamentais já
 * corrigidos (USD, zeros da FMP como N/A, EPS ajustado a splits, segmentos
 * verificados), valuation e projeções de analistas — sem passar pelo site
 * nem pelo Supabase:
 *
 *   · fundamentais e segmentos → a base PostgreSQL LOCAL (DATABASE_URL do
 *     .env.local), alimentada pelos mesmos scripts FMP da produção;
 *   · preços, estimativas, resultados, notícias → a FMP, com a chave local.
 *
 * ── Regras ────────────────────────────────────────────────────────────────
 *
 *   · stdout é o canal do protocolo MCP: nada de console.log aqui (só
 *     console.error, que vai para os logs do Claude Desktop).
 *   · Nunca devolver segredos: nenhuma ferramenta lê ou expõe o ambiente.
 *   · Recusa arrancar contra uma base que não seja local — este servidor é
 *     para o Mac do Costa, e ler a produção por engano gastava egress.
 */
import * as dotenv from "dotenv"
import * as path from "node:path"

const RAIZ = path.resolve(__dirname, "..", "..")
dotenv.config({ path: path.join(RAIZ, ".env.local"), override: true, quiet: true })
dotenv.config({ path: path.join(RAIZ, ".env"), quiet: true })

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { PrismaClient, type Fundamental } from "@prisma/client"
import { cotacao, cotacoes, historico, noticias, amostrar, semanal, modoEstritoFmp, FmpLimite } from "../../lib/fmp/mercado"
import { analistas } from "../../lib/fmp/estimativas"
import { resultadosDe } from "../../lib/fmp/calendario"

const url = process.env.DATABASE_URL ?? ""
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("[bullvalue-mcp] DATABASE_URL não aponta para uma base local — a recusar arrancar.")
  process.exit(1)
}
if (!process.env.FMP_API_KEY) {
  console.error("[bullvalue-mcp] FMP_API_KEY em falta no .env.local.")
  process.exit(1)
}

const prisma = new PrismaClient()
modoEstritoFmp(true)

// ─── Utilitários ───────────────────────────────────────────────────────────

const n = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const x = typeof v === "object" && v !== null && "toNumber" in v ? (v as { toNumber(): number }).toNumber() : Number(v)
  return Number.isFinite(x) ? x : null
}
const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100)
const r4 = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000)
const div = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? a / b : null)

function resposta(dados: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(dados, null, 1) }] }
}
function erro(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true }
}

/**
 * Só empresas ativas: a base local ainda guarda europeias inativas de uma
 * experiência antiga (L'Oréal, LVMH…) com dados pré-FMP que o site não mostra.
 */
/**
 * Logo público da FMP (PNG, sem chave). Cobre empresas que não têm logo na
 * base (ex.: Novo Nordisk) e deixa o Claude pô-los nas apresentações.
 */
const logo = (ticker: string) => `https://images.financialmodelingprep.com/symbol/${ticker.toUpperCase().replace(/\./g, "-")}.png`

async function empresa(ticker: string) {
  const c = await prisma.company.findUnique({ where: { ticker: ticker.trim().toUpperCase() } })
  return c && c.isActive ? c : null
}

/** Campos de fluxo (somam-se em TTM) e de stock (usa-se o último). */
const FLUXOS = [
  "revenue", "costOfRevenue", "grossProfit", "operatingExpenses", "researchAndDevelopment",
  "sellingGeneralAndAdmin", "ebitda", "operatingIncome", "interestExpense", "taxExpense", "netIncome",
  "epsDiluted", "incomeBeforeTax", "depreciationAndAmortization", "operatingCashFlow", "capex",
  "freeCashFlow", "investingCashFlow", "financingCashFlow", "stockBasedCompensation",
  "shareRepurchases", "dividendsPaid", "netChangeInCash", "dividendPerShare",
] as const
const STOCKS = [
  "cash", "totalCurrentAssets", "accountsReceivable", "inventory", "propertyPlantEquipment",
  "goodwillAndIntangibles", "totalAssets", "accountsPayable", "shortTermDebt", "totalCurrentLiab",
  "longTermDebt", "totalDebt", "totalLiabilities", "retainedEarnings", "totalEquity", "minorityInterest",
  "sharesOutstanding",
] as const

type Linha = Record<string, number | string | null>

function limpar(f: Fundamental): Linha {
  const out: Linha = {
    periodo: f.periodType === "ANNUAL" ? `FY${f.fiscalYear}` : `Q${f.fiscalQuarter} FY${f.fiscalYear}`,
    fimDoPeriodo: f.periodEnd.toISOString().slice(0, 10),
  }
  for (const k of [...FLUXOS, ...STOCKS]) out[k] = n((f as unknown as Record<string, unknown>)[k])
  out.grossMargin = r4(n(f.grossMargin))
  out.operatingMargin = r4(n(f.operatingMargin))
  out.netMargin = r4(n(f.netMargin))
  out.roic = r4(n(f.roic))
  out.returnOnEquity = r4(n(f.returnOnEquity))
  out.moedaDeReporte = f.reportedCurrency
  return out
}

/** TTM: soma dos últimos 4 trimestres nos fluxos, último valor nos stocks. */
function ttm(trimestres: Fundamental[]): Linha | null {
  const ult = trimestres.slice(-4)
  if (ult.length < 4) return null
  const out: Linha = { periodo: `TTM até Q${ult[3].fiscalQuarter} FY${ult[3].fiscalYear}`, fimDoPeriodo: ult[3].periodEnd.toISOString().slice(0, 10) }
  for (const k of FLUXOS) {
    const vals = ult.map((q) => n((q as unknown as Record<string, unknown>)[k])).filter((v): v is number => v !== null)
    out[k] = vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0)
  }
  for (const k of STOCKS) out[k] = n((ult[3] as unknown as Record<string, unknown>)[k])
  const rev = out.revenue as number | null
  out.grossMargin = r4(rev && rev > 0 ? div(out.grossProfit as number | null, rev) : null)
  out.operatingMargin = r4(rev && rev > 0 ? div(out.operatingIncome as number | null, rev) : null)
  out.netMargin = r4(rev && rev > 0 ? div(out.netIncome as number | null, rev) : null)
  return out
}

async function linhas(companyId: string) {
  return prisma.fundamental.findMany({ where: { companyId }, orderBy: { periodEnd: "asc" } })
}

/** Os mesmos cálculos do snapshot da página de ação (components/stock/StockSnapshot.tsx). */
async function calcularValuation(ticker: string) {
  const c = await empresa(ticker)
  if (!c) return null
  const todas = await linhas(c.id)
  const trimestres = todas.filter((f) => f.periodType === "QUARTERLY")
  const anuais = todas.filter((f) => f.periodType === "ANNUAL")
  const base = ttm(trimestres) ?? (anuais.length ? limpar(anuais[anuais.length - 1]) : null)
  const q = await cotacao(c.ticker)
  if (!base) return { ticker: c.ticker, nome: c.name, preco: q?.price ?? null, aviso: "Sem fundamentais na base local." }

  const preco = q?.price ?? null
  const acoes = base.sharesOutstanding as number | null
  const mcap = preco && acoes ? preco * acoes : null
  const divida = (base.totalDebt as number | null) ?? 0
  const caixa = (base.cash as number | null) ?? 0
  const ev = mcap !== null ? mcap + divida - caixa : null
  const lucro = base.netIncome as number | null
  const receita = base.revenue as number | null
  const ebitda = base.ebitda as number | null
  const cp = base.totalEquity as number | null
  const fcf = base.freeCashFlow as number | null
  const dps = base.dividendPerShare as number | null

  const ultimoAnual = anuais[anuais.length - 1] ?? null
  const a = await analistas(c.ticker, ultimoAnual?.reportedCurrency ?? "USD",
    ultimoAnual ? { fiscalYear: ultimoAnual.fiscalYear, periodEnd: ultimoAnual.periodEnd } : null)
  const fwdOk = a?.ntm && a.ltm && a.analistasEps >= 3
  const peFwd = fwdOk && mcap && a!.ntm!.netIncome > 0 ? mcap / a!.ntm!.netIncome : null
  const epsGrowth = fwdOk && a!.ltm!.eps > 0 ? a!.ntm!.eps / a!.ltm!.eps - 1 : null

  return {
    ticker: c.ticker,
    nome: c.name,
    logo: logo(c.ticker),
    baseDosFundamentais: base.periodo,
    preco: r2(preco),
    variacaoDiaPct: r2(q?.changePercentage ?? null),
    marketCap: mcap,
    enterpriseValue: ev,
    pe_ttm: r2(mcap && lucro && lucro > 0 ? mcap / lucro : null),
    pe_forward: r2(peFwd),
    peg_forward: r2(peFwd !== null && epsGrowth !== null && epsGrowth > 0 ? peFwd / (epsGrowth * 100) : null),
    crescimentoEpsEsperado_12m: r4(epsGrowth),
    crescimentoReceitaEsperado_12m: r4(fwdOk && a!.ltm!.revenue > 0 ? a!.ntm!.revenue / a!.ltm!.revenue - 1 : null),
    priceToSales: r2(mcap && receita && receita > 0 ? mcap / receita : null),
    evToEbitda: r2(ev && ebitda && ebitda > 0 ? ev / ebitda : null),
    evToEbitda_forward: r2(fwdOk && ev && a!.ntm!.ebitda > 0 ? ev / a!.ntm!.ebitda : null),
    priceToBook: r2(mcap && cp && cp > 0 ? mcap / cp : null),
    fcfYield: r4(mcap && fcf !== null ? fcf / mcap : null),
    dividendYield: r4(preco && dps && dps > 0 ? dps / preco : null),
    dividaLiquida: divida - caixa,
    analistasNoConsenso: a?.analistasEps ?? 0,
    notas: [
      "Valores em USD. Rácios e margens em decimal (0.25 = 25%).",
      "P/E TTM usa lucro contabilístico (GAAP); P/E forward usa o consenso de lucro AJUSTADO dos analistas para os próximos 12 meses — a diferença entre os dois não é só crescimento.",
      "Métricas forward ficam null com menos de 3 analistas.",
    ],
  }
}

// ─── Servidor ──────────────────────────────────────────────────────────────

/** Uma falha numa ferramenta vira mensagem clara para o Claude, nunca um "sem dados" falso. */
function seguro<A>(fn: (args: A) => Promise<ReturnType<typeof resposta> | ReturnType<typeof erro>>) {
  return async (args: A) => {
    try {
      return await fn(args)
    } catch (e) {
      if (e instanceof FmpLimite) return erro(e.message)
      console.error("[bullvalue-mcp]", e)
      return erro(`Erro ao obter os dados: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

const server = new McpServer(
  { name: "bullvalue", version: "1.0.0" },
  {
    instructions:
      "Dados financeiros da BullValue (S&P 500 e algumas estrangeiras), os mesmos que a plataforma mostra. " +
      "Tudo em USD. null significa 'sem dado' — nunca o trates como zero. Margens e rácios em decimal. " +
      "EPS dos analistas é ajustado; o EPS histórico é contabilístico. Cita os números como vêm; não inventes os que faltam.",
  },
)

server.registerTool(
  "pesquisar_empresas",
  {
    title: "Pesquisar empresas",
    description: "Procura empresas cobertas pela BullValue por ticker ou nome. Devolve ticker, nome, setor e indústria.",
    inputSchema: { consulta: z.string().min(1).describe("Ticker ou parte do nome, ex.: 'MSCI', 'novo nordisk'") },
  },
  seguro(async ({ consulta }) => {
    const q = consulta.trim()
    const rows = await prisma.company.findMany({
      where: {
        isActive: true,
        ticker: { not: { startsWith: "^" } },
        OR: [{ ticker: { contains: q.toUpperCase() } }, { name: { contains: q, mode: "insensitive" } }],
      },
      select: { ticker: true, name: true, sector: true, industry: true, exchange: true },
      take: 15,
      orderBy: { ticker: "asc" },
    })
    return resposta(rows.map((r) => ({ ...r, logo: logo(r.ticker) })))
  }),
)

server.registerTool(
  "perfil_empresa",
  {
    title: "Perfil da empresa",
    description: "Descrição do negócio, setor, indústria, sede, website, nº de trabalhadores e cotação atual.",
    inputSchema: { ticker: z.string().describe("Ticker, ex.: AAPL") },
  },
  seguro(async ({ ticker }) => {
    const c = await empresa(ticker)
    if (!c) return erro(`Empresa ${ticker} não está na base da BullValue.`)
    const q = await cotacao(c.ticker)
    return resposta({
      ticker: c.ticker, nome: c.name, logo: logo(c.ticker), bolsa: c.exchange, setor: c.sector, industria: c.industry,
      pais: c.country, website: c.website, trabalhadores: c.employees, descricao: c.description,
      preco: q?.price ?? null, variacaoDiaPct: q?.changePercentage ?? null, marketCapFmp: q?.marketCap ?? null,
    })
  }),
)

server.registerTool(
  "fundamentais",
  {
    title: "Demonstrações financeiras",
    description:
      "Demonstração de resultados, balanço e cash flow (até 10 anos), já corrigidos pela BullValue. " +
      "periodo: 'anual', 'trimestral' ou 'ttm' (últimos 12 meses). Valores em USD.",
    inputSchema: {
      ticker: z.string(),
      periodo: z.enum(["anual", "trimestral", "ttm"]).default("anual"),
      anos: z.number().int().min(1).max(10).default(10).describe("Quantos anos de histórico"),
    },
  },
  seguro(async ({ ticker, periodo, anos }) => {
    const c = await empresa(ticker)
    if (!c) return erro(`Empresa ${ticker} não está na base da BullValue.`)
    const todas = await linhas(c.id)
    if (periodo === "ttm") {
      const t = ttm(todas.filter((f) => f.periodType === "QUARTERLY"))
      return t ? resposta({ ticker: c.ticker, nome: c.name, ttm: t }) : erro("Sem 4 trimestres na base para calcular o TTM.")
    }
    const tipo = periodo === "anual" ? "ANNUAL" : "QUARTERLY"
    const sel = todas.filter((f) => f.periodType === tipo).slice(-(periodo === "anual" ? anos : anos * 4))
    return resposta({ ticker: c.ticker, nome: c.name, unidades: "USD; margens em decimal", periodos: sel.map(limpar) })
  }),
)

server.registerTool(
  "valuation",
  {
    title: "Valuation atual",
    description:
      "Múltiplos com o preço ao vivo: P/E (TTM e forward), PEG, P/S, EV/EBITDA (TTM e forward), P/B, FCF yield, " +
      "dividend yield, dívida líquida e crescimento esperado pelos analistas. Mesmos cálculos da página da empresa.",
    inputSchema: { ticker: z.string() },
  },
  seguro(async ({ ticker }) => {
    const v = await calcularValuation(ticker)
    return v ? resposta(v) : erro(`Empresa ${ticker} não está na base da BullValue.`)
  }),
)

server.registerTool(
  "analistas",
  {
    title: "Projeções de analistas",
    description:
      "Consenso de analistas: estimativas anuais de receita e EPS (média, mínimo, máximo) para os próximos anos fiscais, " +
      "preço-alvo (mín./mediana/máx.) e recomendações Comprar/Manter/Vender com 12 meses de histórico. Em USD.",
    inputSchema: { ticker: z.string() },
  },
  seguro(async ({ ticker }) => {
    const c = await empresa(ticker)
    if (!c) return erro(`Empresa ${ticker} não está na base da BullValue.`)
    const ult = await prisma.fundamental.findFirst({ where: { companyId: c.id, periodType: "ANNUAL" }, orderBy: { periodEnd: "desc" } })
    const a = await analistas(c.ticker, ult?.reportedCurrency ?? "USD", ult ? { fiscalYear: ult.fiscalYear, periodEnd: ult.periodEnd } : null)
    if (!a) return erro(`Sem cobertura de analistas para ${c.ticker}.`)
    const q = await cotacao(c.ticker)
    return resposta({
      ticker: c.ticker,
      preco: q?.price ?? null,
      potencialAteAoAlvo: a.alvo && q?.price ? r4(a.alvo.consensus / q.price - 1) : null,
      ...a,
      notas: [
        "EPS estimado é AJUSTADO (sem custos pontuais); o ano fiscal corrente inclui os trimestres já reportados.",
        "Recomendações e rótulo de consenso calculados da distribuição do mês mais recente.",
      ],
    })
  }),
)

server.registerTool(
  "segmentos",
  {
    title: "Receita por segmento e geografia",
    description:
      "Receita por produto/segmento e por geografia, por período. Períodos em que os segmentos não somam à receita (±10%) " +
      "foram descartados por serem dados incompletos da fonte.",
    inputSchema: {
      ticker: z.string(),
      periodo: z.enum(["anual", "trimestral"]).default("anual"),
    },
  },
  seguro(async ({ ticker, periodo }) => {
    const c = await empresa(ticker)
    if (!c) return erro(`Empresa ${ticker} não está na base da BullValue.`)
    const rows = await prisma.fundamental.findMany({
      where: { companyId: c.id, periodType: periodo === "anual" ? "ANNUAL" : "QUARTERLY" },
      orderBy: { periodEnd: "asc" },
      select: { fiscalYear: true, fiscalQuarter: true, revenue: true, revenueSegmentsByAxis: true },
    })
    const out = rows
      .filter((r) => r.revenueSegmentsByAxis)
      .map((r) => {
        const ax = r.revenueSegmentsByAxis as { product?: Record<string, number> | null; geography?: Record<string, number> | null }
        return {
          periodo: r.fiscalQuarter ? `Q${r.fiscalQuarter} FY${r.fiscalYear}` : `FY${r.fiscalYear}`,
          receita: n(r.revenue),
          produto: ax.product ?? null,
          geografia: ax.geography ?? null,
        }
      })
    return out.length ? resposta({ ticker: c.ticker, unidades: "USD", periodos: out }) : erro(`Sem segmentos para ${c.ticker}.`)
  }),
)

server.registerTool(
  "precos",
  {
    title: "Histórico de preços",
    description:
      "Fechos ajustados (splits e dividendos não reinvestidos) desde uma data, reduzidos a ~260 pontos, e retornos " +
      "1M/6M/1A/3A/5A/10A com CAGR.",
    inputSchema: {
      ticker: z.string(),
      desde: z.string().optional().describe("YYYY-MM-DD; por omissão 10 anos"),
    },
  },
  seguro(async ({ ticker, desde }) => {
    const t = ticker.trim().toUpperCase()
    const serie = await historico(t, desde ? new Date(desde) : undefined)
    if (serie.length === 0) return erro(`Sem histórico de preços para ${t}.`)
    const ult = serie[serie.length - 1]
    const retorno = (dias: number) => {
      const alvo = new Date(new Date(ult.date).getTime() - dias * 86_400_000).toISOString().slice(0, 10)
      const p = serie.find((s) => s.date >= alvo)
      if (!p || p.date === ult.date) return null
      const anos = dias / 365.25
      const total = ult.close / p.close - 1
      return { desde: p.date, total: r4(total), cagr: anos >= 1 ? r4(Math.pow(1 + total, 1 / anos) - 1) : null }
    }
    return resposta({
      ticker: t,
      ultimo: ult,
      retornos: { "1M": retorno(30), "6M": retorno(182), "1A": retorno(365), "3A": retorno(1096), "5A": retorno(1826), "10A": retorno(3652) },
      serie: amostrar(semanal(serie), 260),
    })
  }),
)

server.registerTool(
  "comparar",
  {
    title: "Comparar empresas",
    description: "Valuation lado a lado de várias empresas (máx. 10), com os mesmos cálculos da ferramenta 'valuation'.",
    inputSchema: { tickers: z.array(z.string()).min(2).max(10) },
  },
  seguro(async ({ tickers }) => {
    const res = await Promise.all(
      tickers.map((t) =>
        calcularValuation(t)
          .then((v) => v ?? { ticker: t, aviso: "não está na base da BullValue" })
          .catch((e) => ({ ticker: t, aviso: e instanceof Error ? e.message : String(e) })),
      ),
    )
    return resposta(res)
  }),
)

server.registerTool(
  "resultados_trimestrais",
  {
    title: "Resultados vs estimativas",
    description: "Histórico de resultados trimestrais: EPS e receita reais vs estimados (bateu/falhou) e a próxima data de resultados.",
    inputSchema: { ticker: z.string() },
  },
  seguro(async ({ ticker }) => {
    const rs = await resultadosDe(ticker.trim().toUpperCase())
    return rs.length ? resposta(rs.map((r) => ({
      ...r,
      surpresaEps: r.epsActual != null && r.epsEstimate ? r4(r.epsActual / r.epsEstimate - 1) : null,
    }))) : erro("Sem histórico de resultados.")
  }),
)

server.registerTool(
  "noticias",
  {
    title: "Notícias recentes",
    description: "Notícias recentes sobre a empresa (título, resumo, fonte, data, URL).",
    inputSchema: { ticker: z.string(), dias: z.number().int().min(1).max(60).default(14) },
  },
  seguro(async ({ ticker, dias }) => {
    const ns = await noticias(ticker.trim().toUpperCase(), dias)
    return resposta(ns.slice(0, 25).map((x) => ({
      data: new Date(x.datetime * 1000).toISOString().slice(0, 10), titulo: x.headline, resumo: x.summary, fonte: x.source, url: x.url,
    })))
  }),
)

server.registerTool(
  "cotacoes",
  {
    title: "Cotações atuais",
    description: "Preço atual, variação do dia e market cap de vários tickers numa só chamada.",
    inputSchema: { tickers: z.array(z.string()).min(1).max(100) },
  },
  seguro(async ({ tickers }) => {
    const m = await cotacoes(tickers.map((t) => t.trim().toUpperCase()))
    return resposta([...m.values()].map((q) => ({ ticker: q.ticker, logo: logo(q.ticker), preco: q.price, variacaoDiaPct: q.changePercentage, marketCap: q.marketCap })))
  }),
)

async function main() {
  await server.connect(new StdioServerTransport())
  console.error("[bullvalue-mcp] pronto")
}

main().catch((e) => {
  console.error("[bullvalue-mcp]", e)
  process.exit(1)
})
