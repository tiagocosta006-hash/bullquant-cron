import { get, simbolo } from "@/lib/fmp/mercado"

/**
 * Projeções de analistas da FMP: estimativas anuais, preço-alvo e
 * recomendações. Tudo convertido para dólares.
 *
 * ── Armadilhas que moldam este ficheiro (medidas a 2026-09-24) ───────────
 *
 * 1. MOEDA. `analyst-estimates` vem na moeda de reporte e por ação
 *    ORDINÁRIA: a Novo Nordisk tem EPS estimado de 22,29 — coroas — contra
 *    um ADR de $38. Sem conversão o P/E forward dava 1,7x.
 *
 * 2. UNIDADES MISTURADAS ENTRE ENDPOINTS. O `earnings` da mesma Novo Nordisk
 *    vem em dólares por ADR (0,96/trimestre). A TSM, a Toyota e a ASML têm
 *    rácios de ADR diferentes. Por isso os múltiplos forward calculam-se a
 *    partir de TOTAIS (lucro, EBITDA, receita), nunca de EPS: capitalização
 *    ÷ lucro não depende de quantas ações há num ADR. O EPS só entra em
 *    rácios entre si (crescimento), onde a unidade se cancela, e nos gráficos,
 *    onde é convertido para a mesma base dos nossos fundamentais.
 *
 * 3. AJUSTADO vs GAAP. Os analistas estimam lucro ajustado. Para o P/E
 *    forward ter com que se comparar, o "últimos 12 meses" daqui também é
 *    ajustado e da mesma fonte (média ponderada dos anos fiscais à volta de
 *    hoje) — não o P/E contabilístico dos nossos fundamentais.
 *
 * O preço-alvo vem em dólares por ação cotada (NVO $44,67 para $38 de preço):
 * usa-se tal como vem.
 */

const REVALIDATE = 12 * 3600
const DIA = 86_400_000

type LinhaEstimativa = {
  date: string
  revenueLow: number
  revenueHigh: number
  revenueAvg: number
  ebitdaAvg: number
  netIncomeAvg: number
  epsAvg: number
  epsHigh: number
  epsLow: number
  numAnalystsRevenue: number
  numAnalystsEps: number
}

export type EstimativaAnual = {
  fiscalYear: number
  /** Fim do ano fiscal, YYYY-MM-DD. */
  date: string
  revenueAvg: number
  revenueLow: number
  revenueHigh: number
  epsAvg: number
  epsLow: number
  epsHigh: number
  analistas: number
}

export type Totais12m = { revenue: number; netIncome: number; ebitda: number; eps: number }

export type Analistas = {
  /** Anos fiscais futuros, em USD, já no fiscalYear dos nossos fundamentais. */
  anuais: EstimativaAnual[]
  /** Próximos 12 meses e últimos 12 meses em base ajustada, em USD. */
  ntm: Totais12m | null
  ltm: Totais12m | null
  analistasEps: number
  alvo: { low: number; median: number; consensus: number; high: number; alvosUltimoAno: number } | null
  recomendacoes: {
    strongBuy: number
    buy: number
    hold: number
    sell: number
    strongSell: number
    /** Da média das notas de hoje (5 = strong buy … 1 = strong sell). */
    consensus: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" | null
    /** Últimos 12 meses, do mais antigo para o mais recente. */
    historico: Array<{ date: string; buy: number; hold: number; sell: number }>
  } | null
}

async function taxaUsd(moeda: string): Promise<number | null> {
  const m = moeda.toUpperCase()
  if (m === "USD") return 1
  const q = await get<Array<{ price?: number }>>("quote", { symbol: `${m}USD` }, 86_400)
  const p = q?.[0]?.price
  return typeof p === "number" && p > 0 ? p : null
}

/**
 * O ano fiscal de uma data de fecho, na convenção dos NOSSOS fundamentais.
 * Aprende-se o desvio com o último anual conhecido (ex.: o Walmart fecha em
 * janeiro e chama-lhe o ano anterior ou o seguinte conforme a fonte). Os 15
 * dias absorvem fechos a 1-3 de janeiro, que pertencem ao ano anterior.
 */
function anoFiscal(dataFecho: string, referencia: { fiscalYear: number; periodEnd: Date } | null): number {
  const ano = (d: Date) => new Date(d.getTime() - 15 * DIA).getUTCFullYear()
  const base = ano(new Date(dataFecho + "T00:00:00Z"))
  if (!referencia) return base
  return base + (referencia.fiscalYear - ano(referencia.periodEnd))
}

function rotulo(h: {
  analystRatingsStrongBuy: number
  analystRatingsBuy: number
  analystRatingsHold: number
  analystRatingsSell: number
  analystRatingsStrongSell: number
}): "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" | null {
  const n = h.analystRatingsStrongBuy + h.analystRatingsBuy + h.analystRatingsHold + h.analystRatingsSell + h.analystRatingsStrongSell
  if (n === 0) return null
  const media =
    (5 * h.analystRatingsStrongBuy + 4 * h.analystRatingsBuy + 3 * h.analystRatingsHold +
      2 * h.analystRatingsSell + 1 * h.analystRatingsStrongSell) / n
  if (media >= 4.5) return "STRONG_BUY"
  if (media >= 3.5) return "BUY"
  if (media > 2.5) return "HOLD"
  if (media > 1.5) return "SELL"
  return "STRONG_SELL"
}

