/**
 * Primitivas partilhadas entre o gráfico interativo (`DecisionChart`) e o
 * gráfico do cartão de partilha (`ChartShareCard`).
 *
 * Vivem aqui — e não no `DecisionChart` — para o cartão poder importá-las sem
 * criar um ciclo (`DecisionChart` → `ChartShareButton` → `ChartShareCard`).
 */
import type { ChartConfig } from "./DecisionChart"

/**
 * Barra com cantos arredondados CIENTE DO SINAL. O recharts, com um `radius`
 * estático [4,4,0,0], desenha valores NEGATIVOS ao contrário (a barra apontava
 * para CIMA em vez de para baixo — ex.: FCF negativo da NVDA Q3'23). Aqui o
 * arredondamento é sempre na extremidade AFASTADA do zero (topo p/ positivos,
 * fundo p/ negativos) e o raio é limitado à altura da barra (barras minúsculas
 * não estouram). Normaliza width/height negativos que o recharts possa passar.
 * `active` (hover) alarga ligeiramente e adiciona traço; `maxR=0` para stacks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RoundedBar = (props: any) => {
  let { x, y, width, height } = props
  const { fill, fillOpacity, stroke, strokeOpacity, strokeDasharray, value, payload, dataKey } = props
  const maxR = props.maxR ?? 4
  const active = props.active
  if (width < 0) { x += width; width = -width }
  if (height < 0) { y += height; height = -height }
  if (width <= 0 || height <= 0) return null
  if (active) { const grow = Math.min(6, Math.max(3, width * 0.18)); x -= grow / 2; width += grow }
  const raw = value ?? (payload && dataKey != null ? payload[dataKey] : undefined)
  const v = Array.isArray(raw) ? raw[raw.length - 1] : raw
  const negative = Number(v) < 0
  const r = Math.max(0, Math.min(maxR, width / 2, height))
  const d = negative
    ? `M${x},${y} h${width} v${height - r} a${r},${r} 0 0 1 ${-r},${r} h${-(width - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} Z`
    : `M${x},${y + r} a${r},${r} 0 0 1 ${r},${-r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${height - r} h${-width} Z`
  return (
    <path d={d} fill={fill} fillOpacity={fillOpacity ?? 1}
      stroke={active ? fill : stroke} strokeOpacity={active ? 0.55 : strokeOpacity}
      strokeDasharray={strokeDasharray} />
  )
}

type Formattable = Pick<ChartConfig, "isPercentage" | "isCurrency" | "isLargeNumber">

/**
 * Formatador compacto para ticks de eixo e rótulos (ex.: `$1.2B`, `43%`).
 * NaN/Infinity (ex.: margem com revenue 0 em dados antigos) nunca pode chegar
 * ao ecrã como "NaN%" — é N/A.
 */
export function makeAxisFormatter(config: Formattable, currencySymbol: string) {
  return (val: number | string | null): string => {
    if (val === null || val === undefined) return "N/A"
    const num = Number(val)
    if (!Number.isFinite(num)) return "N/A"
    if (config.isPercentage) return `${(num * 100).toFixed(0)}%`

    const absVal = Math.abs(num)

    if (config.isCurrency || config.isLargeNumber) {
      const formatter = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 })
      const formatted = formatter.format(absVal)
      if (config.isCurrency) return num < 0 ? `-${currencySymbol}${formatted}` : `${currencySymbol}${formatted}`
      return num < 0 ? `-${formatted}` : formatted
    }

    return num < 0 ? `-${absVal.toFixed(2)}` : absVal.toFixed(2)
  }
}

/** Formatador preciso (2 casas) para tooltips e tabelas. */
export function makeDetailFormatter(config: Formattable, currencySymbol: string) {
  return (val: number | string | null): string => {
    if (val === null || val === undefined) return "N/A"
    const num = Number(val)
    if (!Number.isFinite(num)) return "N/A"
    if (config.isPercentage) return `${(num * 100).toFixed(2)}%`

    const absVal = Math.abs(num)
    const dec = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const

    if (config.isCurrency || config.isLargeNumber) {
      let formatted: string
      if (absVal >= 1_000_000_000) formatted = `${(absVal / 1_000_000_000).toLocaleString("en-US", dec)}B`
      else if (absVal >= 1_000_000) formatted = `${(absVal / 1_000_000).toLocaleString("en-US", dec)}M`
      else formatted = absVal.toLocaleString("en-US", dec)
      if (config.isCurrency) return num < 0 ? `-${currencySymbol}${formatted}` : `${currencySymbol}${formatted}`
      return num < 0 ? `-${formatted}` : formatted
    }

    return num < 0 ? `-${absVal.toLocaleString("en-US", dec)}` : absVal.toLocaleString("en-US", dec)
  }
}
