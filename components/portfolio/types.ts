export type Fundamental = {
  roic: number | null
  grossMargin: number | null
}

export type Company = {
  id: string
  ticker: string
  name: string
  logoUrl: string | null
  exchange: string
  sector: string | null
  industry: string | null
  fundamentals: Fundamental[]
}

export type PortfolioItem = {
  id: string
  company: Company
  quantity: number | string | null
  avgBuyPrice: number | string | null
  // detalhes opcionais da posição (Decimal do Prisma chega como string no JSON)
  buyDate?: string | null
  broker?: string | null
  currency?: string | null
  fees?: number | string | null
  notes?: string | null
}

export type PriceData = {
  currentPrice?: number
  change?: number
  changePercent?: number
  error?: string
}

export type SortKey = "addedAt" | "name" | "changePercent" | "sector"
export type ViewMode = "grid" | "table"
