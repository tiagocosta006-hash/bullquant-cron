/**
 * verify_fundamentals.ts — "Prova dos Nove" dos fundamentais.
 *
 * Valida EXATIDÃO (não apenas consistência) dos dados gravados, em 3 camadas:
 *   A. Reconciliação cruzada interna  — Σ(trimestres) ≈ anual; instant Q4 = anual.
 *   B. Âncoras "golden"               — comparação exata vs valores verificados no 10-K.
 *   C. Cross-check vs SEC autoritativo — endpoint companyconcept (independente do companyfacts).
 *
 * Correr:  npx tsx scripts/verify_fundamentals.ts
 * Env:
 *   SEC_USER_AGENT   obrigatório p/ a camada C (a SEC exige User-Agent com contacto)
 *   SEC_TICKERS      opcional, CSV (ex: "JPM,WFC,O,SPG") — foca a amostra; senão usa amostra por setor
 *   SEC_SAMPLE_SIZE  opcional, default 15
 *
 * Exit code: 1 se houver FAIL (âncora golden errada) — pensado para CI.
 */
import { PrismaClient, type Fundamental } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

// ── Configuração ──────────────────────────────────────────────
const REL_TOL = 0.02 // tolerância relativa default (2%) — restatements/arredondamentos
const SHARES_TOL = 0.05 // ações: anual (período-fim) vs trimestre pode divergir mais
const SEC_BASE = 'https://data.sec.gov/api/xbrl/companyconcept'
const SEC_USER_AGENT = process.env.SEC_USER_AGENT ?? ''
const SEC_DELAY_MS = 150 // ≤10 req/s exigido pela SEC
const SEC_SAMPLE_SIZE = Number(process.env.SEC_SAMPLE_SIZE ?? 15)
const SEC_TICKERS = (process.env.SEC_TICKERS ?? '').split(',').map(s => s.trim()).filter(Boolean)
const GOLDEN_TOL = 0.005 // âncoras: 0.5% (essencialmente match exato, tolera arredondamento)
const SNAPSHOT_PATH = 'scripts/golden_snapshot.json'
const SEED_MODE = process.argv.includes('--seed') // gera a baseline a partir da SEC e termina

// Campos de fluxo (somam-se ao longo do ano) vs instantâneos (snapshot no fim do período).
const FLOW_FIELDS = ['revenue', 'netIncome', 'operatingCashFlow', 'freeCashFlow', 'capex'] as const
const INSTANT_FIELDS = ['totalAssets', 'cash', 'totalDebt', 'totalEquity', 'sharesOutstanding'] as const

