/**
 * Estimativas de receita, lucro e resultado operacional do stockanalysis.com —
 * a parte pública da página de previsões (sem conta): os anos já reportados e o
 * ano fiscal seguinte completo, mais a receita e o EPS do ano a seguir.
 *
 * O Nasdaq só tem EPS estimado; a receita (gráficos 27E/28E, P/S e crescimento
 * forward, DCF) vem daqui. Lê-se o `__data.json` da página (formato compacto do
 * SvelteKit, "devalue": um array plano em que os valores apontam para índices).
 */

const REVALIDATE = 12 * 3600

export type AnoSA = {
  /** Fim do ano fiscal, YYYY-MM-DD. */
  date: string
  fiscalYear: number
  revenue: number | null
  eps: number | null
  netIncome: number | null
  operatingIncome: number | null
  analistas: number | null
  /** true para anos ainda não reportados. */
  estimativa: boolean
}

export type EstimativasSA = {
  /** Moeda das demonstrações (a da cotação pode ser outra, nos ADR). */
  moeda: string
  anos: AnoSA[]
  /** Ano fiscal a seguir ao primeiro estimado: só receita e EPS são públicos. */
  seguinte: { revenue: number | null; eps: number | null } | null
}

/** Descodifica um nó "devalue" do SvelteKit (array plano com referências por índice). */
export function desachatar(arr: unknown[]): unknown {
  const memo = new Map<number, unknown>()
  const h = (i: number): unknown => {
    if (i < 0) return undefined // -1 undefined, -2 buraco, -3 NaN… (devalue)
    if (memo.has(i)) return memo.get(i)
    const v = arr[i]
    let r: unknown
    if (Array.isArray(v)) {
      const out: unknown[] = []
      memo.set(i, out)
      for (const x of v) out.push(typeof x === "number" ? h(x) : x)
      r = out
    } else if (v && typeof v === "object") {
      const out: Record<string, unknown> = {}
      memo.set(i, out)
      for (const [k, x] of Object.entries(v)) out[k] = typeof x === "number" ? h(x) : x
      r = out
    } else {
      r = v
    }
    memo.set(i, r)
    return r
  }
  return h(0)
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

export async function estimativasStockAnalysis(ticker: string): Promise<EstimativasSA | null> {
  const url = `https://stockanalysis.com/stocks/${encodeURIComponent(ticker.toLowerCase())}/forecast/__data.json`
  let corpo: { nodes?: Array<{ type?: string; data?: unknown[] } | null> }
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      next: { revalidate: REVALIDATE, tags: ["stockanalysis"] },
      signal: AbortSignal.timeout(15_000),
    })
    if (!resp.ok) return null
    corpo = await resp.json()
  } catch {
    return null
  }

  let moeda = "USD"
  let est: Record<string, unknown> | null = null
  for (const no of corpo.nodes ?? []) {
    if (!no || no.type !== "data" || !Array.isArray(no.data)) continue
    const o = desachatar(no.data) as Record<string, unknown> | undefined
    if (!o || typeof o !== "object") continue
    const info = o.info as { curr?: { financial?: string } } | undefined
    if (info?.curr?.financial) moeda = info.curr.financial
    if (o.estimates) est = o.estimates as Record<string, unknown>
  }
  if (!est) return null

  const tab = (est.table as { annual?: Record<string, unknown[]> } | undefined)?.annual
  if (!tab || !Array.isArray(tab.dates)) return null
  const ultimoReportado = typeof (tab as Record<string, unknown>).lastDate === "number"
    ? ((tab as Record<string, unknown>).lastDate as number) : -1
  const anos: AnoSA[] = []
  tab.dates.forEach((d, i) => {
    if (typeof d !== "string") return
    const fy = Number((tab.fiscalYear ?? [])[i])
    const linha: AnoSA = {
      date: d,
      fiscalYear: Number.isFinite(fy) ? fy : Number(d.slice(0, 4)),
      revenue: n(tab.revenue?.[i]),
      eps: n(tab.eps?.[i]),
      netIncome: n(tab.netIncome?.[i]),
      operatingIncome: n(tab.operatingIncome?.[i]),
      analistas: n(tab.analysts?.[i]),
      estimativa: i > ultimoReportado,
    }
    // Anos "[PRO]" (pagos) não trazem nada: ficam de fora.
    if (linha.revenue !== null || linha.eps !== null) anos.push(linha)
  })

  const stats = (est.stats as { annual?: Record<string, { this?: unknown }> } | undefined)?.annual
  const seguinte = stats
    ? { revenue: n(stats.revenueNext?.this), eps: n(stats.epsNext?.this) }
    : null
  return { moeda, anos, seguinte }
}
