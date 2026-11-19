/**
 * Séries macroeconómicas da página /macro e do modelo DCF, vindas da FRED.
 *
 * ── Porque é que isto mudou ───────────────────────────────────────────────
 *
 * Antes estas séries vinham da tabela `prices` no Supabase (esgotando o egress)
 * e depois passaram a pedir dezenas de janelas de 90 dias a APIs externas com
 * chave. O CSV público da FRED (`https://fred.stlouisfed.org/graph/fredgraph.csv?id=…`)
 * não precisa de chave, devolve a série completa num único pedido (<300 KB,
 * muito abaixo do limite de 2 MB da Data Cache do Next) e permite partilhar o
 * mesmo URL em cache entre a página `/macro`, a rota `/api/macro/data` e o
 * modelo DCF.
 *
 * Os tickers públicos (`^DGS10`, `^CPI_YOY`, …) mantêm-se intactos para nenhum
 * consumidor precisar de mudar.
 */

export type PontoSerie = { date: string; value: number }
export type ObservacaoFred = { date: string; value: number | null }

export type DefinicaoSerieFred = {
  id: string
  /** Aplica variação homóloga em % sobre os níveis da FRED (ex.: CPI e PIB real). */
  calcularHomologa: boolean
}

const FRED_CSV_BASE = "https://fred.stlouisfed.org/graph/fredgraph.csv"
const ALVO_PONTOS_POR_DEFEITO = 800
const DIA = 86_400_000
/** 6 horas na Data Cache do Next: chega para séries diárias e mensais. */
const REVALIDATE_FRED = 6 * 3600

const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Mapa explícito nome / ticker → série FRED.
 *
 * Taxas do Tesouro dos EUA (antes em `treasury-rates`):
 *   · month1  / ^DGS1MO / DGS1MO → DGS1MO  (1 mês)
 *   · month3  / ^DGS3MO / DGS3MO → DGS3MO  (3 meses)
 *   · month6  / ^DGS6MO / DGS6MO → DGS6MO  (6 meses)
 *   · year1   / ^DGS1   / DGS1   → DGS1    (1 ano)
 *   · year2   / ^DGS2   / DGS2   → DGS2    (2 anos)
 *   · year3   / ^DGS3   / DGS3   → DGS3    (3 anos)
 *   · year5   / ^DGS5   / DGS5   → DGS5    (5 anos)
 *   · year7   / ^DGS7   / DGS7   → DGS7    (7 anos)
 *   · year10  / ^DGS10  / DGS10  → DGS10   (10 anos)
 *   · year20  / ^DGS20  / DGS20  → DGS20   (20 anos)
 *   · year30  / ^DGS30  / DGS30  → DGS30   (30 anos)
 *   ·           ^T10Y2Y / T10Y2Y → T10Y2Y  (Spread 10A − 2A)
 *
 * Indicadores macro (antes em `economic-indicators`):
 *   · federalFunds     / ^FEDFUNDS / FEDFUNDS → FEDFUNDS (Taxa efetiva Fed Funds, %)
 *   · unemploymentRate / ^UNRATE   / UNRATE   → UNRATE   (Taxa de desemprego, %)
 *   · CPI              / CPIAUCSL             → CPIAUCSL (Índice de preços no consumidor)
 *   · inflation / inflationRate / ^CPI_YOY    → CPIAUCSL com variação homóloga (%)
 *   · realGDP          / GDPC1                → GDPC1    (PIB real trimestral)
 *   · ^GDP_YOY                                → GDPC1    com variação homóloga (%)
 *   · GDP                                     → GDP      (PIB nominal trimestral)
 *
 * Índices de mercado usados no painel macro:
 *   · ^VIX  / VIXCLS    → VIXCLS    (Volatilidade Implícita CBOE VIX)
 *   · ^GSPC / SP500     → SP500     (S&P 500)
 *   · ^IXIC / NASDAQCOM → NASDAQCOM (NASDAQ Composite)
 *   · ^DJI  / DJIA      → DJIA      (Dow Jones Industrial Average)
 */
