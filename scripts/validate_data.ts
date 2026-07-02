#!/usr/bin/env tsx
/**
 * validate_data.ts — Prova o que está correto, errado e em falta na BD.
 *
 * Corre: tsx --env-file .env.local scripts/validate_data.ts
 * Output: tsx --env-file .env.local scripts/validate_data.ts > validation-report.md
 *
 * Secções:
 *   §1 Coverage     — quem tem dados e quem não tem
 *   §2 Math Proofs  — consistência interna dos campos calculados
 *   §3 Anchors      — TODOS os campos vs 10-K publicados (AAPL, MSFT, GOOGL, NVDA)
 *   §4 Null Map     — quais campos estão mais vazios
 *   §5 Sanity       — valores impossíveis ou suspeitos
 *   §6 Prices       — cobertura e frescura dos preços EOD
 *   §7 Actions      — o que corrigir por ordem de prioridade
 */

import { PrismaClient, PeriodType } from '@prisma/client'
// Env vars: tsx --env-file .env.local  (Node 20+ nativo, sem dotenv)

const prisma = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null) => {
  if (n === null) return 'NULL'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(3)}T`
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  return `${n.toFixed(4)}`
}

const pct  = (n: number | null) => n === null ? 'NULL' : `${(n * 100).toFixed(2)}%`
const pass = (ok: boolean) => ok ? '✅ PASS' : '❌ FAIL'
const rdiff = (actual: number, expected: number) =>
  Math.abs((actual - expected) / (Math.abs(expected) || 1))

// ── Anchor table — valores dos 10-K SEC publicados ───────────────────────────
// Fonte: SEC EDGAR filings / investor relations
// Tolerância padrão: 5% para variações de XBRL/arredondamento
// "null" = não verificado (dado não disponível com confiança suficiente)

interface Anchor {
  ticker: string
  fiscalYear: number
  note?: string
  // Income Statement
  revenue:           number
  costOfRevenue:     number | null
  grossProfit:       number | null
  operatingExpenses: number | null  // R&D + SG&A (abaixo da gross profit line)
  operatingIncome:   number | null  // EBIT
  interestExpense:   number | null
  taxExpense:        number | null
  netIncome:         number
  epsDiluted:        number | null  // USD por ação
  sharesOutstanding: number | null  // diluted weighted avg
  // Cash Flow
  operatingCashFlow: number | null
  capex:             number | null  // sempre positivo
  freeCashFlow:      number | null
  // Balance Sheet
  totalAssets:       number | null
  totalCurrentLiab:  number | null
  longTermDebt:      number | null
  totalDebt:         number | null  // current + long-term
  cash:              number | null  // cash & equivalents only
  totalEquity:       number | null
  // Ratios calculados (Decimal(8,6) na BD, ex: 0.4413 = 44.13%)
  grossMargin:       number | null
  operatingMargin:   number | null
  netMargin:         number | null
  // dividends
  dividendPerShare:  number | null
  // ROIC / ROE — tolerância alargada porque a fórmula pode variar
  roic:              number | null
  returnOnEquity:    number | null
}

const ANCHORS: Anchor[] = [

  // ── APPLE FY2023 (fiscal year ending Sep 30, 2023) ─────────────────────────
  // Fonte: Apple 10-K FY2023
  {
    ticker: 'AAPL', fiscalYear: 2023,
    // Income Statement
    revenue:           383_285_000_000,
    costOfRevenue:     214_137_000_000,
    grossProfit:       169_148_000_000,
    operatingExpenses:  54_847_000_000,  // R&D 29,915 + SG&A 24,932
    operatingIncome:   114_301_000_000,
    interestExpense:     3_933_000_000,
    // 10-K: income before taxes 113,736 − net income 96,995 = 16,741
    taxExpense:         16_741_000_000,
    netIncome:          96_995_000_000,
    epsDiluted:                   6.16,
    sharesOutstanding: 15_744_231_000,   // diluted weighted avg shares
    // Cash Flow
    operatingCashFlow: 110_543_000_000,
    capex:              10_959_000_000,
    freeCashFlow:       99_584_000_000,
    // Balance Sheet (as of Sep 30, 2023)
    totalAssets:       352_583_000_000,
    totalCurrentLiab:  145_308_000_000,
    longTermDebt:       95_281_000_000,
    // current 9,807 + long-term 95,281 + commercial paper 5,985
    totalDebt:         111_073_000_000,
    // BD guarda cash + short-term investments (decisão de produto, não bug):
    // 29,965 equivalents + 31,590 marketable securities current
    cash:               61_555_000_000,
    // StockholdersEquity GAAP como reportado no 10-K (já líquido de treasury
    // stock — a Apple retira as ações recompradas, nem tem TreasuryStockValue).
    totalEquity:        62_146_000_000,
    // Ratios
    grossMargin:          0.44131,       // 169148/383285
    operatingMargin:      0.29815,       // 114301/383285
    netMargin:            0.25306,       // 96995/383285
    dividendPerShare:          0.94,     // FY2023: 4×$0.235
    roic:                     null,      // skip — Apple negative equity distorts fórmula
    returnOnEquity:           null,      // skip — negative equity
  },

  // ── MICROSOFT FY2023 (fiscal year ending Jun 30, 2023) ─────────────────────
  // Fonte: Microsoft 10-K FY2023
  {
    ticker: 'MSFT', fiscalYear: 2023,
    revenue:           211_915_000_000,
    costOfRevenue:      65_863_000_000,
    grossProfit:       146_052_000_000,
    operatingExpenses:  57_529_000_000,  // R&D 27,195 + SG&A 24,456 + outros
    operatingIncome:    88_523_000_000,
    interestExpense:     1_943_000_000,
    // 10-K: income before taxes 89,311 − net income 72,361 = 16,950
    taxExpense:         16_950_000_000,
    netIncome:          72_361_000_000,
    epsDiluted:                   9.72,
    sharesOutstanding:  7_469_000_000,   // diluted weighted avg
    operatingCashFlow:  87_582_000_000,
    capex:              28_107_000_000,
    freeCashFlow:       59_475_000_000,
    totalAssets:       411_976_000_000,
    totalCurrentLiab:  104_149_000_000,
    longTermDebt:       41_990_000_000,
    totalDebt:          47_322_000_000,  // current 5,247 + LT 41,990 + others ≈ 47,322
    // cash + ST investments: 34,704 equivalents + 76,558 short-term investments
    cash:              111_262_000_000,
    totalEquity:       206_223_000_000,
    grossMargin:          0.68921,
    operatingMargin:      0.41772,
    netMargin:            0.34145,
    dividendPerShare:          2.72,
    roic:                     null,      // skip — não verificado com confiança
    returnOnEquity:       0.3570,        // 72361/206223 ≈ 35%... mas ROE usa avg equity
  },

  // ── ALPHABET FY2023 (fiscal year ending Dec 31, 2023) ──────────────────────
  // Fonte: Alphabet 10-K FY2023
  {
    ticker: 'GOOGL', fiscalYear: 2023,
    revenue:           307_394_000_000,
    costOfRevenue:     133_332_000_000,
    grossProfit:       174_062_000_000,
    operatingExpenses:  89_769_000_000,  // R&D 45,427 + SG&A 26,838 + outros
    operatingIncome:    84_293_000_000,
    interestExpense:         null,        // Alphabet tem mais interest income do que expense
    taxExpense:         11_922_000_000,
    netIncome:          73_795_000_000,
    epsDiluted:                   5.80,
    sharesOutstanding: 12_787_000_000,   // diluted weighted avg
    operatingCashFlow: 101_746_000_000,
    capex:              32_251_000_000,
    freeCashFlow:       69_495_000_000,
    totalAssets:       402_392_000_000,
    totalCurrentLiab:   81_814_000_000,
    longTermDebt:       13_253_000_000,
    totalDebt:          13_253_000_000,  // Alphabet tem pouca dívida
    // cash + ST investments: 24,048 equivalents + 86,868 marketable securities
    cash:              110_916_000_000,
    totalEquity:       283_379_000_000,
    grossMargin:          0.56623,
    operatingMargin:      0.27419,
    netMargin:            0.24006,
    dividendPerShare:          null,     // Alphabet não paga dividendos
    roic:                     null,
    returnOnEquity:       0.2602,        // 73795/283379 ≈ 26%
  },

  // ── NVIDIA FY2024 (fiscal year ending Jan 28, 2024) ────────────────────────
  // Fonte: NVIDIA 10-K FY2024
  {
    ticker: 'NVDA', fiscalYear: 2024,
    revenue:            60_922_000_000,
    costOfRevenue:      16_621_000_000,
    grossProfit:        44_301_000_000,
    // R&D 8,675 + SG&A 2,654 = gross profit 44,301 − operating income 32,972
    operatingExpenses:  11_329_000_000,
    operatingIncome:    32_972_000_000,
    interestExpense:         270_000_000,
    taxExpense:          4_042_000_000,
    netIncome:          29_760_000_000,
    // Base pós-split 10:1 (Jun 2024): EDGAR devolve o filing mais recente,
    // que reapresenta FY2024 retroativamente. 24,690M × $1.193 ≈ net income ✓
    epsDiluted:                   1.193,
    sharesOutstanding: 24_690_000_000,   // diluted weighted avg (post-split)
    operatingCashFlow:  28_083_000_000,
    capex:               1_069_000_000,
    freeCashFlow:       27_014_000_000,
    totalAssets:        65_728_000_000,
    totalCurrentLiab:   10_631_000_000,
    longTermDebt:        8_459_000_000,
    totalDebt:           9_709_000_000,  // LT 8,459 + current 1,250
    // cash + ST investments: 7,280 equivalents + 18,704 marketable securities
    cash:               25_984_000_000,
    totalEquity:        42_978_000_000,
    grossMargin:          0.72720,
    operatingMargin:      0.54123,
    netMargin:            0.48865,
    dividendPerShare:          0.016,    // NVDA paga dividendos pequenos
    roic:                     null,
    returnOnEquity:       0.6924,        // ~69%
  },

]

// Campos e como os apresentar no output
const FIELDS: Array<{
  key: keyof Anchor
  label: string
  format: (v: number) => string
  tol?: number    // tolerância custom se diferente de 5%
}> = [
  // Income
  { key: 'revenue',           label: 'Revenue',           format: fmt },
  { key: 'costOfRevenue',     label: 'Cost of Revenue',   format: fmt },
  { key: 'grossProfit',       label: 'Gross Profit',      format: fmt },
  { key: 'operatingExpenses', label: 'Operating Expenses',format: fmt },
  { key: 'operatingIncome',   label: 'Operating Income',  format: fmt },
  { key: 'interestExpense',   label: 'Interest Expense',  format: fmt },
  { key: 'taxExpense',        label: 'Tax Expense',       format: fmt },
  { key: 'netIncome',         label: 'Net Income',        format: fmt },
  { key: 'epsDiluted',        label: 'EPS Diluted',       format: v => `$${v.toFixed(4)}` },
  { key: 'sharesOutstanding', label: 'Shares Outstanding',format: v => `${(v/1e6).toFixed(0)}M shares`, tol: 0.03 },
  // Cash Flow
  { key: 'operatingCashFlow', label: 'Operating CF',      format: fmt },
  { key: 'capex',             label: 'CapEx',             format: fmt },
  { key: 'freeCashFlow',      label: 'FCF',               format: fmt },
  // Balance Sheet
  { key: 'totalAssets',       label: 'Total Assets',      format: fmt },
  { key: 'totalCurrentLiab',  label: 'Current Liabilities',format: fmt },
  { key: 'longTermDebt',      label: 'Long-term Debt',    format: fmt },
  { key: 'totalDebt',         label: 'Total Debt',        format: fmt },
  { key: 'cash',              label: 'Cash & Equiv.',     format: fmt },
  { key: 'totalEquity',       label: 'Total Equity',      format: fmt },
  // Ratios (stored as Decimal(8,6))
  { key: 'grossMargin',       label: 'Gross Margin',      format: pct },
  { key: 'operatingMargin',   label: 'Operating Margin',  format: pct },
  { key: 'netMargin',         label: 'Net Margin',        format: pct },
  { key: 'returnOnEquity',    label: 'ROE',               format: pct, tol: 0.10 },
  { key: 'dividendPerShare',  label: 'Dividend/Share',    format: v => `$${v.toFixed(4)}`, tol: 0.10 },
]

const DEFAULT_TOL = 0.05

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString()
  console.log(`# Bull Metrics — Data Validation Report\n`)
  console.log(`> Generated: ${now}\n`)
  console.log(`---\n`)

  // ──────────────────────────────────────────────────────────────────────────
  // §1 COVERAGE
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §1 Coverage\n`)

  const totalCompanies  = await prisma.company.count({ where: { isActive: true } })
  const withFundamentals = await prisma.company.count({ where: { isActive: true, fundamentals: { some: {} } } })
  const withPrices      = await prisma.company.count({ where: { isActive: true, prices: { some: {} } } })
  const withBoth        = await prisma.company.count({ where: { isActive: true, fundamentals: { some: {} }, prices: { some: {} } } })

  console.log(`| Metric | Count | % |`)
  console.log(`|--------|-------|---|`)
  console.log(`| Active companies | ${totalCompanies} | 100% |`)
  console.log(`| With fundamentals | ${withFundamentals} | ${((withFundamentals/totalCompanies)*100).toFixed(1)}% |`)
  console.log(`| With prices | ${withPrices} | ${((withPrices/totalCompanies)*100).toFixed(1)}% |`)
  console.log(`| With both | ${withBoth} | ${((withBoth/totalCompanies)*100).toFixed(1)}% |`)
  console.log()

  const noFundamentals = await prisma.company.findMany({
    where: { isActive: true, fundamentals: { none: {} } },
    select: { ticker: true, name: true, cik: true },
    orderBy: { ticker: 'asc' },
  })
  if (noFundamentals.length > 0) {
    console.log(`**Companies with NO fundamentals:** ${noFundamentals.map(c => `${c.ticker} ${c.cik ? '' : '(no CIK)'}`).join(' · ')}\n`)
  }

  const depthBuckets = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
    SELECT
      CASE
        WHEN cnt = 0     THEN '0 rows'
        WHEN cnt <= 10   THEN '1–10 rows'
        WHEN cnt <= 20   THEN '11–20 rows'
        WHEN cnt <= 40   THEN '21–40 rows'
        ELSE '41+ rows'
      END AS bucket,
      COUNT(*) AS count
    FROM (
      SELECT c.id, COUNT(f.id) AS cnt
      FROM companies c
      LEFT JOIN fundamentals f ON f."companyId" = c.id
      WHERE c."isActive" = true
      GROUP BY c.id
    ) sub
    GROUP BY bucket
    ORDER BY MIN(cnt)
  `

  console.log(`### Rows per company (annual + quarterly)\n`)
  console.log(`| Range | Companies |`)
  console.log(`|-------|-----------|`)
  depthBuckets.forEach(b => console.log(`| ${b.bucket} | ${Number(b.count)} |`))
  console.log()

  // ──────────────────────────────────────────────────────────────────────────
  // §2 MATH PROOFS
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §2 Math Proofs — Internal Consistency (tolerance 2%)\n`)

  const allRows = await prisma.fundamental.findMany({
    where: { periodType: PeriodType.ANNUAL },
    select: {
      company: { select: { ticker: true } },
      fiscalYear: true,
      revenue: true, grossProfit: true, grossMargin: true,
      operatingIncome: true, operatingMargin: true,
      netIncome: true, netMargin: true,
      operatingCashFlow: true, capex: true, freeCashFlow: true,
    },
    take: 6000,
  })

  const checks = [
    { label: 'FCF = OCF − CapEx',          pass: 0, fail: 0, samples: [] as string[] },
    { label: 'Gross Margin = GP / Revenue', pass: 0, fail: 0, samples: [] as string[] },
    { label: 'Op Margin = OI / Revenue',    pass: 0, fail: 0, samples: [] as string[] },
    { label: 'Net Margin = NI / Revenue',   pass: 0, fail: 0, samples: [] as string[] },
  ]

  for (const row of allRows) {
    const r  = row.revenue           ? Number(row.revenue)           : null
    const gp = row.grossProfit       ? Number(row.grossProfit)       : null
    const gm = row.grossMargin       ? Number(row.grossMargin)       : null
    const oi = row.operatingIncome   ? Number(row.operatingIncome)   : null
    const om = row.operatingMargin   ? Number(row.operatingMargin)   : null
    const ni = row.netIncome         ? Number(row.netIncome)         : null
    const nm = row.netMargin         ? Number(row.netMargin)         : null
    const ocf = row.operatingCashFlow ? Number(row.operatingCashFlow) : null
    const cx  = row.capex            ? Number(row.capex)             : null
    const fcf = row.freeCashFlow     ? Number(row.freeCashFlow)      : null
    const t   = row.company.ticker

    // FCF
    if (ocf !== null && cx !== null && fcf !== null) {
      const exp = ocf - cx
      const d = rdiff(fcf, exp)
      if (d <= 0.02) checks[0].pass++
      else { checks[0].fail++; if (checks[0].samples.length < 3) checks[0].samples.push(`${t} FY${row.fiscalYear}: stored=${fmt(fcf)} expected=${fmt(exp)} (${(d*100).toFixed(1)}%)`) }
    }
    // Gross Margin
    if (r && r !== 0 && gp !== null && gm !== null) {
      const d = Math.abs(gp/r - gm)
      if (d <= 0.02) checks[1].pass++
      else { checks[1].fail++; if (checks[1].samples.length < 3) checks[1].samples.push(`${t} FY${row.fiscalYear}: stored=${pct(gm)} computed=${pct(gp/r)}`) }
    }
    // Op Margin
    if (r && r !== 0 && oi !== null && om !== null) {
      const d = Math.abs(oi/r - om)
      if (d <= 0.02) checks[2].pass++
      else { checks[2].fail++; if (checks[2].samples.length < 3) checks[2].samples.push(`${t} FY${row.fiscalYear}: stored=${pct(om)} computed=${pct(oi/r)}`) }
    }
    // Net Margin
    if (r && r !== 0 && ni !== null && nm !== null) {
      const d = Math.abs(ni/r - nm)
      if (d <= 0.02) checks[3].pass++
      else { checks[3].fail++; if (checks[3].samples.length < 3) checks[3].samples.push(`${t} FY${row.fiscalYear}: stored=${pct(nm)} computed=${pct(ni/r)}`) }
    }
  }

  console.log(`| Check | Pass | Fail | Pass rate |`)
  console.log(`|-------|------|------|-----------|`)
  checks.forEach(c => {
    const total = c.pass + c.fail
    console.log(`| ${c.label} | ${c.pass} | ${c.fail} | ${total ? ((c.pass/total)*100).toFixed(1) : 'N/A'}% |`)
  })
  console.log()
  checks.forEach(c => {
    if (c.samples.length > 0) {
      console.log(`**${c.label} failures:**`)
      c.samples.forEach(s => console.log(`- ${s}`))
      console.log()
    }
  })

  // ──────────────────────────────────────────────────────────────────────────
  // §3 ANCHOR VALUES — todos os campos vs 10-K publicados
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §3 Anchor Values — Todos os Campos vs SEC 10-K\n`)
  console.log(`Tolerância padrão: ±5% | Shares: ±3% | ROE/DPS: ±10%\n`)
  console.log(`> Valores NULL na BD = campo não ingerido para essa empresa/ano.\n`)

  let totalChecks = 0, totalPass = 0, totalFail = 0, totalNull = 0

  for (const anchor of ANCHORS) {
    const company = await prisma.company.findUnique({
      where: { ticker: anchor.ticker },
      select: { id: true },
    })

    if (!company) {
      console.log(`### ${anchor.ticker} FY${anchor.fiscalYear} — ❌ NOT IN DB\n`)
      continue
    }

    const row = await prisma.fundamental.findFirst({
      where: { companyId: company.id, periodType: PeriodType.ANNUAL, fiscalYear: anchor.fiscalYear },
    })

    if (!row) {
      console.log(`### ${anchor.ticker} FY${anchor.fiscalYear} — ❌ NO ANNUAL ROW IN DB\n`)
      continue
    }

    // Map DB row to plain numbers (null if DB null)
    const db: Partial<Record<keyof Anchor, number | null>> = {
      revenue:           row.revenue           ? Number(row.revenue)           : null,
      costOfRevenue:     row.costOfRevenue      ? Number(row.costOfRevenue)     : null,
      grossProfit:       row.grossProfit        ? Number(row.grossProfit)       : null,
      operatingExpenses: row.operatingExpenses  ? Number(row.operatingExpenses) : null,
      operatingIncome:   row.operatingIncome    ? Number(row.operatingIncome)   : null,
      interestExpense:   row.interestExpense    ? Number(row.interestExpense)   : null,
      taxExpense:        row.taxExpense         ? Number(row.taxExpense)        : null,
      netIncome:         row.netIncome          ? Number(row.netIncome)         : null,
      epsDiluted:        row.epsDiluted         ? Number(row.epsDiluted)        : null,
      sharesOutstanding: row.sharesOutstanding  ? Number(row.sharesOutstanding) : null,
      operatingCashFlow: row.operatingCashFlow  ? Number(row.operatingCashFlow) : null,
      capex:             row.capex              ? Number(row.capex)             : null,
      freeCashFlow:      row.freeCashFlow       ? Number(row.freeCashFlow)      : null,
      totalAssets:       row.totalAssets        ? Number(row.totalAssets)       : null,
      totalCurrentLiab:  row.totalCurrentLiab   ? Number(row.totalCurrentLiab)  : null,
      longTermDebt:      row.longTermDebt       ? Number(row.longTermDebt)      : null,
      totalDebt:         row.totalDebt          ? Number(row.totalDebt)         : null,
      cash:              row.cash               ? Number(row.cash)              : null,
      totalEquity:       row.totalEquity        ? Number(row.totalEquity)       : null,
      grossMargin:       row.grossMargin        ? Number(row.grossMargin)       : null,
      operatingMargin:   row.operatingMargin    ? Number(row.operatingMargin)   : null,
      netMargin:         row.netMargin          ? Number(row.netMargin)         : null,
      returnOnEquity:    row.returnOnEquity     ? Number(row.returnOnEquity)    : null,
      dividendPerShare:  row.dividendPerShare   ? Number(row.dividendPerShare)  : null,
    }

    console.log(`### ${anchor.ticker} FY${anchor.fiscalYear}${anchor.note ? ` (${anchor.note})` : ''}\n`)
    console.log(`| Campo | Esperado (10-K) | Na BD | Delta | Resultado |`)
    console.log(`|-------|-----------------|-------|-------|-----------|`)

    let companyPass = 0, companyFail = 0, companyNull = 0

    for (const field of FIELDS) {
      const expected = anchor[field.key] as number | null
      if (expected === null) continue  // campo não testado para esta empresa

      const actual = db[field.key] ?? null
      const tol = field.tol ?? DEFAULT_TOL

      if (actual === null) {
        companyNull++; totalNull++
        console.log(`| ${field.label} | ${field.format(expected)} | **NULL** | — | ⬜ NULL |`)
      } else {
        const d = rdiff(actual, expected)
        const ok = d <= tol
        if (ok) { companyPass++; totalPass++ } else { companyFail++; totalFail++ }
        totalChecks++
        console.log(`| ${field.label} | ${field.format(expected)} | ${field.format(actual)} | ${(d*100).toFixed(1)}% | ${pass(ok)} |`)
      }
    }
    console.log()
    console.log(`> ✅ ${companyPass} PASS · ❌ ${companyFail} FAIL · ⬜ ${companyNull} NULL\n`)
  }

  console.log(`### Sumário §3\n`)
  console.log(`| | Count |`)
  console.log(`|-|-------|`)
  console.log(`| ✅ PASS | ${totalPass} |`)
  console.log(`| ❌ FAIL | ${totalFail} |`)
  console.log(`| ⬜ NULL (campo em falta) | ${totalNull} |`)
  console.log(`| Total checks com dados | ${totalChecks} |`)
  console.log(`| **Pass rate geral** | **${totalChecks ? ((totalPass/totalChecks)*100).toFixed(1) : 'N/A'}%** |`)
  console.log()

  // ──────────────────────────────────────────────────────────────────────────
  // §4 NULL MAP
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §4 Null Map — Annual Rows\n`)

  const annualCount = await prisma.fundamental.count({ where: { periodType: PeriodType.ANNUAL } })

  const nullCounts = await prisma.$queryRaw<{ field: string; nulls: bigint }[]>`
    SELECT field, nulls FROM (VALUES
      ('revenue',           (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND revenue IS NULL)),
      ('costOfRevenue',     (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "costOfRevenue" IS NULL)),
      ('grossProfit',       (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "grossProfit" IS NULL)),
      ('grossMargin',       (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "grossMargin" IS NULL)),
      ('operatingExpenses', (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "operatingExpenses" IS NULL)),
      ('operatingIncome',   (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "operatingIncome" IS NULL)),
      ('operatingMargin',   (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "operatingMargin" IS NULL)),
      ('interestExpense',   (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "interestExpense" IS NULL)),
      ('taxExpense',        (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "taxExpense" IS NULL)),
      ('netIncome',         (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "netIncome" IS NULL)),
      ('netMargin',         (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "netMargin" IS NULL)),
      ('epsDiluted',        (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "epsDiluted" IS NULL)),
      ('sharesOutstanding', (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "sharesOutstanding" IS NULL)),
      ('operatingCashFlow', (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "operatingCashFlow" IS NULL)),
      ('capex',             (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND capex IS NULL)),
      ('freeCashFlow',      (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "freeCashFlow" IS NULL)),
      ('totalAssets',       (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "totalAssets" IS NULL)),
      ('totalCurrentLiab',  (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "totalCurrentLiab" IS NULL)),
      ('longTermDebt',      (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "longTermDebt" IS NULL)),
      ('totalDebt',         (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "totalDebt" IS NULL)),
      ('cash',              (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND cash IS NULL)),
      ('totalEquity',       (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "totalEquity" IS NULL)),
      ('roic',              (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND roic IS NULL)),
      ('returnOnEquity',    (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "returnOnEquity" IS NULL)),
      ('dividendPerShare',  (SELECT COUNT(*) FROM fundamentals WHERE "periodType"='ANNUAL' AND "dividendPerShare" IS NULL))
    ) AS t(field, nulls)
    ORDER BY nulls DESC
  `

  console.log(`Total annual rows: **${annualCount}**\n`)
  console.log(`| Campo | NULL | NULL% | Severidade |`)
  console.log(`|-------|------|-------|------------|`)
  nullCounts.forEach(r => {
    const p = annualCount > 0 ? Number(r.nulls) / annualCount * 100 : 0
    const sev = p > 50 ? '🔴 CRÍTICO' : p > 20 ? '🟡 MED' : '🟢 OK'
    console.log(`| ${r.field} | ${Number(r.nulls)} | ${p.toFixed(1)}% | ${sev} |`)
  })
  console.log()

  // ──────────────────────────────────────────────────────────────────────────
  // §5 SANITY RANGES
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §5 Sanity Ranges\n`)

  const negRevenue = await prisma.fundamental.findMany({
    where: { periodType: PeriodType.ANNUAL, revenue: { lt: 0 } },
    select: { company: { select: { ticker: true } }, fiscalYear: true, revenue: true },
    take: 10,
  })
  console.log(`**Negative Revenue:** ${negRevenue.length === 0 ? '✅ None' : negRevenue.map(r => `${r.company.ticker} FY${r.fiscalYear}`).join(', ')}\n`)

  const tinyRevenue = await prisma.fundamental.findMany({
    where: { periodType: PeriodType.ANNUAL, revenue: { gt: 0, lt: 10_000_000 }, fiscalYear: { gte: 2018 } },
    select: { company: { select: { ticker: true } }, fiscalYear: true, revenue: true },
    orderBy: { revenue: 'asc' },
    take: 20,
  })
  console.log(`**Revenue < $10M on S&P 500 (XBRL unit bug?):**`)
  if (tinyRevenue.length === 0) {
    console.log(`✅ None found.\n`)
  } else {
    const byTicker = new Map<string, string[]>()
    tinyRevenue.forEach(r => {
      const t = r.company.ticker
      if (!byTicker.has(t)) byTicker.set(t, [])
      byTicker.get(t)!.push(`FY${r.fiscalYear}=${fmt(Number(r.revenue))}`)
    })
    byTicker.forEach((years, ticker) => console.log(`- **${ticker}**: ${years.join(', ')}`))
    console.log()
  }

  const extremeMargins = await prisma.fundamental.findMany({
    where: {
      periodType: PeriodType.ANNUAL,
      OR: [
        { grossMargin: { gt: 1 } }, { grossMargin: { lt: -1 } },
        { netMargin:   { gt: 1 } }, { netMargin:   { lt: -2 } },
      ],
    },
    select: { company: { select: { ticker: true } }, fiscalYear: true, grossMargin: true, netMargin: true },
    orderBy: { fiscalYear: 'desc' },
    take: 20,
  })
  console.log(`**Extreme Margins (gross outside [-100%,100%] or net outside [-200%,100%]):**`)
  if (extremeMargins.length === 0) {
    console.log(`✅ None found.\n`)
  } else {
    console.log()
    console.log(`| Ticker | FY | Gross Margin | Net Margin |`)
    console.log(`|--------|----|-------------|------------|`)
    extremeMargins.forEach(r => {
      console.log(`| ${r.company.ticker} | ${r.fiscalYear} | ${pct(r.grossMargin ? Number(r.grossMargin) : null)} | ${pct(r.netMargin ? Number(r.netMargin) : null)} |`)
    })
    console.log()
    console.log(`> Bancos/seguradoras/REITs: margens extremas são esperadas pelo tipo de revenue XBRL usado.\n`)
  }

  const badShares = await prisma.fundamental.findMany({
    where: { periodType: PeriodType.ANNUAL, sharesOutstanding: { lte: 0 } },
    select: { company: { select: { ticker: true } }, fiscalYear: true, sharesOutstanding: true },
    take: 10,
  })
  console.log(`**Shares Outstanding ≤ 0:** ${badShares.length === 0 ? '✅ None' : badShares.map(r => `${r.company.ticker} FY${r.fiscalYear}`).join(', ')}\n`)

  // ──────────────────────────────────────────────────────────────────────────
  // §6 PRICE DATA
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §6 Price Data\n`)

  const totalPriceRows = await prisma.price.count()
  const priceStats = await prisma.$queryRaw<{ min_date: Date; max_date: Date; ticker_count: bigint }[]>`
    SELECT MIN(date) min_date, MAX(date) max_date, COUNT(DISTINCT ticker) ticker_count FROM prices
  `
  const ps = priceStats[0]
  const daysSince = ps.max_date
    ? Math.floor((Date.now() - ps.max_date.getTime()) / 86_400_000)
    : null

  console.log(`| Metric | Value | |`)
  console.log(`|--------|-------|-|`)
  console.log(`| Total price rows | ${totalPriceRows.toLocaleString()} | |`)
  console.log(`| Companies with prices | ${Number(ps.ticker_count)} | |`)
  console.log(`| Oldest date | ${ps.min_date?.toISOString().split('T')[0] ?? 'N/A'} | |`)
  console.log(`| Most recent date | ${ps.max_date?.toISOString().split('T')[0] ?? 'N/A'} | |`)
  console.log(`| Days since last update | ${daysSince ?? 'N/A'} | ${pass(daysSince !== null && daysSince <= 5)} |`)
  console.log()

  const noPrice = await prisma.company.findMany({
    where: { isActive: true, fundamentals: { some: {} }, prices: { none: {} } },
    select: { ticker: true },
    orderBy: { ticker: 'asc' },
  })
  if (noPrice.length > 0) {
    console.log(`**Fundamentals but no prices:** ${noPrice.map(c => c.ticker).join(', ')}\n`)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // §7 ACTION LIST
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`## §7 Action List\n`)

  const actions: string[] = []

  if (tinyRevenue.length > 0) {
    const tickers = [...new Set(tinyRevenue.map(r => r.company.ticker))].join(', ')
    actions.push(`**P1 — REITs com revenue errado** (${tickers}): O script usa tags XBRL de revenue genéricas que não existem para REITs. Adicionar ao \`ingest_fundamentals.py\` as tags \`RealEstateRevenueNet\`, \`RevenueFromLeases\`, \`RentalProperties\`. Re-ingerir estas empresas.`)
  }

  if (totalFail > 0) {
    actions.push(`**P2 — ${totalFail} campos falharam nos Anchor checks §3**: Ver tabela acima. Campos com FAIL sistemático precisam de revisão dos fallback tags no script de ingestão.`)
  }

  if (totalNull > 0) {
    actions.push(`**P3 — ${totalNull} campos NULL nos Anchor checks §3**: Campos que o script não conseguiu ingerir. Verificar se o tag XBRL existe para estas empresas no EDGAR e adicionar fallback.`)
  }

  const revNullPct = nullCounts.find(r => r.field === 'grossProfit')
  if (revNullPct && Number(revNullPct.nulls) / annualCount > 0.30) {
    actions.push(`**P3 — grossProfit/grossMargin NULL em ${((Number(revNullPct.nulls)/annualCount)*100).toFixed(0)}% das rows**: Normal para bancos e REITs — estes setores não reportam Cost of Revenue. Considerar filtrar no screener (não mostrar grossMargin para financials/REITs).`)
  }

  if (daysSince !== null && daysSince > 5) {
    actions.push(`**P2 — Preços com ${daysSince} dias de atraso**: Correr \`ingest_prices.py\` ou trigger manual do GitHub Action.`)
  }

  if (actions.length === 0) {
    console.log(`✅ Nenhum problema crítico encontrado.\n`)
  } else {
    actions.forEach((a, i) => console.log(`${i + 1}. ${a}\n`))
  }

  console.log(`---`)
  console.log(`\n_Fim do relatório. Re-correr após cada fix de ingestão._`)

  await prisma.$disconnect()
}

main().catch(async e => {
  console.error('ERRO:', e)
  await prisma.$disconnect()
  process.exit(1)
})
