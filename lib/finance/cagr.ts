/**
 * CAGR (Compound Annual Growth Rate) — JS puro, sem dependências de UI.
 *
 *   CAGR = (fim / início)^(1 / anos) − 1
 *
 * Devolve `null` (nunca NaN/Infinity) quando o cálculo não faz sentido:
 * início ≤ 0, fim ≤ 0, anos ≤ 0 ou qualquer input não-finito.
 * Mesma semântica do cálculo inline em FinancialsEngine (`calcCAGR`),
 * isolada aqui conforme CLAUDE.md §7.
 */
export function calculateCagr(
  start: number | null | undefined,
  end: number | null | undefined,
  years: number | null | undefined,
): number | null {
  if (start == null || end == null || years == null) return null
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(years)) return null
  if (start <= 0 || end <= 0 || years <= 0) return null
  const cagr = Math.pow(end / start, 1 / years) - 1
  // Overflow em rácios/períodos extremos (ex: years ≈ 0) → null, nunca Infinity.
  return Number.isFinite(cagr) ? cagr : null
}
