"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import type { Fundamental } from "@prisma/client"
import { BrainCircuit } from "lucide-react"
import {
  LineChart,
  Line,
  YAxis,
  XAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts"

type StockKPIsProps = {
  fundamentals: Fundamental[]
}

// 1. Definição do CustomTooltip FORA do componente principal (Regra de Performance)
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value
    const formattedVal = new Intl.NumberFormat('en-US', {
      notation: "compact",
      maximumFractionDigits: 2
    }).format(val)

    return (
      <div className="rounded-lg bg-popover/90 backdrop-blur-sm border border-border/50 p-2 shadow-xl text-sm">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        <p className="text-primary font-mono">{formattedVal}</p>
      </div>
    )
  }
  return null
}

export function StockKPIs({ fundamentals }: StockKPIsProps) {
  const t = useTranslations("stock")

  // Prepara os dados temporais para cada KPI encontrado no trimestre mais recente
  const kpiData = useMemo(() => {
    if (!fundamentals || fundamentals.length === 0) return []

    // Coleciona todas as chaves de KPIs de todos os períodos para garantir que não falha se o mais recente estiver vazio
    const allKpiKeys = new Set<string>()
    fundamentals.forEach(fund => {
      const kpis = fund.businessKpis as Record<string, number> | null
      if (kpis) {
        Object.keys(kpis).forEach(k => allKpiKeys.add(k))
      }
    })

    if (allKpiKeys.size === 0) return []

    // Para colocar no gráfico da esquerda (mais antigo) para a direita (mais recente), revertemos a ordem
    const chronoSorted = [...fundamentals].reverse()

    const results = []

    for (const kpiName of Array.from(allKpiKeys)) {
      let latestFoundValue: number | null = null;
      
      const history = chronoSorted.map(fund => {
        const periodStr = fund.periodType === 'QUARTERLY' 
          ? `Q${fund.fiscalQuarter} '${String(fund.fiscalYear).slice(-2)}`
          : `'${String(fund.fiscalYear).slice(-2)}`
          
        const kpisDict = fund.businessKpis as Record<string, number> | null
        const val = kpisDict ? kpisDict[kpiName] : null
        
        if (val !== null && val !== undefined) {
           latestFoundValue = val;
        }

        return {
          period: periodStr,
          value: val !== null && val !== undefined ? val : 0 // Fallback seguro
        }
      })

      // Formatação bonita para o valor atual no título do cartão
      const formattedLatest = new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(Number(latestFoundValue) || 0)

      results.push({
        kpiName,
        latestValue: formattedLatest,
        history
      })
    }

    return results
  }, [fundamentals])

  if (kpiData.length === 0) {
    return null // Se não há KPIs, esconde a secção
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Business KPIs
        </h2>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold uppercase tracking-wider">
          <BrainCircuit className="w-3.5 h-3.5" />
          <span>AI Extracted</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {kpiData.map((kpi, idx) => (
          <div 
            key={idx} 
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-card/40 backdrop-blur-md border border-border/40 p-4 transition-all duration-300 hover:bg-card/60 hover:shadow-[0_0_30px_-5px_rgba(var(--primary),0.1)] hover:border-primary/30"
          >
            {/* Cabecalho do Cartao */}
            <div className="mb-4 z-10">
              <h3 className="text-sm font-medium text-muted-foreground line-clamp-1 group-hover:text-foreground transition-colors duration-300" title={kpi.kpiName}>
                {kpi.kpiName}
              </h3>
              <p className="text-2xl font-bold tracking-tight text-foreground mt-1 font-mono">
                {kpi.latestValue}
              </p>
            </div>

            {/* Grafico Sparkline */}
            <div className="h-16 w-full mt-auto z-10 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={kpi.history} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <XAxis dataKey="period" hide />
                  <YAxis 
                    hide 
                    // Prevenção de Flatline Bug (Regra Obrigatória)
                    domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']} 
                  />
                  <Tooltip 
                    content={<CustomTooltip />} 
                    cursor={{ stroke: 'var(--primary)', strokeOpacity: 0.2, strokeWidth: 2, strokeDasharray: '4 4' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="var(--primary)" 
                    strokeWidth={2}
                    dot={{ r: 0, fill: "var(--primary)", strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "var(--primary)" }}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Subtle Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          </div>
        ))}
      </div>
    </div>
  )
}