export const SERIES_FRED: Record<string, DefinicaoSerieFred> = {
  // Taxas do Tesouro
  "^DGS1MO": { id: "DGS1MO", calcularHomologa: false },
  DGS1MO: { id: "DGS1MO", calcularHomologa: false },
  month1: { id: "DGS1MO", calcularHomologa: false },

  "^DGS3MO": { id: "DGS3MO", calcularHomologa: false },
  DGS3MO: { id: "DGS3MO", calcularHomologa: false },
  month3: { id: "DGS3MO", calcularHomologa: false },

  "^DGS6MO": { id: "DGS6MO", calcularHomologa: false },
  DGS6MO: { id: "DGS6MO", calcularHomologa: false },
  month6: { id: "DGS6MO", calcularHomologa: false },

  "^DGS1": { id: "DGS1", calcularHomologa: false },
  DGS1: { id: "DGS1", calcularHomologa: false },
  year1: { id: "DGS1", calcularHomologa: false },

  "^DGS2": { id: "DGS2", calcularHomologa: false },
  DGS2: { id: "DGS2", calcularHomologa: false },
  year2: { id: "DGS2", calcularHomologa: false },

  "^DGS3": { id: "DGS3", calcularHomologa: false },
  DGS3: { id: "DGS3", calcularHomologa: false },
  year3: { id: "DGS3", calcularHomologa: false },

  "^DGS5": { id: "DGS5", calcularHomologa: false },
  DGS5: { id: "DGS5", calcularHomologa: false },
  year5: { id: "DGS5", calcularHomologa: false },

  "^DGS7": { id: "DGS7", calcularHomologa: false },
  DGS7: { id: "DGS7", calcularHomologa: false },
  year7: { id: "DGS7", calcularHomologa: false },

  "^DGS10": { id: "DGS10", calcularHomologa: false },
  DGS10: { id: "DGS10", calcularHomologa: false },
  year10: { id: "DGS10", calcularHomologa: false },

  "^DGS20": { id: "DGS20", calcularHomologa: false },
  DGS20: { id: "DGS20", calcularHomologa: false },
  year20: { id: "DGS20", calcularHomologa: false },

  "^DGS30": { id: "DGS30", calcularHomologa: false },
  DGS30: { id: "DGS30", calcularHomologa: false },
  year30: { id: "DGS30", calcularHomologa: false },

  "^T10Y2Y": { id: "T10Y2Y", calcularHomologa: false },
  T10Y2Y: { id: "T10Y2Y", calcularHomologa: false },

  // Indicadores macroeconómicos
  "^FEDFUNDS": { id: "FEDFUNDS", calcularHomologa: false },
  FEDFUNDS: { id: "FEDFUNDS", calcularHomologa: false },
  federalFunds: { id: "FEDFUNDS", calcularHomologa: false },

  "^UNRATE": { id: "UNRATE", calcularHomologa: false },
  UNRATE: { id: "UNRATE", calcularHomologa: false },
  unemploymentRate: { id: "UNRATE", calcularHomologa: false },
  unemployment: { id: "UNRATE", calcularHomologa: false },

  CPI: { id: "CPIAUCSL", calcularHomologa: false },
  CPIAUCSL: { id: "CPIAUCSL", calcularHomologa: false },
  "^CPI_YOY": { id: "CPIAUCSL", calcularHomologa: true },
  inflationRate: { id: "CPIAUCSL", calcularHomologa: true },
  inflation: { id: "CPIAUCSL", calcularHomologa: true },

  GDP: { id: "GDP", calcularHomologa: false },
  realGDP: { id: "GDPC1", calcularHomologa: false },
  GDPC1: { id: "GDPC1", calcularHomologa: false },
  "^GDP_YOY": { id: "GDPC1", calcularHomologa: true },

  // Índices no painel macro
  "^VIX": { id: "VIXCLS", calcularHomologa: false },
  VIXCLS: { id: "VIXCLS", calcularHomologa: false },
  "^GSPC": { id: "SP500", calcularHomologa: false },
  SP500: { id: "SP500", calcularHomologa: false },
  "^IXIC": { id: "NASDAQCOM", calcularHomologa: false },
  NASDAQCOM: { id: "NASDAQCOM", calcularHomologa: false },
  "^DJI": { id: "DJIA", calcularHomologa: false },
  DJIA: { id: "DJIA", calcularHomologa: false },
}

export function resolverSerieFred(nomeOuTicker: string): DefinicaoSerieFred | undefined {
  const limpo = nomeOuTicker.trim()
  return SERIES_FRED[limpo] ?? SERIES_FRED[limpo.toUpperCase()]
}

/**
 * Faz o parse de um CSV `fredgraph.csv` (`observation_date,SERIE`).
 *
 * A FRED marca dias sem observação (feriados, meses não publicados como
 * out/2025 no CPI) com `"."` ou célula vazia `""`. Em JavaScript `Number("")`
 * dá `0`, o que transformaria um feriado numa taxa de 0% ou numa variação
 * homóloga absurda — por isso esses casos devolvem explicitamente `null`.
 */
export function parsearCsvFred(csv: string): ObservacaoFred[] {
  const linhas = csv.split(/\r?\n/)
  const out: ObservacaoFred[] = []
  for (const linha of linhas) {
    const limpa = linha.trim()
    if (!limpa) continue
    const sep = limpa.indexOf(",")
    if (sep === -1) continue
    const date = limpa.slice(0, sep).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const bruto = limpa.slice(sep + 1).trim()
    if (bruto === "" || bruto === ".") {
      out.push({ date, value: null })
      continue
    }
    const num = Number(bruto)
    out.push({ date, value: Number.isFinite(num) ? num : null })
  }
  return out
}

