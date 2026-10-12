import { racios } from "./historico"
import { DRIVERS, type AnoHistorico, type Driver } from "./tipos"

/**
 * Mediana dos pares da mesma indústria, por driver, no último ano fiscal de
 * cada um. Dá ao analista uma âncora externa ("a mediana do setor tem margem
 * EBIT de 18%") ao lado do histórico da própria empresa.
 *
 * Usa os mesmos rácios do histórico (`racios`), por isso as definições são as
 * do resto do modelo. Um driver só tem mediana com pelo menos `MINIMO` pares
 * com dado: com dois, a "mediana" é uma média de duas empresas.
 */

export const MINIMO_PARES = 3

export type MedianaPares = {
  /** Pares com histórico suficiente (pelo menos 2 anos). */
  n: number
  mediana: Partial<Record<Driver, number>>
}

function mediana(vs: number[]): number {
  const o = [...vs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** `historicos`: um histórico anual (ordem crescente) por par, sem a própria empresa. */
export function medianaPares(historicos: AnoHistorico[][]): MedianaPares | null {
  const ultimos = historicos
    .filter((h) => h.length >= 2)
    .map((h) => racios(h)[h.length - 1])
  if (ultimos.length < MINIMO_PARES) return null
  const out: Partial<Record<Driver, number>> = {}
  for (const d of DRIVERS) {
    const vs = ultimos.map((r) => r[d]).filter((v): v is number => v !== null && Number.isFinite(v))
    if (vs.length >= MINIMO_PARES) out[d] = mediana(vs)
  }
  return { n: ultimos.length, mediana: out }
}
