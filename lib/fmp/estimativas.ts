import { finnhubGet, simboloFinnhub } from "@/lib/finnhub"
import { nasdaqGet, num, fimDoMes, simboloNasdaq } from "@/lib/fontes/nasdaq"
import { estimativasStockAnalysis, type AnoSA } from "@/lib/fontes/stockanalysis"
import { taxaParaUsd } from "@/lib/fmp/cambio"

/**
 * Projeções de analistas — SEM FMP (decisão do Costa, 2026-11-21: só fontes
 * públicas e gratuitas). Tudo em dólares.
 *
 *   EPS estimado (4 anos, alto/baixo, nº de analistas) → Nasdaq `analyst/{t}/earnings-forecast`
 *   receita, lucro e resultado operacional estimados   → stockanalysis.com (parte pública:
 *     anos reportados + 1.º ano estimado completo + receita/EPS do 2.º)
 *   preço-alvo (mínimo, médio, máximo)                  → Nasdaq `analyst/{t}/targetprice`
 *   recomendações e histórico mensal                    → Finnhub `/stock/recommendation`
 *   câmbio (estrangeiras)                               → BCE via Frankfurter (lib/fmp/cambio.ts)
 *
 * ── Armadilhas ────────────────────────────────────────────────────────────
 * 1. MOEDA. O stockanalysis dá as demonstrações na moeda de reporte (a Novo Nordisk em
 *    coroas); converte-se para dólares. O EPS do Nasdaq já vem em dólares por título
 *    COTADO (por ADR), por isso os múltiplos forward calculam-se de totais (lucro,
 *    receita) e o EPS só entra em rácios entre si e nos gráficos.
 * 2. Um ano estimado só entra se tiver receita E EPS (os anos 3–4 só têm EPS no
 *    Nasdaq): um gráfico com uma barra de receita a zero seria pior do que não a ter.
 * 3. Sem EBITDA estimado nas fontes gratuitas: o EV/EBITDA forward fica N/A.
 * 4. O Nasdaq não dá a mediana dos alvos: usa-se a média (consenso).
 */

const REVALIDATE = 12 * 3600
const DIA = 86_400_000

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
  /** EBIT e EBITDA médios estimados (base dos analistas, normalmente ajustada). */
  ebitAvg: number | null
  ebitdaAvg: number | null
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

type LinhaForecast = {
  fiscalEnd?: string
  consensusEPSForecast?: number | string
  highEPSForecast?: number | string
  lowEPSForecast?: number | string
  noOfEstimates?: number | string
}
type RespostaForecast = { yearlyForecast?: { rows?: LinhaForecast[] | null } | null }
type RespostaAlvo = {
  consensusOverview?: {
    lowPriceTarget?: number | string
    highPriceTarget?: number | string
    priceTarget?: number | string
    buy?: number
    hold?: number
    sell?: number
  } | null
}
type LinhaRecomendacao = { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }

/** O ano do stockanalysis cujo fecho está a menos de 45 dias de `data`. */
function anoPerto(anos: AnoSA[], data: string): AnoSA | null {
  const t = Date.parse(data + "T00:00:00Z")
  let melhor: AnoSA | null = null
  let dist = 45 * DIA
  for (const a of anos) {
    const d = Math.abs(Date.parse(a.date + "T00:00:00Z") - t)
    if (d <= dist) { melhor = a; dist = d }
  }
  return melhor
}