// Mapa campo → tags XBRL us-gaap (ordem de fallback). Subconjunto do ingest, inclui Banca/REIT.
const SEC_TAGS: Record<string, { tags: string[]; unit: 'USD' | 'shares' }> = {
  revenue: {
    tags: [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'RevenuesNetOfInterestExpense',
      'OperatingLeasesIncomeStatementLeaseRevenue',
    ],
    unit: 'USD',
  },
  grossProfit: { tags: ['GrossProfit'], unit: 'USD' },
  operatingIncome: { tags: ['OperatingIncomeLoss'], unit: 'USD' },
  netIncome: { tags: ['NetIncomeLoss'], unit: 'USD' },
  operatingCashFlow: { tags: ['NetCashProvidedByUsedInOperatingActivities'], unit: 'USD' },
  capex: { tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], unit: 'USD' },
  totalAssets: { tags: ['Assets'], unit: 'USD' },
  cash: { tags: ['CashAndCashEquivalentsAtCarryingValue'], unit: 'USD' },
  totalCurrentLiab: { tags: ['LiabilitiesCurrent'], unit: 'USD' },
  longTermDebt: { tags: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'], unit: 'USD' },
  totalEquity: { tags: ['StockholdersEquity'], unit: 'USD' },
  sharesOutstanding: { tags: ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'], unit: 'shares' },
}

// ── Âncoras "golden" (Camada B) ───────────────────────────────
// ⚠️ ESTES VALORES TÊM DE SER VERIFICADOS NO 10-K REAL antes de confiar.
//    Os exemplos abaixo são ilustrativos da ESTRUTURA — confirmem no filing
//    e expandam para cobrir 1 empresa normal + 1 banco + 1 REIT, no mínimo.
type Golden = {
  ticker: string
  fiscalYear: number
  periodType: 'ANNUAL' | 'QUARTERLY'
  fiscalQuarter?: number
  field: keyof Fundamental
  expected: number
  note: string
}
const GOLDEN: Golden[] = [
  // Ex.: { ticker: 'AAPL', fiscalYear: 2023, periodType: 'ANNUAL', field: 'revenue',
  //        expected: 383285000000, note: '10-K FY2023, Net sales' },
]

// ── Tipos de resultado ────────────────────────────────────────
type Severity = 'FAIL' | 'WARN' | 'INFO'
interface Finding {
  layer: 'A-reconciliacao' | 'B-golden' | 'C-sec'
  ticker: string
  metric: string
  period: string
  severity: Severity
  details: string
}
const findings: Finding[] = []
const add = (f: Finding) => findings.push(f)

// ── Helpers ───────────────────────────────────────────────────
const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

/** Igualdade relativa com piso absoluto para não disparar em números minúsculos. */
function approx(a: number, b: number, tol: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b))
  if (scale < 1) return Math.abs(a - b) < 1 // ambos ~0
  return Math.abs(a - b) / scale <= tol
}