/** Filtra observações válidas (`value !== null`), sem datas repetidas e ordenadas. */
function juntar(pontos: ObservacaoFred[]): PontoSerie[] {
  const porData = new Map<string, number>()
  for (const p of pontos) {
    if (p.value !== null && Number.isFinite(p.value)) porData.set(p.date, p.value)
  }
  return [...porData.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, value]) => ({ date, value }))
}

/**
 * Reduz uma série a ~`alvo` pontos, mantendo sempre o último (o valor de hoje).
 *
 * Um gráfico de 800 píxeis não desenha 2 500 pontos — o resto é peso morto na
 * resposta ao browser.
 */
function amostrar<T>(serie: T[], alvo = ALVO_PONTOS_POR_DEFEITO): T[] {
  if (serie.length <= alvo) return serie
  const passo = Math.ceil(serie.length / alvo)
  const out = serie.filter((_, i) => i % passo === 0)
  const ultimo = serie[serie.length - 1]
  if (out[out.length - 1] !== ultimo) out.push(ultimo)
  return out
}

async function buscarFred(serieId: string): Promise<PontoSerie[]> {
  const url = `${FRED_CSV_BASE}?id=${encodeURIComponent(serieId)}`
  let resp = await fetch(url, { next: { revalidate: REVALIDATE_FRED, tags: ["macro"] } })
  if (resp.status === 429 || resp.status >= 500) {
    await new Promise((r) => setTimeout(r, 500))
    resp = await fetch(url, { next: { revalidate: REVALIDATE_FRED, tags: ["macro"] } })
  }
  if (!resp.ok) {
    throw new Error(`FRED ${serieId} → HTTP ${resp.status}`)
  }
  const csv = await resp.text()
  return juntar(parsearCsvFred(csv))
}

/**
 * Variação homóloga em %, comparando cada ponto com o de há um ano (±20 dias).
 *
 * Por data e não por posição: o CPI de outubro de 2025 não foi publicado, e
 * recuar 12 pontos a partir daí comparava com 13 meses antes (agosto de 2026
 * contra julho de 2025: 3,71% em vez de 3,35%).
 */
export function homologa(serie: PontoSerie[]): PontoSerie[] {
  const out: PontoSerie[] = []
  const tempo = (d: string) => new Date(d + "T00:00:00Z").getTime()
  const pontos = serie.map((p) => ({ ...p, t: tempo(p.date) }))
  for (const p of pontos) {
    const d = new Date(p.t)
    const alvo = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate())
    let melhor: (typeof pontos)[number] | null = null
    for (const q of pontos) {
      if (Math.abs(q.t - alvo) <= 20 * DIA && (!melhor || Math.abs(q.t - alvo) < Math.abs(melhor.t - alvo))) melhor = q
    }
    if (melhor && melhor.value) out.push({ date: p.date, value: (p.value / melhor.value - 1) * 100 })
  }
  return out
}

// ─── API pública ───────────────────────────────────────────────────────────

export async function carregarSeriesReduzidas(
  tickers: string[],
  opcoes: { desde?: Date; alvoPontos?: number } = {},
): Promise<Record<string, PontoSerie[]>> {
  const { alvoPontos = ALVO_PONTOS_POR_DEFEITO } = opcoes
  const desde = opcoes.desde ?? new Date(Date.now() - 10 * 365.25 * DIA)
  // As homólogas precisam do ano anterior ao primeiro ponto mostrado.
  const desdeHomologa = new Date(desde.getTime() - 400 * DIA)

  const emCurso = new Map<string, Promise<PontoSerie[]>>()
  const obterFred = (serieId: string) => {
    let p = emCurso.get(serieId)
    if (!p) {
      p = buscarFred(serieId)
      emCurso.set(serieId, p)
    }
    return p
  }

  async function serie(ticker: string): Promise<PontoSerie[]> {
    const def = resolverSerieFred(ticker)
    if (!def) return []
    const pontos = await obterFred(def.id)
    if (!def.calcularHomologa) return pontos
    const janela = pontos.filter((p) => p.date >= iso(desdeHomologa))
    return homologa(janela)
  }

  // Todas as séries pedidas aparecem no resultado, mesmo vazias: o cliente
  // espera a chave e desenhar-lhe um gráfico vazio é melhor do que rebentar.
  const resultados = await Promise.all(
    tickers.map(async (t) => {
      try {
        const s = (await serie(t)).filter((p) => p.date >= iso(desde))
        return [t, amostrar(s, alvoPontos)] as const
      } catch (e) {
        console.error(`[macro] ${t}:`, e)
        return [t, [] as PontoSerie[]] as const
      }
    }),
  )
  return Object.fromEntries(resultados)
}
