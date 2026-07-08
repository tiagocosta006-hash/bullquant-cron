import { TrendingUp, TrendingDown } from "lucide-react"

interface PriceChangeBadgeProps {
  /** Variação já em unidades percentuais (ex: 1.23 = 1.23%), como devolvido pelo Finnhub. */
  changePercent: number | null | undefined
  /** Variação absoluta, formatada e pronta a mostrar (ex: "$1.23"). Omitir para mostrar só a %. */
  changeAbsoluteLabel?: string
  className?: string
}

export function PriceChangeBadge({ changePercent, changeAbsoluteLabel, className = "" }: PriceChangeBadgeProps) {
  if (changePercent === null || changePercent === undefined || !Number.isFinite(changePercent)) {
    return <span className={`text-muted-foreground ${className}`}>N/A</span>
  }

  const isPositive = changePercent >= 0
  const sign = isPositive ? "+" : "-"

  return (
    <div className={`flex flex-col items-end ${isPositive ? "text-bull" : "text-bear"} ${className}`}>
      <div className="flex items-center gap-1 font-bold">
        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        <span>{sign}{Math.abs(changePercent).toFixed(2)}%</span>
      </div>
      {changeAbsoluteLabel && (
        <span className="text-xs font-medium opacity-80">{sign}{changeAbsoluteLabel}</span>
      )}
    </div>
  )
}
