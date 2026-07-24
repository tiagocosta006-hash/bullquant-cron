/**
 * CAGR histórico curado dos principais índices acionistas, por janela temporal.
 *
 * Porquê constantes e não um fetch à BD:
 *  - Os níveis de preço dos índices (^GSPC/^IXIC/^DJI) NÃO estão na tabela `prices`
 *    (só lá vivem séries macro do FRED: yields, VIX, CPI, etc.). Um fetch devolvia 404.
 *  - O FRED só licencia ~10 anos de histórico diário do S&P 500 → janelas de 20/30/50
 *    anos não teriam dados. Para uma ferramenta de *projeção*, um CAGR representativo
 *    de longo prazo é mais robusto (e é o padrão da indústria).
 *
 * Natureza dos valores: CAGR **price-return** (crescimento do nível do índice,
 * DIVIDENDOS EXCLUÍDOS), em %, aproximados e arredondados a 1 casa, de referência
 * ~meados de 2026. São estimativas curadas para efeito de simulação, não cotações
 * ao vivo — atualizar aqui quando se quiser refrescar as premissas.
 */

export type IndexKey = "GSPC" | "IXIC" | "DJI"

/** Janelas históricas oferecidas na UI (anos). "50" = "Max (50+ anos)". */
export const LOOKBACK_WINDOWS = [1, 3, 5, 10, 20, 30, 50] as const
export type LookbackWindow = (typeof LOOKBACK_WINDOWS)[number]

const INDEX_CAGR: Record<IndexKey, Record<LookbackWindow, number>> = {
  // S&P 500 — price return (ex-dividendos)
  GSPC: { 1: 12.0, 3: 9.0, 5: 13.5, 10: 11.0, 20: 8.0, 30: 8.0, 50: 8.0 },
  // Nasdaq Composite — mais volátil, retorno recente mais alto
  IXIC: { 1: 16.0, 3: 11.0, 5: 15.0, 10: 15.0, 20: 11.0, 30: 10.0, 50: 10.5 },
  // Dow Jones Industrial Average
  DJI: { 1: 10.0, 3: 8.0, 5: 9.0, 10: 9.5, 20: 7.0, 30: 8.0, 50: 7.5 },
}

function isIndexKey(v: string): v is IndexKey {
  return v === "GSPC" || v === "IXIC" || v === "DJI"
}

/**
 * Devolve o CAGR curado (%) para um índice + janela. Faz "snap" da janela ao valor
 * suportado mais próximo. Devolve `null` se o índice não for conhecido.
 */
export function getIndexCagr(index: string, lookbackYears: number): number | null {
  if (!isIndexKey(index)) return null
  const table = INDEX_CAGR[index]
  const nearest = LOOKBACK_WINDOWS.reduce((best, w) =>
    Math.abs(w - lookbackYears) < Math.abs(best - lookbackYears) ? w : best
  )
  return table[nearest]
}
