"use client"

import { useEffect, useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import type { Fundamental } from "@prisma/client"

type StockSnapshotProps = {
  ticker: string
  fundamentals: Fundamental[] // 4 quarters or 1 annual
  currencySymbol?: string
}

function formatVal(value: number | null | undefined, isPercent = false, isCurrency = false, isRatio = false, currencySymbol = "$") {
  if (value === null || value === undefined || isNaN(Number(value))) return "---"
  const num = Number(value)
  if (isPercent) return `${(num * 100).toFixed(2)}%`
  if (isCurrency) {
    if (Math.abs(num) >= 1e9) return `${currencySymbol}${(num / 1e9).toFixed(2)}B`
    if (Math.abs(num) >= 1e6) return `${currencySymbol}${(num / 1e6).toFixed(2)}M`
    return `${currencySymbol}${num.toFixed(2)}`
  }
  if (isRatio) return `${num.toFixed(2)}x`
  return num.toFixed(2)
}

// Linha de métrica: mostra o valor formatado, um skeleton enquanto carrega,
// ou um "N/A" explicado (tooltip) quando o dado não existe — nunca um 0 enganador.
function Stat({
  label,
  value,
  percent,
  currency,
  ratio,
  loading,
  naLabel,
  naReason,
  currencySymbol
}: {
  label: string
  value: number | null
  percent?: boolean
  currency?: boolean
  ratio?: boolean
  loading?: boolean
  naLabel: string
  naReason: string
  currencySymbol?: string
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium">{label}</span>
      {loading ? (
        <div className="h-4 w-14 animate-pulse rounded bg-muted" />
      ) : value === null || value === undefined || isNaN(Number(value)) ? (
        <span
          className="cursor-help text-sm font-medium text-muted-foreground/50 underline decoration-dotted underline-offset-2"
          title={naReason}
        >
          {naLabel}
        </span>
      ) : (
        <span className="font-bold">{formatVal(value, percent, currency, ratio, currencySymbol)}</span>
      )}
    </div>
  )
}

export function StockSnapshot({ ticker, fundamentals, currencySymbol = "$" }: StockSnapshotProps) {
  const t = useTranslations("stock.snapshot")
  const [price, setPrice] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/price/${ticker}`)
        if (res.ok) {
          const data = await res.json()
          setPrice(data.currentPrice)
        }
      } catch (err) {
        console.error("Failed to fetch price for snapshot", err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPrice()
    const interval = setInterval(fetchPrice, 60000)
    return () => clearInterval(interval)
  }, [ticker])

  // Derive TTM data — null-aware: distingue "sem dados" (null) de "zero real".
  const ttm = useMemo(() => {
    if (!fundamentals || fundamentals.length === 0) return null

    const latest = fundamentals[0]
    const isTtm = fundamentals.length === 4

    // Soma os últimos 4 trimestres (TTM) ou usa a última anual. Devolve null
    // se NENHUMA das linhas tem o dado — assim não inventamos um 0.
    const sumMetric = (key: keyof Fundamental): number | null => {
      const rows = isTtm ? fundamentals : [latest]
      const vals = rows.map((f) => f[key])
      if (vals.every((v) => v === null || v === undefined)) return null
      return vals.reduce<number>((s, v) => s + Number(v ?? 0), 0)
    }
    const instant = (key: keyof Fundamental): number | null => {
      const v = latest[key]
      return v === null || v === undefined ? null : Number(v)
    }

    const revenue = sumMetric("revenue")
    const grossProfit = sumMetric("grossProfit")
    const opIncome = sumMetric("operatingIncome")
    const netIncome = sumMetric("netIncome")
    const ebitda = sumMetric("ebitda")
    const dps = sumMetric("dividendPerShare")

    const margin = (num: number | null) =>
      num !== null && revenue !== null && revenue > 0 ? num / revenue : null

    return {
      revenue,
      netIncome,
      ebitda,
      operatingCashFlow: sumMetric("operatingCashFlow"),
      freeCashFlow: sumMetric("freeCashFlow"),
      dividendPerShare: dps,

      grossMargin: margin(grossProfit),
      operatingMargin: margin(opIncome),
      netMargin: margin(netIncome),

      cash: instant("cash"),
      totalAssets: instant("totalAssets"),
      totalDebt: instant("totalDebt"),
      totalEquity: instant("totalEquity"),
      sharesOutstanding: instant("sharesOutstanding"),
    }
  }, [fundamentals])

  // Valuation computations (dependem do preço atual → null enquanto não há dados)
  const shares = ttm?.sharesOutstanding ?? null
  const marketCap = price && shares && shares > 0 ? price * shares : null
  const ev = marketCap !== null ? marketCap + (ttm?.totalDebt ?? 0) - (ttm?.cash ?? 0) : null

  const pe = marketCap && ttm?.netIncome && ttm.netIncome > 0 ? marketCap / ttm.netIncome : null
  const ps = marketCap && ttm?.revenue && ttm.revenue > 0 ? marketCap / ttm.revenue : null
  const evEbitda = ev && ttm?.ebitda && ttm.ebitda > 0 ? ev / ttm.ebitda : null
  const pb = marketCap && ttm?.totalEquity && ttm.totalEquity > 0 ? marketCap / ttm.totalEquity : null
  const fcfYield = marketCap && ttm?.freeCashFlow ? ttm.freeCashFlow / marketCap : null
  const dividendYield =
    price && price > 0 && ttm?.dividendPerShare && ttm.dividendPerShare > 0
      ? ttm.dividendPerShare / price
      : null

  if (!ttm) return null

  const netDebt =
    ttm.totalDebt === null && ttm.cash === null ? null : (ttm.totalDebt ?? 0) - (ttm.cash ?? 0)

  const naGeneric = t("naGeneric")
  const naMargin = t("naMargin")
  const naLabel = t("na")

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* 1. Valuation */}
      <div className="glass p-5 rounded-xl flex flex-col gap-3">
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{t("valuation")}</h3>
        <Stat label="Market Cap" value={marketCap} currency loading={isLoading} naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
        <Stat label="P/E (TTM)" value={pe} ratio loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
        <Stat label="P/Sales" value={ps} ratio loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
        <Stat label="EV/EBITDA" value={evEbitda} ratio loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
        <Stat label="P/Book" value={pb} ratio loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
      </div>

      {/* 2. Cash Flow */}
      <div className="glass p-5 rounded-xl flex flex-col gap-3">
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{t("cashFlow")}</h3>
        <Stat label="Operating CF" value={ttm.operatingCashFlow} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
        <Stat label="Free Cash Flow" value={ttm.freeCashFlow} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
        <Stat label="FCF Yield" value={fcfYield} percent loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
      </div>

      {/* 3. Margins & Growth */}
      <div className="glass p-5 rounded-xl flex flex-col gap-3">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("marginAndGrowth")}</h3>
        <Stat label="Gross Margin" value={ttm.grossMargin} percent naLabel={naLabel} naReason={naMargin} />
        <Stat label="Oper. Margin" value={ttm.operatingMargin} percent naLabel={naLabel} naReason={naMargin} />
        <Stat label="Net Margin" value={ttm.netMargin} percent naLabel={naLabel} naReason={naGeneric} />
      </div>

      {/* 4. Balance */}
      <div className="glass p-5 rounded-xl flex flex-col gap-3">
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{t("balance")}</h3>
        <Stat label="Cash" value={ttm.cash} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
        <Stat label="Total Assets" value={ttm.totalAssets} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
        <Stat label="Total Debt" value={ttm.totalDebt} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
      </div>

      {/* 5. Dividend */}
      <div className="glass p-5 rounded-xl flex flex-col gap-3">
        <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">{t("dividend")}</h3>
        <Stat label="Div Yield" value={dividendYield} percent loading={isLoading} naLabel={naLabel} naReason={naGeneric} />
        <Stat
          label="DPS (TTM)"
          value={ttm.dividendPerShare && ttm.dividendPerShare > 0 ? ttm.dividendPerShare : null}
          currency
          naLabel={naLabel}
          naReason={naGeneric}
          currencySymbol={currencySymbol}
        />
        <Stat label="Net Debt" value={netDebt} currency naLabel={naLabel} naReason={naGeneric} currencySymbol={currencySymbol} />
      </div>
    </div>
  )
}
