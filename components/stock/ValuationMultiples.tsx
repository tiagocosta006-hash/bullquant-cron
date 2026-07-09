"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Lock, Loader2, LineChart as LineChartIcon } from "lucide-react"
import {
  LineChart, Line, YAxis, XAxis, Tooltip, ResponsiveContainer
} from "recharts"
import { Button } from "@/components/ui/button"

type ValuationData = {
  date: string
  price: number
  pe?: number
  ps?: number
  fcfYield?: number
}

type ValuationMultiplesProps = {
  ticker: string
  isPro?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="rounded-lg bg-popover/90 backdrop-blur-sm border border-border/50 p-3 shadow-xl text-sm">
        <p className="font-semibold text-foreground mb-2 pb-2 border-b border-border/50">{label}</p>
        <div className="space-y-1">
          {data.price && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">${data.price.toFixed(2)}</span>
            </div>
          )}
          {data.pe && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">P/E Ratio</span>
              <span className="font-medium text-blue-500">{data.pe.toFixed(2)}x</span>
            </div>
          )}
          {data.ps && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">P/Sales</span>
              <span className="font-medium text-emerald-500">{data.ps.toFixed(2)}x</span>
            </div>
          )}
          {data.fcfYield && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">FCF Yield</span>
              <span className="font-medium text-amber-500">{(data.fcfYield * 100).toFixed(2)}%</span>
            </div>
          )}
        </div>
      </div>
    )
  }
  return null
}

export function ValuationMultiples({ ticker, isPro }: ValuationMultiplesProps) {
  const t = useTranslations("stock")
  const [data, setData] = useState<ValuationData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"pe" | "ps" | "fcf">("pe")

  useEffect(() => {
    async function fetchValuation() {
      try {
        setLoading(true)
        const res = await fetch(`/api/valuation/${ticker}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch valuation:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchValuation()
  }, [ticker])

  if (loading) {
    return (
      <div className="glass rounded-xl p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return null
  }

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <LineChartIcon className="w-5 h-5 text-primary" />
              Historical Valuation
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              How the market priced the company over time
            </p>
          </div>
          
          <div className="flex gap-1 bg-muted/50 p-1 rounded-md border border-border/40">
            <button 
              onClick={() => setActiveTab("pe")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "pe" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              P/E Ratio
            </button>
            <button 
              onClick={() => setActiveTab("ps")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "ps" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              P/Sales
            </button>
            <button 
              onClick={() => setActiveTab("fcf")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-sm transition-all ${
                activeTab === "fcf" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              FCF Yield
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 relative">
        {/* PRO Gating Overlay */}
        {!isPro && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[4px] p-6 text-center">
            <div className="bg-muted p-4 rounded-full mb-4">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2">PRO Feature</h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Unlock historical valuation charts to see if {ticker} is trading at a premium or discount compared to its historical averages.
            </p>
            <Button size="lg" className="font-semibold shadow-lg shadow-primary/20">
              Upgrade to PRO
            </Button>
          </div>
        )}

        <div className={`h-[350px] w-full ${!isPro ? 'opacity-30 pointer-events-none blur-[2px]' : ''}`}>
          <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`
                }}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => activeTab === 'fcf' ? `${(val*100).toFixed(0)}%` : val}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              {activeTab === "pe" && (
                <Line 
                  type="linear" 
                  dataKey="pe" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: "#3b82f6", stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
              {activeTab === "ps" && (
                <Line 
                  type="linear" 
                  dataKey="ps" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: "#10b981", stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
              {activeTab === "fcf" && (
                <Line 
                  type="linear" 
                  dataKey="fcfYield" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, fill: "#f59e0b", stroke: "var(--background)", strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
