"use client"

import { useState, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Loader2, LineChart as LineChartIcon } from "lucide-react"
import { ChartShareButton } from "./ChartShareButton"
import { GraficoMultiplo, estatisticas } from "./GraficoMultiplo"

type ValuationData = {
  date: string
  price: number
  pe?: number
  ps?: number
  fcfYield?: number
  evEbitda?: number
}

type ValuationMultiplesProps = {
  ticker: string
  isPro?: boolean
  isLoggedIn?: boolean
  isDemo?: boolean
}

/**
 * Séries do valuation histórico — a chave de dados e a cor de cada tab, num
 * sítio só (o gráfico e o cartão de partilha têm de concordar).
 *
 * ⚠️ Estes hex são anteriores ao design system e não são tokens `--chart-N`
 * como o resto dos gráficos. Ficam centralizados aqui em vez de repetidos;
 * migrá-los para tokens é uma decisão de design por tomar.
 */
const SERIES = {
  pe: { key: "pe", color: "#3b82f6" },
  ps: { key: "ps", color: "#10b981" },
  fcf: { key: "fcfYield", color: "#f59e0b" },
  ev: { key: "evEbitda", color: "#8b5cf6" },
} as const
type Tab = keyof typeof SERIES
const TABS: Tab[] = ["pe", "ps", "ev", "fcf"]

export function ValuationMultiples({ ticker, isPro, isDemo }: ValuationMultiplesProps) {
  const tChart = useTranslations("stock.valuationChart")
  const tDemo = useTranslations("stock.demoBadge")
  const [data, setData] = useState<ValuationData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("pe")

  useEffect(() => {
    async function fetchValuation() {
      try {
        setLoading(true)
        const res = await fetch(`/api/valuation/${ticker}`)
        if (res.ok) setData(await res.json())
      } catch (error) {
        console.error("Failed to fetch valuation:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchValuation()
  }, [ticker])

  const serie = SERIES[activeTab]
  const nomes: Record<Tab, string> = { pe: tChart("tabPe"), ps: tChart("tabPs"), fcf: tChart("tabFcf"), ev: tChart("tabEv") }
  const pontos = useMemo(
    () => data.map((d) => ({ date: d.date, price: d.price, v: d[serie.key as keyof ValuationData] as number | undefined })),
    [data, serie.key],
  )
  const { media } = useMemo(() => estatisticas(pontos), [pontos])

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!data || data.length === 0) return null

  const eFcf = activeTab === "fcf"
  // O cartão de partilha fala a linguagem do DecisionChart (`label` + séries).
  const shareData = data.map((d) => {
    const date = new Date(d.date)
    return { label: `${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}`, [serie.key]: d[serie.key as keyof ValuationData] }
  })
  const shareAvgLabel = media === undefined ? undefined : `${tChart("avgLabel")}: ${eFcf ? `${(media * 100).toFixed(1)}%` : `${media.toFixed(1)}x`}`

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-primary" />
              {tChart("title")}
              {isDemo && (
                <span title={tDemo("tooltip")} className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {tDemo("label")}
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{tChart("subtitle")}</p>
          </div>
          <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40">
            {TABS.map((k) => (
              <button key={k} onClick={() => setActiveTab(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${activeTab === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {nomes[k]}
              </button>
            ))}
            {/* Só com acesso: exportar o gráfico é exportar dados Pro. */}
            {isPro && (
              <ChartShareButton
                title={`${tChart("title")} · ${nomes[activeTab]}`}
                data={shareData}
                type="LINE"
                config={{
                  isPercentage: eFcf,
                  dataKeys: [{ key: serie.key, color: serie.color, type: "line", name: nomes[activeTab] }],
                  ...(shareAvgLabel && media !== undefined ? { referenceLine: { y: media, label: shareAvgLabel, color: "var(--muted-foreground)" } } : {}),
                }}
                className="ml-1 px-2 py-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              />
            )}
          </div>
        </div>
      </div>
      <div className="p-4 md:p-6 relative">
        <GraficoMultiplo
          pontos={pontos}
          formato={eFcf ? "pct" : "x"}
          cor={serie.color}
          nome={nomes[activeTab]}
          rotulos={{ media: tChart("avgLabel"), mediana: tChart("medianLabel"), preco: tChart("tooltipPrice") }}
        />
      </div>
    </div>
  )
}
