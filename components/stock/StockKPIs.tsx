"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import type { Fundamental } from "@prisma/client"
import { BrainCircuit, Lock, ExternalLink, Loader2, FileText, ChevronRight } from "lucide-react"
import {
  LineChart, Line, YAxis, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { extractKpisAction } from "@/app/actions/extractKpis"
import { useRouter } from "next/navigation"

type StockKPIsProps = {
  fundamentals: Fundamental[]
  isPro?: boolean
  ticker?: string
}

// Custom Tooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].payload.value
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

export function StockKPIs({ fundamentals, isPro, ticker }: StockKPIsProps) {
  const t = useTranslations("stock")
  const router = useRouter()
  const [isExtracting, setIsExtracting] = useState(false)
  
  // State for the Source Dialog
  const [sourceDialog, setSourceDialog] = useState<{ isOpen: boolean, quote: string, url: string, kpiName: string } | null>(null)

  // Parse data
  const kpiData = useMemo(() => {
    if (!fundamentals || fundamentals.length === 0) return []

    const allKpiKeys = new Set<string>()
    fundamentals.forEach(fund => {
      const kpis = fund.businessKpis as any
      if (kpis && typeof kpis === 'object') {
        // filter out _metadata
        Object.keys(kpis).forEach(k => {
          if (k !== '_metadata') allKpiKeys.add(k)
        })
      }
    })

    if (allKpiKeys.size === 0) return []

    const chronoSorted = [...fundamentals].reverse()
    const results = []

    for (const kpiName of Array.from(allKpiKeys)) {
      let latestFoundValue: number | null = null;
      let latestQuote: string | null = null;
      let latestInsight: string | null = null;
      let latestSecUrl: string | null = null;
      
      let history = chronoSorted.map(fund => {
        const periodStr = fund.periodType === 'QUARTERLY' 
          ? `Q${fund.fiscalQuarter} '${String(fund.fiscalYear).slice(-2)}`
          : `'${String(fund.fiscalYear).slice(-2)}`
          
        const kpisDict = fund.businessKpis as any
        let val: number | null = null;
        let quote: string | null = null;

        if (kpisDict && kpisDict[kpiName] !== undefined) {
          const item = kpisDict[kpiName]
          if (typeof item === 'object' && item !== null) {
            val = item.value
            quote = item.quote
            if (item.insight) latestInsight = item.insight
          } else {
            val = item
          }
        }
        
        if (val !== null && val !== undefined) {
           latestFoundValue = val;
           if (quote) latestQuote = quote;
           if (kpisDict && kpisDict._metadata && kpisDict._metadata.secUrl) {
             latestSecUrl = kpisDict._metadata.secUrl
           }
        }

        return {
          period: periodStr,
          value: val !== null && val !== undefined ? val : 0,
          _hasData: val !== null && val !== undefined
        }
      })

      // Remove leading empty years so the graph only starts when data begins
      const firstValidIndex = history.findIndex(h => h._hasData)
      let trimmedHistory = history
      if (firstValidIndex > 0) {
        trimmedHistory = history.slice(firstValidIndex)
      }

      const formattedLatest = new Intl.NumberFormat('en-US', {
        notation: "compact",
        maximumFractionDigits: 1
      }).format(Number(latestFoundValue) || 0)

      results.push({
        kpiName,
        latestValue: formattedLatest,
        history: trimmedHistory,
        quote: latestQuote,
        insight: latestInsight,
        secUrl: latestSecUrl
      })
    }

    return results
  }, [fundamentals])

  const handleExtract = async () => {
    if (!ticker) return
    setIsExtracting(true)
    const res = await extractKpisAction(ticker)
    setIsExtracting(false)
    if (res.success) {
      // The server action revalidates the path, UI will update automatically
    } else {
      alert(res.error || "Failed to extract KPIs")
    }
  }

  const openSource = (kpiName: string, quote: string, url: string) => {
    setSourceDialog({ isOpen: true, quote, url, kpiName })
  }

  const handleOpenSec = () => {
    if (!sourceDialog) return
    
    // Create a highly robust Text Fragment for Chrome/Edge
    // Syntax: #:~:text=[prefix-,]textStart[,textEnd][,-suffix]
    const cleanQuote = sourceDialog.quote.replace(/[\n\r]+/g, ' ').trim()
    const words = cleanQuote.split(' ').filter(w => w.length > 0)
    
    let textFragment = ''
    const numberWords = words.filter(w => /\d/.test(w)).length
    const isTableRow = (numberWords / words.length) > 0.3 || words.length < 8

    if (words.length <= 1) {
      textFragment = `#:~:text=${encodeURIComponent(cleanQuote)}`
    } else if (isTableRow) {
      // HTML tables break exact matches if we span across <td> blocks.
      // Using exactly 1 word for start and 1 word for end guarantees we don't cross a block boundary inside the marker itself.
      // Since it's a table row, the numbers are usually highly unique (e.g. "5,718", "4,988"), so it won't highlight the wrong thing.
      textFragment = `#:~:text=${encodeURIComponent(words[0])},${encodeURIComponent(words[words.length - 1])}`
    } else {
      // For natural language paragraphs, use 3 words to guarantee uniqueness and avoid highlighting the wrong paragraph.
      const start = words.slice(0, 3).join(' ')
      const end = words.slice(-3).join(' ')
      textFragment = `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`
    }
    
    window.open(sourceDialog.url + textFragment, '_blank')
    setSourceDialog(null)
  }

  // Se não há KPIs, mostra o paywall / extração
  if (kpiData.length === 0) {
    return (
      <div className="glass mt-8 relative overflow-hidden rounded-2xl p-8 md:p-12 text-center">
        <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto space-y-6">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary border border-primary/15">
            <BrainCircuit className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-foreground mb-2">Deep AI Business KPIs</h3>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Unlock the exact segment revenues for {ticker} extracted directly from official SEC 10-K filings using our Gemini AI engine, complete with source citations.
            </p>
          </div>
          
          {isPro ? (
            <Button 
              size="lg" 
              onClick={handleExtract} 
              disabled={isExtracting}
              className="gap-2 font-semibold shadow-lg hover:shadow-primary/25 transition-all w-full sm:w-auto"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Extracting 10-K Data... (Takes ~15s)
                </>
              ) : (
                <>
                  <BrainCircuit className="w-5 h-5" />
                  Generate AI Analysis
                </>
              )}
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" className="gap-2 font-semibold bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary" onClick={() => router.push('/pricing')}>
                <Lock className="w-4 h-4" />
                Upgrade to Pro to Unlock
              </Button>
              <p className="text-xs text-muted-foreground">Pro users get unlimited on-demand AI extractions.</p>
            </div>
          )}
        </div>
      </div>
    )
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
            className="glass group relative flex flex-col justify-between overflow-hidden rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-0.5"
          >
            {/* Cabecalho do Cartao */}
            <div className="mb-4 z-10 flex justify-between items-start">
              <div className="max-w-[85%]">
                <h3 className="text-sm font-medium text-muted-foreground line-clamp-1 group-hover:text-foreground transition-colors duration-300" title={kpi.kpiName}>
                  {kpi.kpiName}
                </h3>
                <p className="text-2xl font-bold tracking-tight text-foreground mt-1 font-mono">
                  {kpi.latestValue}
                </p>
              </div>
              {kpi.quote && kpi.secUrl && (
                <button 
                  onClick={() => openSource(kpi.kpiName, kpi.quote!, kpi.secUrl!)}
                  className="p-1.5 rounded-md bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-colors shrink-0 tooltip-trigger"
                  title="View Source Citation"
                >
                  <FileText className="w-4 h-4" />
                </button>
              )}
            </div>

            {kpi.insight && (
              <div className="mb-2 text-xs text-muted-foreground/90 leading-relaxed border-l-2 border-primary/30 pl-2">
                {kpi.insight}
              </div>
            )}

            {/* Grafico com Eixos */}
            <div className="h-36 w-full mt-6 z-10 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={kpi.history} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <XAxis 
                    dataKey="period" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    dy={10}
                  />
                  <YAxis 
                    domain={[(dataMin: number) => dataMin > 0 ? dataMin * 0.9 : dataMin * 1.1, (dataMax: number) => dataMax > 0 ? dataMax * 1.1 : dataMax * 0.9]} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val)}
                    width={40}
                  />
                  <RechartsTooltip 
                    content={<CustomTooltip />} 
                    cursor={{ stroke: 'var(--primary)', strokeOpacity: 0.2, strokeWidth: 2, strokeDasharray: '4 4' }}
                  />
                  <Line 
                    type="linear" 
                    dataKey="value" 
                    stroke="var(--primary)" 
                    strokeWidth={2}
                    dot={{ r: 3, fill: "var(--background)", stroke: "var(--primary)", strokeWidth: 2 }}
                    activeDot={{ r: 5, strokeWidth: 0, fill: "var(--primary)" }}
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

      {/* Dialog da Fonte / Grounding */}
      <Dialog open={sourceDialog?.isOpen || false} onOpenChange={(open) => !open && setSourceDialog(null)}>
        <DialogContent className="sm:max-w-md [&_*:focus]:outline-none focus:outline-none">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              Source Grounding
            </DialogTitle>
            <DialogDescription>
              Abaixo encontra-se a citação exata de onde a IA extraiu a métrica <strong className="text-foreground">{sourceDialog?.kpiName}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-5 bg-muted/50 rounded-lg border border-border text-sm my-2 text-foreground/90 border-l-4 border-l-primary relative overflow-hidden">
            <span className="text-6xl text-primary/10 absolute -top-2 left-2 pointer-events-none">"</span>
            <span className="relative z-10 leading-relaxed text-[15px]">{sourceDialog?.quote}</span>
          </div>

          <DialogFooter className="sm:justify-between items-center mt-2">
            {/* @ts-ignore */}
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Voltar
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleOpenSec} className="gap-2 shadow-md">
              Ver no 10-K da SEC
              <ExternalLink className="w-4 h-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
