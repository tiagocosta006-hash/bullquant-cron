"use client"

import { createContext, useContext, useMemo } from "react"
import type { ShareCompany } from "./ChartShareCard"

/**
 * Identidade da empresa para os cartões de partilha.
 *
 * Existe como contexto — e não como prop — porque o `DecisionChart` é
 * instanciado ~15× dentro do `FinancialsEngine`: passar ticker/nome/logo a
 * cada chamada era ruído em todos os call sites para um dado que é constante
 * na página. O preço NÃO vive aqui: é pedido no momento em que o modal abre,
 * para não duplicar o polling de 60s do `StockHeader`.
 */
const StockShareContext = createContext<ShareCompany | null>(null)

export function StockShareProvider({
  company,
  children,
}: {
  company: ShareCompany
  children: React.ReactNode
}) {
  const { ticker, name, exchange, logoUrl, currency } = company
  const value = useMemo<ShareCompany>(
    () => ({ ticker, name, exchange, logoUrl, currency }),
    [ticker, name, exchange, logoUrl, currency],
  )
  return <StockShareContext.Provider value={value}>{children}</StockShareContext.Provider>
}

/** `null` fora da página de stock — o botão de partilha esconde-se sozinho. */
export function useShareCompany(): ShareCompany | null {
  return useContext(StockShareContext)
}
