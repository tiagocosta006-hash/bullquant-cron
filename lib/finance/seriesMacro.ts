import { amostrar, get, historico } from "@/lib/fmp/mercado"

/**
 * Séries macro da página /macro, vindas da FMP.
 *
 * ── Porque é que isto mudou ───────────────────────────────────────────────
 *
 * Estas séries viviam na tabela `prices` (copiadas do FRED) e eram lidas do
 * Supabase. Essa tabela foi a origem do esgotamento do egress; os preços e as
 * séries macro passam a vir da FMP e a ficar na Data Cache do Next. O Supabase
 * não é tocado aqui.
 *
 * ── Limites da FMP que moldam o código (medidos a 2026-09-24) ────────────
 *
 *   · `treasury-rates` e `economic-indicators` devolvem no máximo ~90 dias por
 *     pedido, seja qual for o intervalo `from`/`to`. Dez anos são ~41 janelas.
 *   · O PIB (`realGDP`) não responde a intervalos; responde a `to=D` com o
 *     último trimestre até D. Por isso pede-se trimestre a trimestre.
 *
 * As janelas antigas nunca mudam: ficam em cache 30 dias. Só a janela de hoje
 * revalida de 6 em 6 horas. Um arranque a frio são ~220 pedidos (Premium dá
 * 750/min); depois disso são meia dúzia por dia.
 *
 * Os tickers mantêm os nomes antigos (^DGS10, ^CPI_YOY, …) para o cliente da
 * página não mudar. Um ticker que não seja macro (ex: ^GSPC) cai no histórico
 * de preços normal.
 */

export type PontoSerie = { date: string; value: number }

const ALVO_PONTOS_POR_DEFEITO = 800
const DIA = 86_400_000
const JANELA_DIAS = 90
const REVALIDATE_FECHADA = 30 * 86_400
const REVALIDATE_ABERTA = 6 * 3600

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Revalidação conforme a janela ainda pode receber dados novos ou não. */
function revalidatePara(fim: Date): number {
  return Date.now() - fim.getTime() > 10 * DIA ? REVALIDATE_FECHADA : REVALIDATE_ABERTA
}

/** Janelas [início, fim] de 90 dias, de `desde` até hoje. */
function janelas(desde: Date): Array<[Date, Date]> {
  const hoje = new Date()
  const out: Array<[Date, Date]> = []
  for (let ini = desde; ini <= hoje; ini = new Date(ini.getTime() + JANELA_DIAS * DIA)) {
    const fim = new Date(Math.min(ini.getTime() + (JANELA_DIAS - 1) * DIA, hoje.getTime()))
    out.push([ini, fim])
  }
  return out
}

/** Corre `fn` sobre `itens` com no máximo `n` pedidos em simultâneo. */
async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (i < itens.length) {
        const k = i++
        out[k] = await fn(itens[k])
      }
    }),
  )
  return out
}

/** Junta pontos de várias janelas, sem datas repetidas, por ordem. */
function juntar(pontos: PontoSerie[]): PontoSerie[] {
  const porData = new Map<string, number>()
  for (const p of pontos) if (Number.isFinite(p.value)) porData.set(p.date, p.value)
  return [...porData.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }))
}

// ─── Fontes ────────────────────────────────────────────────────────────────

type LinhaTesouro = { date: string; month1?: number; year2?: number; year10?: number; year30?: number }

async function tesouro(desde: Date): Promise<LinhaTesouro[]> {
  const blocos = await emLotes(janelas(desde), 8, ([ini, fim]) =>
    get<LinhaTesouro[]>("treasury-rates", { from: iso(ini), to: iso(fim) }, revalidatePara(fim)),
  )
  return blocos.flatMap((b) => (Array.isArray(b) ? b : []))
}

type LinhaIndicador = { date: string; value: number }

async function indicador(nome: string, desde: Date): Promise<PontoSerie[]> {
  const blocos = await emLotes(janelas(desde), 8, ([ini, fim]) =>
    get<LinhaIndicador[]>("economic-indicators", { name: nome, from: iso(ini), to: iso(fim) }, revalidatePara(fim)),
  )
  return juntar(blocos.flatMap((b) => (Array.isArray(b) ? b : [])).map((l) => ({ date: l.date, value: l.value })))
}

/** PIB real trimestral: um pedido por trimestre (ver cabeçalho). */
async function pibReal(desde: Date): Promise<PontoSerie[]> {
  const trimestres: Date[] = []
  const hoje = new Date()
  let d = new Date(Date.UTC(desde.getUTCFullYear(), Math.floor(desde.getUTCMonth() / 3) * 3, 1))
  while (d <= hoje) {
    trimestres.push(d)
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))
  }
  const linhas = await emLotes(trimestres, 8, (t) =>
    get<LinhaIndicador[]>("economic-indicators", { name: "realGDP", to: iso(t) }, revalidatePara(t)),
  )
  return juntar(linhas.flatMap((b) => (Array.isArray(b) ? b : [])).map((l) => ({ date: l.date, value: l.value })))
}

/** Variação homóloga em %, comparando com o ponto de há `passos` períodos. */
function homologa(serie: PontoSerie[], passos: number): PontoSerie[] {
  const out: PontoSerie[] = []
  for (let i = passos; i < serie.length; i++) {
    const antes = serie[i - passos].value
    if (antes) out.push({ date: serie[i].date, value: (serie[i].value / antes - 1) * 100 })
  }
  return out
}

// ─── API pública ───────────────────────────────────────────────────────────

const TESOURO: Record<string, (l: LinhaTesouro) => number | undefined> = {
  "^DGS1MO": (l) => l.month1,
  "^DGS10": (l) => l.year10,
  "^DGS30": (l) => l.year30,
  "^T10Y2Y": (l) => (l.year10 != null && l.year2 != null ? l.year10 - l.year2 : undefined),
}

export async function carregarSeriesReduzidas(
  tickers: string[],
  opcoes: { desde?: Date; alvoPontos?: number } = {},
): Promise<Record<string, PontoSerie[]>> {
  const { alvoPontos = ALVO_PONTOS_POR_DEFEITO } = opcoes
  const desde = opcoes.desde ?? new Date(Date.now() - 10 * 365.25 * DIA)
  // As homólogas precisam do ano anterior ao primeiro ponto mostrado.
  const desdeHomologa = new Date(desde.getTime() - 400 * DIA)

  let tesouroCache: Promise<LinhaTesouro[]> | null = null
  const obterTesouro = () => (tesouroCache ??= tesouro(desde))

  async function serie(ticker: string): Promise<PontoSerie[]> {
    const campo = TESOURO[ticker]
    if (campo) {
      return juntar(
        (await obterTesouro()).map((l) => ({ date: l.date, value: campo(l) ?? NaN })),
      )
    }
    switch (ticker) {
      case "^FEDFUNDS":
        return indicador("federalFunds", desde)
      case "^UNRATE":
        return indicador("unemploymentRate", desde)
      case "^CPI_YOY":
        return homologa(await indicador("CPI", desdeHomologa), 12)
      case "^GDP_YOY":
        return homologa(await pibReal(desdeHomologa), 4)
      default:
        return (await historico(ticker, desde)).map((p) => ({ date: p.date, value: p.close }))
    }
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
