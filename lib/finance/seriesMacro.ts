import { prisma } from "@/lib/prisma"

/**
 * Séries de preços reduzidas ao que um gráfico mostra — reduzidas NO SQL.
 *
 * ── Porque é que isto existe ─────────────────────────────────────────────
 *
 * A página macro e o /api/macro/data faziam ambos a mesma coisa:
 *
 *     findMany({ where: { ticker: { in: [...] } } })   // traz TUDO
 *     ...depois reduzir a 800 pontos em JavaScript
 *
 * Isso corrigia o que chegava ao browser e deixava a leitura da base
 * exactamente na mesma. O S&P 500 tem cotação diária desde 1927 — são 24.849
 * linhas só nele. A consulta inteira devolvia 136.257 linhas e 2,2 MB da base
 * DE CADA VEZ, para desenhar gráficos de 800 píxeis.
 *
 * Medido no `pg_stat_statements` de produção: 7.329 chamadas desde 23 de
 * julho, 746 milhões de linhas, cerca de 16 GB. O plano gratuito do Supabase
 * são 5 GB de egress por mês — esta consulta sozinha gastava mais de 8 GB por
 * mês e foi ela que esgotou a quota e deixou a autenticação bloqueada.
 *
 * ── A correcção ──────────────────────────────────────────────────────────
 *
 * A redução passa para dentro do SQL: uma `row_number()` por série e só as
 * linhas cujo índice cai no passo de amostragem. O último ponto é sempre
 * preservado — é o valor de hoje, e perdê-lo mudava o número que a pessoa lê.
 *
 * Medido contra produção: 109.706 linhas e 1.873 kB passam a 8.540 linhas e
 * 150 kB. Treze vezes menos, com 780 a 795 pontos por série, que é o que um
 * gráfico de 800 px consegue desenhar.
 */

export type PontoSerie = { date: string; value: number }

const ALVO_PONTOS_POR_DEFEITO = 800

export async function carregarSeriesReduzidas(
  tickers: string[],
  opcoes: { desde?: Date; alvoPontos?: number } = {},
): Promise<Record<string, PontoSerie[]>> {
  const { desde, alvoPontos = ALVO_PONTOS_POR_DEFEITO } = opcoes
  if (tickers.length === 0) return {}

  const filtroData = desde ? " AND date >= $3::date" : ""
  const params: unknown[] = desde ? [tickers, alvoPontos, desde] : [tickers, alvoPontos]

  const linhas = await prisma.$queryRawUnsafe<
    Array<{ ticker: string; date: Date; close: unknown }>
  >(
    `SELECT s.ticker, s.date, s.close FROM (
       SELECT ticker, date, close,
              row_number() OVER (PARTITION BY ticker ORDER BY date) AS rn,
              count(*)     OVER (PARTITION BY ticker)               AS total
       FROM prices
       WHERE ticker = ANY($1)${filtroData}
     ) s
     WHERE s.rn % GREATEST(1, CEIL(s.total::numeric / $2)::int) = 0
        OR s.rn = s.total
     ORDER BY s.ticker, s.date`,
    ...params,
  )

  // Todas as séries pedidas aparecem no resultado, mesmo vazias: o cliente
  // espera a chave e desenhar-lhe um gráfico vazio é melhor do que rebentar.
  const series: Record<string, PontoSerie[]> = {}
  for (const t of tickers) series[t] = []
  for (const l of linhas) {
    if (!series[l.ticker]) series[l.ticker] = []
    series[l.ticker].push({
      date: l.date.toISOString().slice(0, 10),
      value: Number(l.close),
    })
  }
  return series
}