export async function analistas(
  ticker: string,
  moedaReporte: string,
  ultimoAnual: { fiscalYear: number; periodEnd: Date } | null,
): Promise<Analistas | null> {
  const sym = simboloNasdaq(ticker)
  const [previsao, alvo, sa, recs] = await Promise.all([
    nasdaqGet<RespostaForecast>(`analyst/${encodeURIComponent(sym)}/earnings-forecast`, {}, REVALIDATE),
    nasdaqGet<RespostaAlvo>(`analyst/${encodeURIComponent(sym)}/targetprice`, {}, REVALIDATE),
    estimativasStockAnalysis(ticker),
    finnhubGet<LinhaRecomendacao[]>("stock/recommendation", { symbol: simboloFinnhub(ticker) }, REVALIDATE),
  ])
  // Moeda das demonstrações: a do stockanalysis manda (é a dos números que dá).
  const moeda = sa?.moeda || moedaReporte || "USD"
  const taxa = await taxaParaUsd(moeda, new Date())

  // ── EPS do Nasdaq, por ano fiscal ───────────────────────────────────────
  type Eps = { date: string; avg: number; low: number; high: number; n: number }
  const eps: Eps[] = []
  for (const r of previsao?.yearlyForecast?.rows ?? []) {
    const date = fimDoMes(r.fiscalEnd)
    const avg = num(r.consensusEPSForecast)
    if (!date || avg === null) continue
    eps.push({ date, avg, low: num(r.lowEPSForecast) ?? avg, high: num(r.highEPSForecast) ?? avg, n: num(r.noOfEstimates) ?? 0 })
  }
  eps.sort((a, b) => (a.date < b.date ? -1 : 1))

  // ── Anos estimados: receita e lucro do stockanalysis, EPS do Nasdaq ─────
  let anuais: EstimativaAnual[] = []
  let ntm: Totais12m | null = null
  let ltm: Totais12m | null = null
  let analistasEps = 0
  const anosSA = sa?.anos ?? []
  if (taxa !== null) {
    const fimReportado = ultimoAnual ? ultimoAnual.periodEnd.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
    const futuros = eps.filter((e) => e.date > fimReportado && anoFiscal(e.date, ultimoAnual) > (ultimoAnual?.fiscalYear ?? 0))
    const primeiroSA = anosSA.find((a) => a.estimativa) ?? null
    futuros.forEach((e, k) => {
      const a = anoPerto(anosSA, e.date)
      // 1.º ano: a linha completa do stockanalysis; 2.º: só a receita pública ("seguinte")
      const receita = a && a.estimativa ? a.revenue : k === 1 && primeiroSA ? sa?.seguinte?.revenue ?? null : null
      if (receita === null || receita <= 0) return
      anuais.push({
        fiscalYear: anoFiscal(e.date, ultimoAnual),
        date: e.date,
        revenueAvg: receita * taxa,
        revenueLow: receita * taxa,
        revenueHigh: receita * taxa,
        epsAvg: e.avg,
        epsLow: e.low,
        epsHigh: e.high,
        ebitAvg: a && a.estimativa && a.operatingIncome !== null ? a.operatingIncome * taxa : null,
        ebitdaAvg: null,
        analistas: e.n,
      })
    })
    anuais = anuais.slice(0, 3)

    // Próximos / últimos 12 meses: média dos anos fiscais à volta de hoje, pesada
    // pelo que falta do ano corrente (o "NTM" da indústria; não salta na viragem).
    const hojeIso = new Date().toISOString().slice(0, 10)
    const reportados = anosSA.filter((x) => !x.estimativa)
    const fy0 = reportados[reportados.length - 1] ?? null
    const fy1 = anosSA.find((x) => x.estimativa && x.date >= hojeIso.slice(0, 7)) ?? anosSA.find((x) => x.estimativa) ?? null
    const eps1 = fy1 ? eps.find((e) => Math.abs(Date.parse(e.date) - Date.parse(fy1.date)) <= 45 * DIA) ?? null : null
    const eps2 = eps1 ? eps[eps.indexOf(eps1) + 1] ?? null : null
    const rec2 = sa?.seguinte?.revenue ?? null
    if (fy0 && fy1 && eps1 && eps2 && rec2 && fy0.revenue && fy1.revenue && fy0.netIncome && fy1.netIncome) {
      const w = Math.min(1, Math.max(0, (Date.parse(fy1.date + "T00:00:00Z") - Date.now()) / (365 * DIA)))
      const lucro2 = fy1.netIncome * (eps1.avg > 0 ? eps2.avg / eps1.avg : 1)
      const mix = (a: number, b: number) => w * a + (1 - w) * b
      ntm = {
        revenue: mix(fy1.revenue, rec2) * taxa,
        netIncome: mix(fy1.netIncome, lucro2) * taxa,
        ebitda: 0,
        eps: mix(eps1.avg, eps2.avg),
      }
      ltm = {
        revenue: mix(fy0.revenue, fy1.revenue) * taxa,
        netIncome: mix(fy0.netIncome, fy1.netIncome) * taxa,
        ebitda: 0,
        eps: mix(fy0.eps ?? eps1.avg, eps1.avg),
      }
      analistasEps = eps1.n
    }
  }

  // ── Preço-alvo (Nasdaq) ─────────────────────────────────────────────────
  const c = alvo?.consensusOverview
  const consenso = num(c?.priceTarget)
  const alvoFinal =
    c && consenso !== null && consenso > 0
      ? {
          low: num(c.lowPriceTarget) ?? consenso,
          median: consenso,
          consensus: consenso,
          high: num(c.highPriceTarget) ?? consenso,
          alvosUltimoAno: (c.buy ?? 0) + (c.hold ?? 0) + (c.sell ?? 0),
        }
      : null

  // ── Recomendações (Finnhub, mensal) ─────────────────────────────────────
  const hist = Array.isArray(recs) ? [...recs].sort((x, y) => (x.period < y.period ? -1 : 1)).slice(-12) : []
  const atual = hist[hist.length - 1]
  const recomendacoes = atual
    ? {
        strongBuy: atual.strongBuy,
        buy: atual.buy,
        hold: atual.hold,
        sell: atual.sell,
        strongSell: atual.strongSell,
        consensus: rotulo({
          analystRatingsStrongBuy: atual.strongBuy,
          analystRatingsBuy: atual.buy,
          analystRatingsHold: atual.hold,
          analystRatingsSell: atual.sell,
          analystRatingsStrongSell: atual.strongSell,
        }),
        historico: hist.map((h) => ({ date: h.period, buy: h.strongBuy + h.buy, hold: h.hold, sell: h.sell + h.strongSell })),
      }
    : null

  if (anuais.length === 0 && !alvoFinal && !recomendacoes) return null
  return { anuais, ntm, ltm, analistasEps, alvo: alvoFinal, recomendacoes }
}