const pct = (a: number, b: number): string => {
  const scale = Math.max(Math.abs(a), Math.abs(b)) || 1
  return `${(((a - b) / scale) * 100).toFixed(1)}%`
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ══════════════════════════════════════════════════════════════
// CAMADA A — Reconciliação cruzada interna
// ══════════════════════════════════════════════════════════════
async function layerA() {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true },
  })

  for (const company of companies) {
    const rows = await prisma.fundamental.findMany({
      where: { companyId: company.id },
      orderBy: [{ fiscalYear: 'asc' }, { fiscalQuarter: 'asc' }],
    })

    const years = [...new Set(rows.map(r => r.fiscalYear))]
    for (const year of years) {
      const annual = rows.find(r => r.fiscalYear === year && r.periodType === 'ANNUAL')
      if (!annual) continue
      const quarters = rows.filter(r => r.fiscalYear === year && r.periodType === 'QUARTERLY')

      // ── Fluxos: soma dos trimestres ≈ anual ──
      if (quarters.length === 4) {
        for (const field of FLOW_FIELDS) {
          const a = num(annual[field])
          const parts = quarters.map(q => num(q[field])).filter((p): p is number => p !== null)
          if (a === null || parts.length !== quarters.length) continue
          const sum = parts.reduce((s, p) => s + p, 0)
          if (!approx(sum, a, REL_TOL)) {
            add({
              layer: 'A-reconciliacao', ticker: company.ticker, metric: field,
              period: `FY${year}`, severity: 'WARN',
              details: `Σ(Q1..Q4)=${sum.toExponential(3)} vs Anual=${a.toExponential(3)} (desvio ${pct(sum, a)})`,
            })
          }
        }
      } else if (quarters.length === 3) {
        // Q4 não isolado: Σ(Q1..Q3) deve ser ≤ anual (para fluxos não-negativos).
        for (const field of FLOW_FIELDS) {
          const a = num(annual[field])
          const parts = quarters.map(q => num(q[field])).filter((p): p is number => p !== null)
          if (a === null || parts.length !== quarters.length || a <= 0) continue
          const sum = parts.reduce((s, p) => s + p, 0)
          if (sum > a * (1 + REL_TOL)) {
            add({
              layer: 'A-reconciliacao', ticker: company.ticker, metric: field,
              period: `FY${year}`, severity: 'WARN',
              details: `Σ(Q1..Q3)=${sum.toExponential(3)} > Anual=${a.toExponential(3)} — diferenciação YTD suspeita`,
            })
          }
        }
      }

      // ── Instantâneos: trimestre com mesmo fim de período = anual ──
      const q4 = quarters
        .filter(q => q.periodEnd && isoDate(q.periodEnd) === isoDate(annual.periodEnd))
        .at(0)
      if (q4) {
        for (const field of INSTANT_FIELDS) {
          const a = num(annual[field])
          const q = num(q4[field])
          if (a === null || q === null) continue
          const tol = field === 'sharesOutstanding' ? SHARES_TOL : REL_TOL
          if (!approx(a, q, tol)) {
            add({
              layer: 'A-reconciliacao', ticker: company.ticker, metric: field,
              period: `FY${year}`, severity: 'WARN',
              details: `Anual=${a.toExponential(3)} vs Q4=${q.toExponential(3)} (desvio ${pct(a, q)})`,
            })
          }
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CAMADA B — Âncoras golden (exatidão vs 10-K verificado à mão)
// ══════════════════════════════════════════════════════════════
async function layerB() {
  for (const g of GOLDEN) {
    const company = await prisma.company.findUnique({ where: { ticker: g.ticker }, select: { id: true } })
    if (!company) {
      add({ layer: 'B-golden', ticker: g.ticker, metric: String(g.field), period: `FY${g.fiscalYear}`,
        severity: 'FAIL', details: 'Empresa não existe na BD' })
      continue
    }
    const row = await prisma.fundamental.findFirst({
      where: {
        companyId: company.id,
        periodType: g.periodType,
        fiscalYear: g.fiscalYear,
        fiscalQuarter: g.fiscalQuarter ?? null,
      },
    })
    const period = g.periodType === 'ANNUAL' ? `FY${g.fiscalYear}` : `Q${g.fiscalQuarter} ${g.fiscalYear}`
    const actual = row ? num(row[g.field]) : null
    if (actual === null) {
      add({ layer: 'B-golden', ticker: g.ticker, metric: String(g.field), period,
        severity: 'FAIL', details: `Valor ausente na BD (esperado ${g.expected}) — ${g.note}` })
      continue
    }
    if (!approx(actual, g.expected, GOLDEN_TOL)) {
      add({ layer: 'B-golden', ticker: g.ticker, metric: String(g.field), period, severity: 'FAIL',
        details: `BD=${actual} vs 10-K=${g.expected} (desvio ${pct(actual, g.expected)}) — ${g.note}` })
    }
  }
}

// ══════════════════════════════════════════════════════════════
// CAMADA C — Cross-check vs SEC companyconcept (autoritativo)
// ══════════════════════════════════════════════════════════════
interface SecUnitEntry { end: string; val: number; fy: number; fp: string; form: string }

/** Amostra de empresas com CIK para cruzar com a SEC (override via SEC_TICKERS). */
async function getSecSample() {
  const where = SEC_TICKERS.length
    ? { ticker: { in: SEC_TICKERS } }
    : { isActive: true, cik: { not: null } }
  return prisma.company.findMany({
    where,
    select: { id: true, ticker: true, cik: true },
    take: SEC_TICKERS.length ? undefined : SEC_SAMPLE_SIZE,
    orderBy: { ticker: 'asc' },
  })
}

async function fetchConcept(cik: string, tag: string): Promise<SecUnitEntry[] | null> {
  const padded = cik.padStart(10, '0')
  const url = `${SEC_BASE}/CIK${padded}/us-gaap/${tag}.json`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' } })
    if (res.status === 404) return null
    if (res.status === 429) { await sleep(60_000); return fetchConcept(cik, tag) }
    if (!res.ok) return null
    const json = (await res.json()) as { units?: Record<string, SecUnitEntry[]> }
    const unit = SEC_TAGS[Object.keys(SEC_TAGS).find(k => SEC_TAGS[k].tags.includes(tag))!]?.unit ?? 'USD'
    return json.units?.[unit] ?? null
  } catch {
    return null
  } finally {
    await sleep(SEC_DELAY_MS)
  }
}

async function layerC() {
  if (!SEC_USER_AGENT) {
    add({ layer: 'C-sec', ticker: '-', metric: '-', period: '-', severity: 'INFO',
      details: 'SEC_USER_AGENT não definido — camada C ignorada. Define-o (ex: "BullQuant dev@exemplo.pt") para cruzar com a SEC.' })
    return
  }

  const sample = await getSecSample()

  for (const company of sample) {
    if (!company.cik) continue
    // Últimos 2 anos anuais gravados, para comparar.
    const annuals = await prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: 'ANNUAL' },
      orderBy: { fiscalYear: 'desc' },
      take: 2,
    })
    if (!annuals.length) continue

    for (const [field, { tags }] of Object.entries(SEC_TAGS)) {
      const stored = annuals
        .map(a => ({ a, v: num(a[field as keyof Fundamental]) }))
        .filter(x => x.v !== null) as { a: Fundamental; v: number }[]
      if (!stored.length) continue

      // Procura nas tags por ordem; usa a primeira que devolve dados.
      let secEntries: SecUnitEntry[] | null = null
      let usedTag = ''
      for (const tag of tags) {
        secEntries = await fetchConcept(company.cik, tag)
        if (secEntries && secEntries.length) { usedTag = tag; break }
      }
      if (!secEntries) {
        add({ layer: 'C-sec', ticker: company.ticker, metric: field, period: '-', severity: 'INFO',
          details: `SEC não devolveu nenhuma das tags [${tags.join(', ')}]` })
        continue
      }

      for (const { a, v } of stored) {
        const target = isoDate(a.periodEnd)
        // Aceita qualquer valor 10-K com o mesmo fim de período (FY anual).
        const matches = secEntries.filter(e => e.end === target && e.form.startsWith('10-K'))
        if (!matches.length) {
          add({ layer: 'C-sec', ticker: company.ticker, metric: field, period: `FY${a.fiscalYear}`,
            severity: 'INFO', details: `Sem facto 10-K na SEC p/ fim ${target} (tag ${usedTag})` })
          continue
        }
        const ok = matches.some(e => approx(v, e.val, REL_TOL))
        if (!ok) {
          const closest = matches.reduce((c, e) =>
            Math.abs(e.val - v) < Math.abs(c.val - v) ? e : c)
          add({ layer: 'C-sec', ticker: company.ticker, metric: field, period: `FY${a.fiscalYear}`,
            severity: 'WARN',
            details: `BD=${v.toExponential(3)} vs SEC(${usedTag})=${closest.val.toExponential(3)} (desvio ${pct(v, closest.val)})` })
        }
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// SEED — gera a baseline "golden master" a partir da SEC (uma vez)
// ══════════════════════════════════════════════════════════════
interface SnapshotEntry { ticker: string; fiscalYear: number; end: string; field: string; tag: string; secValue: number }

async function seedSnapshot(): Promise<void> {
  if (!SEC_USER_AGENT) {
    console.error('SEC_USER_AGENT obrigatório para gerar a baseline. Aborta.')
    process.exit(1)
  }
  const sample = await getSecSample()
  const snapshot: SnapshotEntry[] = []

  for (const company of sample) {
    if (!company.cik) continue
    const annuals = await prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: 'ANNUAL' },
      orderBy: { fiscalYear: 'desc' },
      take: 2,
    })
    if (!annuals.length) continue

    for (const [field, { tags }] of Object.entries(SEC_TAGS)) {
      let secEntries: SecUnitEntry[] | null = null
      let usedTag = ''
      for (const tag of tags) {
        secEntries = await fetchConcept(company.cik, tag)
        if (secEntries && secEntries.length) { usedTag = tag; break }
      }
      if (!secEntries) continue

      for (const a of annuals) {
        const target = isoDate(a.periodEnd)
        const match = secEntries.find(e => e.end === target && e.form.startsWith('10-K'))
        if (!match) continue
        snapshot.push({ ticker: company.ticker, fiscalYear: a.fiscalYear, end: target, field, tag: usedTag, secValue: match.val })
      }
    }
    console.log(`  ${company.ticker}: ${snapshot.filter(s => s.ticker === company.ticker).length} factos`)
  }

  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
  console.log(`\nBaseline gravada: ${SNAPSHOT_PATH} (${snapshot.length} factos). Revê o diff e commita.`)
}

/** Lê a baseline congelada e confronta com a BD atual (offline, determinístico). */
async function layerSnapshot(): Promise<void> {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    add({ layer: 'B-golden', ticker: '-', metric: '-', period: '-', severity: 'INFO',
      details: `Sem baseline (${SNAPSHOT_PATH}). Corre com --seed uma vez para a gerar.` })
    return
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as SnapshotEntry[]
  for (const s of snapshot) {
    const company = await prisma.company.findUnique({ where: { ticker: s.ticker }, select: { id: true } })
    const row = company && await prisma.fundamental.findFirst({
      where: { companyId: company.id, periodType: 'ANNUAL', fiscalYear: s.fiscalYear },
    })
    const actual = row ? num(row[s.field as keyof Fundamental]) : null
    if (actual === null) {
      add({ layer: 'B-golden', ticker: s.ticker, metric: s.field, period: `FY${s.fiscalYear}`,
        severity: 'FAIL', details: `Valor ausente na BD (baseline SEC=${s.secValue}, tag ${s.tag})` })
      continue
    }
    if (!approx(actual, s.secValue, GOLDEN_TOL)) {
      add({ layer: 'B-golden', ticker: s.ticker, metric: s.field, period: `FY${s.fiscalYear}`,
        severity: 'FAIL', details: `BD=${actual} vs baseline SEC=${s.secValue} (desvio ${pct(actual, s.secValue)}, tag ${s.tag})` })
    }
  }
}

// ── Relatório ─────────────────────────────────────────────────
function writeReport() {
  const fails = findings.filter(f => f.severity === 'FAIL')
  const warns = findings.filter(f => f.severity === 'WARN')
  const infos = findings.filter(f => f.severity === 'INFO')

  let md = `# Prova dos Nove — Fundamentais\n\nGerado em: ${new Date().toISOString()}\n\n`
  md += `- ❌ FAIL (âncoras golden): **${fails.length}**\n`
  md += `- ⚠️ WARN (a investigar): **${warns.length}**\n`
  md += `- ℹ️ INFO: ${infos.length}\n\n`

  for (const [label, list] of [['❌ FAIL', fails], ['⚠️ WARN', warns], ['ℹ️ INFO', infos]] as const) {
    if (!list.length) continue
    md += `## ${label}\n\n| Camada | Ticker | Métrica | Período | Detalhe |\n|---|---|---|---|---|\n`
    for (const f of list) md += `| ${f.layer} | ${f.ticker} | ${f.metric} | ${f.period} | ${f.details} |\n`
    md += '\n'
  }

  fs.writeFileSync('fundamentals_verification_report.md', md)
  console.log(`\nRelatório: fundamentals_verification_report.md`)
  console.log(`FAIL=${fails.length}  WARN=${warns.length}  INFO=${infos.length}`)
  return fails.length
}

async function main(): Promise<number> {
  if (SEED_MODE) {
    console.log('Modo --seed: a gerar baseline a partir da SEC...')
    await seedSnapshot()
    return 0
  }
  console.log('Camada A — reconciliação cruzada interna...')
  await layerA()
  console.log('Camada B — baseline golden master (snapshot) + âncoras manuais...')
  await layerSnapshot()
  await layerB()
  console.log('Camada C — cross-check SEC (amostra, ao vivo)...')
  await layerC()
  return writeReport()
}

main()
  .then(fails => prisma.$disconnect().then(() => process.exit(fails > 0 ? 1 : 0)))
  .catch(async e => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
