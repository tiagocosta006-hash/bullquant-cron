/**
 * Cálculos de posição de portfólio — JS puro, sem dependências de UI.
 * Modelo agregado: uma posição = quantidade + preço médio de compra (sem histórico de transações).
 */

/** Funde uma posição existente com uma nova compra, recalculando o preço médio ponderado. */
export function mergePosition(
  existing: { quantity: number; avgBuyPrice: number },
  incoming: { quantity: number; avgBuyPrice: number }
): { quantity: number; avgBuyPrice: number } {
  const totalQuantity = existing.quantity + incoming.quantity
  const totalCost = existing.quantity * existing.avgBuyPrice + incoming.quantity * incoming.avgBuyPrice
  return {
    quantity: totalQuantity,
    avgBuyPrice: totalQuantity > 0 ? totalCost / totalQuantity : 0,
  }
}

export type PositionPnl = {
  costBasis: number
  marketValue: number
  pnlAbsolute: number
  pnlPercent: number
}

/** P&L não realizado de uma posição, dado o preço atual de mercado. */
export function calculatePositionPnl(
  quantity: number,
  avgBuyPrice: number,
  currentPrice: number
): PositionPnl {
  const costBasis = quantity * avgBuyPrice
  const marketValue = quantity * currentPrice
  const pnlAbsolute = marketValue - costBasis
  const pnlPercent = costBasis > 0 ? pnlAbsolute / costBasis : 0
  return { costBasis, marketValue, pnlAbsolute, pnlPercent }
}

/** Agrega o P&L de várias posições (ignora as sem custo base, ex: watchlist pura). */
export function aggregatePnl(positions: PositionPnl[]): PositionPnl {
  const totals = positions.reduce(
    (acc, p) => ({
      costBasis: acc.costBasis + p.costBasis,
      marketValue: acc.marketValue + p.marketValue,
      pnlAbsolute: acc.pnlAbsolute + p.pnlAbsolute,
    }),
    { costBasis: 0, marketValue: 0, pnlAbsolute: 0 }
  )
  return {
    ...totals,
    pnlPercent: totals.costBasis > 0 ? totals.pnlAbsolute / totals.costBasis : 0,
  }
}