export async function analistas(
  ticker: string,
  moedaReporte: string,
  ultimoAnual: { fiscalYear: number; periodEnd: Date } | null,
): Promise<Analistas | null> {
  const s = simbolo(ticker)
  const [linhas, taxa, alvo, resumoAlvo, historico] = await Promise.all([
    get<LinhaEstimativa[]>("analyst-estimates", { symbol: s, period: "annual", limit: "10" }, REVALIDATE),
    taxaUsd(moedaReporte),
    get<Array<{ targetHigh: number; targetLow: number; targetConsensus: number; targetMedian: number }>>(
      "price-target-consensus", { symbol: s }, REVALIDATE),
    get<Array<{ lastYearCount?: number }>>("price-target-summary", { symbol: s }, REVALIDATE),
    get<Array<{
      date: string
      analystRatingsStrongBuy: number
      analystRatingsBuy: number
      analystRatingsHold: number
      analystRatingsSell: number
      analystRatingsStrongSell: number
    }>>("grades-historical", { symbol: s, limit: "12" }, REVALIDATE),
  ])

  // ── Estimativas ─────────────────────────────────────────────────────────
  let anuais: EstimativaAnual[] = []
  let ntm: Totais12m | null = null
  let ltm: Totais12m | null = null
  let analistasEps = 0

  // Sem taxa de câmbio não se mostra nada: um número na moeda errada é pior
  // do que N/A.
  if (Array.isArray(linhas) && linhas.length > 0 && taxa !== null) {
    const ord = [...linhas].sort((a, b) => (a.date < b.date ? -1 : 1))
    const hojeIso = new Date().toISOString().slice(0, 10)
    const i1 = ord.findIndex((l) => l.date > hojeIso)

    anuais = ord
      .filter((l) => l.date > hojeIso)
      .slice(0, 3)
      .map((l) => ({
        fiscalYear: anoFiscal(l.date, ultimoAnual),
        date: l.date,
        revenueAvg: l.revenueAvg * taxa,
        revenueLow: l.revenueLow * taxa,
        revenueHigh: l.revenueHigh * taxa,
        epsAvg: l.epsAvg * taxa,
        epsLow: l.epsLow * taxa,
        epsHigh: l.epsHigh * taxa,
        analistas: l.numAnalystsEps,
      }))

    // Próximos / últimos 12 meses: média dos anos fiscais à volta de hoje,
    // pesada pelo que falta do ano corrente. Muda suavemente e não salta
    // quando o ano fiscal vira — é o "NTM" da indústria.
    const fy0 = i1 > 0 ? ord[i1 - 1] : null
    const fy1 = i1 >= 0 ? ord[i1] : null
    const fy2 = i1 >= 0 ? ord[i1 + 1] ?? null : null
    if (fy0 && fy1 && fy2) {
      const w = Math.min(1, Math.max(0, (new Date(fy1.date + "T00:00:00Z").getTime() - Date.now()) / (365 * DIA)))
      const mistura = (a: LinhaEstimativa, b: LinhaEstimativa): Totais12m => ({
        revenue: (w * a.revenueAvg + (1 - w) * b.revenueAvg) * taxa,
        netIncome: (w * a.netIncomeAvg + (1 - w) * b.netIncomeAvg) * taxa,
        ebitda: (w * a.ebitdaAvg + (1 - w) * b.ebitdaAvg) * taxa,
        eps: (w * a.epsAvg + (1 - w) * b.epsAvg) * taxa,
      })
      ntm = mistura(fy1, fy2)
      ltm = mistura(fy0, fy1)
      analistasEps = fy1.numAnalystsEps
    }
  }

  // ── Preço-alvo ──────────────────────────────────────────────────────────
  const a = alvo?.[0]
  const alvoFinal =
    a && a.targetConsensus > 0
      ? {
          low: a.targetLow,
          median: a.targetMedian,
          consensus: a.targetConsensus,
          high: a.targetHigh,
          alvosUltimoAno: resumoAlvo?.[0]?.lastYearCount ?? 0,
        }
      : null

  // ── Recomendações ───────────────────────────────────────────────────────
  // A distribuição de HOJE vem do histórico mensal (contagem de analistas).
  // O rótulo calcula-se dela: o `grades-consensus` da FMP soma notas de um
  // período longo e dizia "Buy" à Novo Nordisk com 3 Buy, 11 Hold e 1 Sell.
  const hist = Array.isArray(historico) ? [...historico].sort((x, y) => (x.date < y.date ? -1 : 1)) : []
  const atual = hist[hist.length - 1]
  const recomendacoes = atual
    ? {
        strongBuy: atual.analystRatingsStrongBuy,
        buy: atual.analystRatingsBuy,
        hold: atual.analystRatingsHold,
        sell: atual.analystRatingsSell,
        strongSell: atual.analystRatingsStrongSell,
        consensus: rotulo(atual),
        historico: hist.map((h) => ({
          date: h.date,
          buy: h.analystRatingsStrongBuy + h.analystRatingsBuy,
          hold: h.analystRatingsHold,
          sell: h.analystRatingsSell + h.analystRatingsStrongSell,
        })),
      }
    : null

  if (anuais.length === 0 && !alvoFinal && !recomendacoes) return null
  return { anuais, ntm, ltm, analistasEps, alvo: alvoFinal, recomendacoes }
}
