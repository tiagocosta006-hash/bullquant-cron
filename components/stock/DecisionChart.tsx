"use client"

import React, { useState, useMemo } from "react"
import { Maximize2, Table2, BarChart3 } from "lucide-react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend,
  Cell
} from "recharts"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { TooltipProvider, Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useTranslations } from "next-intl"

export type ChartConfig = {
  dataKeys: { key: string; color: string; type: 'bar' | 'line'; stackId?: string; name?: string }[]
  referenceLine?: { y: number; label: string; color: string }
  isCurrency?: boolean
  isPercentage?: boolean
  inverseColors?: boolean
  isLargeNumber?: boolean
  defaultHiddenKeys?: string[]
}

const TIME_FILTERS = ['ALL', '10Y', '5Y', '3Y', '1Y'] as const
type TimeFilter = typeof TIME_FILTERS[number]

type CustomTooltipProps = {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  formatTooltipValue?: (val: number | string | null) => string
}

const CustomTooltip = ({ active, payload, label, formatTooltipValue }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl p-3 text-white min-w-[140px] z-50">
        <p className="font-bold mb-2 text-[13px] text-gray-200">{label}</p>
        <div className="flex flex-col gap-1.5">
          {payload.map((entry, index: number) => (
            <div key={`item-${index}`} className="flex items-center text-[13px] gap-2">
              <div className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="capitalize text-gray-300">{entry.name}:</span>
              <span className="font-semibold ml-auto pl-4">{formatTooltipValue ? formatTooltipValue(entry.value) : entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

interface DecisionChartProps {
  title: string
  data: Record<string, unknown>[]
  type: 'BAR' | 'LINE' | 'COMPOSED' | 'STACKED_BAR'
  config: ChartConfig
  cagr?: number | null
  infoTooltip?: React.ReactNode
  emptyMessage?: string
  headerExtra?: React.ReactNode
}

export function DecisionChart({ title, data, type, config, cagr, infoTooltip, emptyMessage, headerExtra }: DecisionChartProps) {
  const t = useTranslations("stock.chart")
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set(config.defaultHiddenKeys || []))
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL')


  const displayData = useMemo(() => {
    if (timeFilter === 'ALL' || data.length === 0) return data;
    const isQuarterly = String(data[0]?.label ?? '').includes('Q');
    let items = data.length;
    switch(timeFilter) {
      case '1Y': items = isQuarterly ? 4 : 1; break;
      case '3Y': items = isQuarterly ? 12 : 3; break;
      case '5Y': items = isQuarterly ? 20 : 5; break;
      case '10Y': items = isQuarterly ? 40 : 10; break;
    }
    return data.slice(-items);
  }, [data, timeFilter])

  const hasValidData = useMemo(() => {
    if (displayData.length === 0) return false;
    return config.dataKeys.some(k => 
      displayData.some(row => row[k.key] !== null && row[k.key] !== undefined)
    );
  }, [displayData, config.dataKeys])

  const formatValue = (val: number | string | null) => {
    if (val === null || val === undefined) return "N/A"
    const num = Number(val)
    if (config.isPercentage) return `${(num * 100).toFixed(0)}%`
    
    const absVal = Math.abs(num)
    
    if (config.isCurrency || config.isLargeNumber) {
      const formatter = new Intl.NumberFormat('en-US', { notation: "compact", compactDisplay: "short", maximumFractionDigits: 1 })
      const formatted = formatter.format(absVal)
      if (config.isCurrency) return num < 0 ? `-$${formatted}` : `$${formatted}`
      return num < 0 ? `-${formatted}` : formatted
    }
    
    return num < 0 ? `-${absVal.toFixed(2)}` : absVal.toFixed(2)
  }

  const formatTooltipValue = (val: number | string | null) => {
    if (val === null || val === undefined) return "N/A"
    const num = Number(val)
    if (config.isPercentage) return `${(num * 100).toFixed(2)}%`
    
    const absVal = Math.abs(num)
    
    if (config.isCurrency || config.isLargeNumber) {
      let formatted = ""
      if (absVal >= 1_000_000_000) {
        formatted = `${(absVal / 1_000_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}B`
      } else if (absVal >= 1_000_000) {
        formatted = `${(absVal / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`
      } else {
        formatted = `${absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
      if (config.isCurrency) return num < 0 ? `-$${formatted}` : `$${formatted}`
      return num < 0 ? `-${formatted}` : formatted
    }
    
    return num < 0 ? `-${absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : absVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }



  const renderCustomLegend = () => {
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 pt-5 pb-1 select-none">
        {config.dataKeys.map((k) => {
          const isHidden = hiddenKeys.has(k.key)
          return (
            <button
              key={k.key}
              onClick={() => {
                setHiddenKeys(prev => {
                  const next = new Set(prev)
                  if (next.has(k.key)) next.delete(k.key)
                  else next.add(k.key)
                  return next
                })
              }}
              className={`flex items-center gap-2 text-[13px] transition-all duration-200 outline-none focus:outline-none ${isHidden ? 'opacity-40 grayscale' : 'opacity-100 hover:opacity-80'}`}
            >
              <div className="w-3 h-3 rounded-[2px] shrink-0" style={{ backgroundColor: k.color }} />
              <span className={`font-medium text-foreground ${isHidden ? 'line-through text-muted-foreground' : ''}`}>
                {k.name || k.key}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderChart = (height: number | `${number}%` = "100%") => {
    if (!hasValidData) return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5 bg-muted/10 rounded-lg border border-dashed border-border/30 m-2">
        <p className="text-[13px] font-medium text-foreground/70">{t('noData')}</p>
        <p className="text-[11px] opacity-50 text-center px-4">
          {emptyMessage || "Métrica não aplicável (N/A) a este setor."}
        </p>
      </div>
    )

    const ChartComponent = type === 'COMPOSED' || type === 'STACKED_BAR' ? ComposedChart : type === 'LINE' ? LineChart : BarChart

    return (
      <div className="w-full h-full outline-none focus:outline-none focus-visible:outline-none [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
        <ResponsiveContainer width="100%" height={height} className="outline-none focus:outline-none">
          <ChartComponent data={displayData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis 
              dataKey="label" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#a1a1aa', fontSize: 10 }} 
              dy={15}
              interval={displayData.length > 15 ? "preserveEnd" : 0}
              height={40}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tickFormatter={formatValue}
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              width={55}
              domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
            />
            <Tooltip
              content={(props) => {
                const items = (props.payload ?? []).map((p) => ({
                  name: String(p.name ?? ''),
                  value: Number(p.value ?? 0),
                  color: typeof p.color === 'string' ? p.color : '#ffffff',
                }))
                return (
                  <CustomTooltip
                    active={props.active}
                    payload={items}
                    label={props.label != null ? String(props.label) : undefined}
                    formatTooltipValue={formatTooltipValue}
                  />
                )
              }}
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
            />
            {(type === 'STACKED_BAR' || config.dataKeys.length > 1) && (
              <Legend content={renderCustomLegend} />
            )}
            {config.referenceLine && (
              <ReferenceLine y={config.referenceLine.y} stroke={config.referenceLine.color} strokeDasharray="3 3" label={{ position: 'top', value: config.referenceLine.label, fill: config.referenceLine.color, fontSize: 11 }} />
            )}
            
            {config.dataKeys.map((k) => {
              const isHidden = hiddenKeys.has(k.key)
              if (k.type === 'line' || type === 'LINE') {
                return <Line hide={isHidden} key={k.key} type="monotone" dataKey={k.key} name={k.name || k.key} stroke={k.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              }
              return (
                <Bar hide={isHidden} key={k.key} dataKey={k.key} name={k.name || k.key} fill={k.color} stackId={k.stackId} radius={type === 'STACKED_BAR' ? 0 : [4, 4, 0, 0]}>
                  {displayData.map((entry, index) => {
                    let cellColor = k.color
                    if (config.inverseColors) {
                      if (index > 0) {
                        const prev = Number(displayData[index - 1][k.key]) || 0
                        const curr = Number(entry[k.key]) || 0
                        if (curr < prev) cellColor = '#10b981'
                        else if (curr > prev) cellColor = '#f43f5e'
                      } else {
                        cellColor = '#a1a1aa'
                      }
                    }
                    return <Cell key={`cell-${index}`} fill={cellColor} />
                  })}
                </Bar>
              )
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    )
  }

  const renderTable = () => {
    if (!hasValidData) return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5 bg-muted/10 rounded-lg border border-dashed border-border/30 m-2">
        <p className="text-[13px] font-medium text-foreground/70">{t('noData')}</p>
        <p className="text-[11px] opacity-50 text-center px-4">
          {emptyMessage || "Métrica não aplicável (N/A) a este setor."}
        </p>
      </div>
    )
    return (
    <div className="overflow-auto h-full w-full custom-scrollbar">
      <table className="w-full text-sm text-left">
        <thead className="sticky top-0 bg-muted/80 backdrop-blur text-muted-foreground text-xs uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">{t('period')}</th>
            {config.dataKeys.map(k => (
              <th key={k.key} className="px-4 py-2 font-medium text-right">{k.name || k.key}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {displayData.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2 font-medium whitespace-nowrap">{String(row.label ?? '')}</td>
              {config.dataKeys.map(k => (
                <td key={k.key} className="px-4 py-2 text-right tabular-nums">
                  {formatTooltipValue(row[k.key] as number | string | null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    )
  }

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-foreground text-base leading-tight">{title}</h3>
            {infoTooltip && (
              <TooltipProvider delay={100}>
                <UITooltip>
                  <TooltipTrigger
                    render={
                      <span className="cursor-help inline-flex text-muted-foreground hover:text-foreground transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      </span>
                    }
                  />
                  <TooltipContent side="right" className="max-w-[300px] text-[13px] leading-relaxed p-3 bg-[#18181b] border-[#27272a] text-gray-200 shadow-xl">
                    {infoTooltip}
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            )}
          </div>
          {cagr !== undefined && cagr !== null && (
            <p className="text-xs font-semibold text-muted-foreground mt-0.5">
              CAGR: <span className={cagr >= 0 ? "text-bull" : "text-bear"}>{cagr > 0 ? '+' : ''}{(cagr * 100).toFixed(1)}%</span>
            </p>
          )}
        </div>
        {headerExtra && (
          <div className="flex-1 flex justify-center mx-2 hidden sm:flex">
            {headerExtra}
          </div>
        )}
        <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40">
          <button 
            onClick={() => setViewMode('chart')}
            className={`p-1.5 rounded-sm transition-colors ${viewMode === 'chart' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title={t('chartView')}
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-sm transition-colors ${viewMode === 'table' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title={t('tableView')}
          >
            <Table2 className="w-4 h-4" />
          </button>
          <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
            <DialogTrigger 
              className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors ml-1"
              title={t('fullScreen')}
            >
              <Maximize2 className="w-4 h-4" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-5xl w-[90vw] h-[80vh] flex flex-col bg-card border-border/50 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <DialogTitle className="text-xl">{title}</DialogTitle>
                  {headerExtra && <div className="hidden md:block scale-90 origin-left">{headerExtra}</div>}
                </div>
                <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40 mr-6">
                  {TIME_FILTERS.map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeFilter(tf)}
                      className={`px-3 py-1 text-xs rounded-sm transition-colors font-medium ${timeFilter === tf ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 mt-4 min-h-0">
                {viewMode === 'chart' ? renderChart("100%") : renderTable()}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {viewMode === 'chart' ? renderChart("100%") : renderTable()}
      </div>
    </div>
  )

  return (
    <div className="bg-card border border-border/40 rounded-xl p-4 shadow-sm h-[320px] flex flex-col group">
      {content}
    </div>
  )
}
