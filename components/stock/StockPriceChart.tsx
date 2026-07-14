"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useTranslations, useLocale } from "next-intl"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea
} from "recharts"
import { TrendingUp, TrendingDown, Download } from "lucide-react"
import { exportSvgToPng } from "@/lib/exportChart"

type PricePoint = {
  date: string
  close: number
}

type TabType = "1m" | "6m" | "1y" | "5y" | "max"

export function StockPriceChart({ ticker, currencySymbol = "$" }: { ticker: string, currencySymbol?: string }) {
  const t = useTranslations("stock.chart")
  const locale = useLocale()
  const [allData, setAllData] = useState<PricePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>("1y")
  const chartRef = useRef<HTMLDivElement>(null)

  // Drag-to-measure state
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null)
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)

  useEffect(() => {
    async function fetchPrices() {
      try {
        const [histRes, liveRes] = await Promise.all([
          fetch(`/api/prices/${ticker}`),
          fetch(`/api/price/${ticker}`)
        ])
        
        if (histRes.ok) {
          const data: PricePoint[] = await histRes.json()
          
          // Se o Finnhub estiver a funcionar, injetamos o preço AO VIVO no final do gráfico histórico!
          if (liveRes.ok) {
            const liveData = await liveRes.json()
            if (liveData && liveData.currentPrice && data.length > 0) {
              const lastHistoricalDate = new Date(data[data.length - 1].date)
              const today = new Date()
              
              // Evitar injetar se já estivermos a mostrar um dado do próprio dia (embora raro)
              if (today.getDate() !== lastHistoricalDate.getDate() || today.getMonth() !== lastHistoricalDate.getMonth()) {
                data.push({
                  date: today.toISOString(),
                  close: liveData.currentPrice
                })
              } else {
                // Se for o mesmo dia, apenas substitui o valor final pelo mais atualizado!
                data[data.length - 1].close = liveData.currentPrice
              }
            }
          }
          
          setAllData(data)
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPrices()
  }, [ticker])

  const filteredData = useMemo(() => {
    if (allData.length === 0) return []
    
    if (activeTab === "max") return allData

    const now = new Date()
    let monthsToSubtract = 0
    if (activeTab === "1m") monthsToSubtract = 1
    if (activeTab === "6m") monthsToSubtract = 6
    if (activeTab === "1y") monthsToSubtract = 12
    if (activeTab === "5y") monthsToSubtract = 60

    const cutoffDate = new Date(now)
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToSubtract)
    
    return allData.filter(p => new Date(p.date) >= cutoffDate)
  }, [allData, activeTab])

  const startPrice = filteredData.length > 0 ? filteredData[0].close : 0
  const endPrice = filteredData.length > 0 ? filteredData[filteredData.length - 1].close : 0
  const changeValue = endPrice - startPrice
  const changePercent = startPrice > 0 ? (changeValue / startPrice) * 100 : 0
  const isPositive = changeValue >= 0

  // Selection mathematical calculations
  const selectionStartPrice = useMemo(() => {
    if (!refAreaLeft) return null
    return filteredData.find(d => d.date === refAreaLeft)?.close ?? null
  }, [filteredData, refAreaLeft])

  const selectionEndPrice = useMemo(() => {
    if (!refAreaRight) return null
    return filteredData.find(d => d.date === refAreaRight)?.close ?? null
  }, [filteredData, refAreaRight])

  const selectionDelta = useMemo(() => {
    if (selectionStartPrice === null || selectionEndPrice === null) return null
    const diff = selectionEndPrice - selectionStartPrice
    const pct = (diff / selectionStartPrice) * 100
    return { diff, pct, isPos: diff >= 0 }
  }, [selectionStartPrice, selectionEndPrice])

  // Chart event handlers for drag selection
  const handleMouseDown = (e: any) => {
    if (!e || !e.activeLabel) {
      setRefAreaLeft(null)
      setRefAreaRight(null)
      return
    }
    setRefAreaLeft(e.activeLabel)
    setRefAreaRight(e.activeLabel)
    setIsSelecting(true)
  }

  const handleMouseMove = (e: any) => {
    if (isSelecting && e && e.activeLabel) {
      setRefAreaRight(e.activeLabel)
    }
  }

  const handleMouseUp = () => {
    if (!isSelecting) return
    setIsSelecting(false)
    
    // Clear selection if the user just clicked without dragging
    if (refAreaLeft === refAreaRight) {
      setRefAreaLeft(null)
      setRefAreaRight(null)
    } else if (refAreaLeft && refAreaRight) {
      // Re-order if dragged from right to left
      const dLeft = new Date(refAreaLeft).getTime()
      const dRight = new Date(refAreaRight).getTime()
      if (dLeft > dRight) {
        setRefAreaLeft(refAreaRight)
        setRefAreaRight(refAreaLeft)
      }
    }
  }

  const clearSelection = () => {
    setRefAreaLeft(null)
    setRefAreaRight(null)
    setIsSelecting(false)
  }

  const tabs: TabType[] = ["1m", "6m", "1y", "5y", "max"]

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(d)
  }

  const formatTooltipDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  }

  const formatSelectionDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  }

  // Custom label renderer for the ReferenceArea overlay (Google Finance style)
  const renderSelectionLabel = (props: any) => {
    const { viewBox } = props;
    if (!viewBox || !selectionDelta) return null;
    
    // Position the label inside the selection box, near the top right or top left
    // We'll use foreignObject to render standard HTML/Tailwind inside the SVG
    return (
      <foreignObject 
        x={viewBox.x} 
        y={viewBox.y} 
        width={Math.max(viewBox.width, 300)} 
        height={40} 
        style={{ overflow: 'visible' }}
      >
        <div className="flex w-fit items-center gap-1.5 px-2 py-1 mt-1 ml-1 rounded-md bg-background/90 backdrop-blur-sm border border-border/50 text-xs font-semibold shadow-sm animate-in fade-in zoom-in-95">
          <span className={selectionDelta.isPos ? 'text-bull' : 'text-bear'}>
            {selectionDelta.isPos ? '+' : '-'}{currencySymbol}{Math.abs(selectionDelta.diff).toFixed(2)} ({Math.abs(selectionDelta.pct).toFixed(2)}%)
          </span>
          <span className={selectionDelta.isPos ? 'text-bull' : 'text-bear'}>
            {selectionDelta.isPos ? '↑' : '↓'}
          </span>
          <span className="text-muted-foreground ml-1 text-[11px] font-medium">
            {formatSelectionDate(refAreaLeft!)} - {formatSelectionDate(refAreaRight!)}
          </span>
        </div>
      </foreignObject>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-[400px] bg-card border border-border/40 rounded-xl flex items-center justify-center animate-pulse mt-6">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    )
  }

  if (allData.length === 0) {
    return null
  }

  const hasSelection = refAreaLeft && refAreaRight && refAreaLeft !== refAreaRight

  return (
    <div className="w-full bg-card border border-border/40 rounded-xl shadow-sm p-4 md:p-6 mb-8 mt-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 min-h-[64px]">
        {/* Main Header (Static Current Price) */}
        <div>
          <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl font-extrabold tracking-tight text-foreground">
              {currencySymbol}{endPrice.toFixed(2)}
            </span>
            <div className={`flex items-center gap-2 ${isPositive ? 'text-bull' : 'text-bear'}`}>
              <span className={`flex items-center text-sm font-bold px-2 py-0.5 rounded-md ${isPositive ? 'bg-bull/10' : 'bg-bear/10'}`}>
                {isPositive ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                {isPositive ? '+' : '-'}{currencySymbol}{Math.abs(changeValue).toFixed(2)} ({Math.abs(changePercent).toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 w-fit">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                clearSelection()
              }}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-all ${
                activeTab === tab 
                  ? 'bg-background shadow-sm text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
          
          {/* Export Button */}
          <button
            onClick={() => {
              if (chartRef.current) {
                exportSvgToPng(chartRef.current, `${ticker}-price-chart.png`);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 ml-2 text-sm font-semibold rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-background shadow-sm border border-transparent hover:border-border/40"
            title="Download Chart"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={chartRef} className="h-[300px] w-full relative select-none focus:outline-none focus-visible:outline-none [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
          <AreaChart 
            data={filteredData} 
            margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="outline-none focus:outline-none"
          >
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSelectionBull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.2}/>
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.05}/>
              </linearGradient>
              <linearGradient id="colorSelectionBear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.2}/>
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate} 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#888888', fontSize: 12 }}
              minTickGap={30}
            />
            <YAxis 
              domain={['auto', 'auto']} 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#888888', fontSize: 12 }}
              tickFormatter={(val) => `${currencySymbol}${val}`}
              width={60}
              orientation="right"
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background border border-border/50 p-3 rounded-lg shadow-xl pointer-events-none">
                      <p className="text-muted-foreground text-xs font-medium mb-1">
                        {label != null ? formatTooltipDate(String(label)) : ''}
                      </p>
                      <p className="font-bold text-foreground text-lg">
                        {currencySymbol}{Number(payload[0].value).toFixed(2)}
                      </p>
                    </div>
                  )
                }
                return null
              }}
            />
            
            {hasSelection && (
              <ReferenceArea
                x1={refAreaLeft}
                x2={refAreaRight}
                strokeOpacity={0.5}
                fillOpacity={1}
                fill={selectionDelta?.isPos ? 'url(#colorSelectionBull)' : 'url(#colorSelectionBear)'}
                strokeDasharray="3 3"
                stroke={selectionDelta?.isPos ? '#10b981' : '#f43f5e'}
                label={renderSelectionLabel}
              />
            )}

            <Area 
              type="linear" 
              dataKey="close" 
              stroke={isPositive ? '#10b981' : '#f43f5e'} 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#colorPrice)" 
              animationDuration={500}
              activeDot={{ r: 5, strokeWidth: 2, fill: "var(--background)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
