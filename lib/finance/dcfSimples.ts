/**
 * DCF simples "de retorno esperado", por ação — o formato das plataformas de
 * retail (Qualtrim, Stock Unlock), em vez do modelo FMVA completo.
 *
 *   métrica futura  = métrica atual × (1 + crescimento)^N
 *   preço futuro    = métrica futura × múltiplo de saída
 *   fair value      = preço futuro ÷ (1 + retorno desejado)^N
 *   CAGR esperado   = (preço futuro ÷ preço atual)^(1/N) − 1
 *
 * Responde a duas perguntas: "quanto posso pagar hoje para ganhar X% ao
 * ano?" (fair value) e "ao preço de hoje, quanto ganho por ano?" (CAGR).
 * A métrica é FCF por ação ou EPS; o crescimento por ação já inclui o efeito
 * das recompras.
 */

export type MetricaSimples = "fcf" | "eps"

export type Cenario = {
  /** Crescimento anual da métrica por ação (decimal). */
  crescimento: number
  /** Múltiplo de saída: P/FCF ou P/E. */
  multiploSaida: number
}

export type ResultadoCenario = {
  valido: boolean
  metricaFutura: number
  precoFuturo: number
  fairValue: number
  /** fair value ÷ preço − 1 */
  potencial: number
  /** Retorno anual composto se se comprar ao preço atual. */
  cagrEsperado: number
  /** 1 − preço ÷ fair value */
  margemSeguranca: number
  /** Métrica projetada ano a ano (ano 1..N). */
  projecao: number[]
}

export function calcularCenario(
  metricaAtual: number,
  c: Cenario,
  anos: number,
  retornoDesejado: number,
  preco: number,
): ResultadoCenario {
  const invalido: ResultadoCenario = {
    valido: false, metricaFutura: 0, precoFuturo: 0, fairValue: 0, potencial: 0, cagrEsperado: 0, margemSeguranca: 0, projecao: [],
  }
  // Com a métrica negativa (prejuízo, FCF negativo) o método não se aplica:
  // crescer um número negativo torna-o mais negativo.
  if (!(metricaAtual > 0) || !(anos > 0) || !(c.multiploSaida > 0) || retornoDesejado <= -1) return invalido
  const projecao = Array.from({ length: anos }, (_, i) => metricaAtual * Math.pow(1 + c.crescimento, i + 1))
  const metricaFutura = projecao[anos - 1]
  const precoFuturo = metricaFutura * c.multiploSaida
  const fairValue = precoFuturo / Math.pow(1 + retornoDesejado, anos)
  return {
    valido: true,
    metricaFutura,
    precoFuturo,
    fairValue,
    potencial: preco > 0 ? fairValue / preco - 1 : 0,
    cagrEsperado: preco > 0 ? Math.pow(precoFuturo / preco, 1 / anos) - 1 : 0,
    margemSeguranca: fairValue > 0 ? 1 - preco / fairValue : 0,
    projecao,
  }
}

/** CAGR entre dois valores positivos; null se não fizer sentido. */
export function cagr(inicio: number | null, fim: number | null, anos: number): number | null {
  if (inicio === null || fim === null || !(inicio > 0) || !(fim > 0) || !(anos > 0)) return null
  return Math.pow(fim / inicio, 1 / anos) - 1
}

export function mediana(vals: number[]): number | null {
  const v = vals.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const lim = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const r3 = (v: number) => Math.round(v * 1000) / 1000
const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Cenários iniciais — pontos de partida, que o utilizador muda.
 *
 *   Base growth: consenso dos analistas se existir, senão o CAGR histórico
 *                de 5 anos da métrica; limitado a [0%, 25%].
 *   Bear / Bull: base ∓ 40% do base (pelo menos 2 pp de distância).
 *   Base exit:   mediana dos múltiplos de fim de ano dos últimos 10 anos,
 *                sem passar o múltiplo atual (não se assume que a ação vai
 *                ficar mais cara do que está); limitado a [8x, 40x].
 *   Bear / Bull: base × 0,8 e × 1,2.
 */
export function cenariosIniciais(o: {
  crescimentoConsenso: number | null
  crescimentoHistorico: number | null
  multiploMediano: number | null
  multiploAtual: number | null
}): { bear: Cenario; base: Cenario; bull: Cenario } {
  const g = lim(o.crescimentoConsenso ?? o.crescimentoHistorico ?? 0.06, 0, 0.25)
  const d = Math.max(0.02, g * 0.4)
  const refs = [o.multiploMediano, o.multiploAtual].filter((x): x is number => x !== null && x > 0)
  const m = lim(refs.length ? Math.min(...refs) : 15, 8, 40)
  return {
    bear: { crescimento: r3(Math.max(0, g - d)), multiploSaida: r1(m * 0.8) },
    base: { crescimento: r3(g), multiploSaida: r1(m) },
    bull: { crescimento: r3(g + d), multiploSaida: r1(m * 1.2) },
  }
}
