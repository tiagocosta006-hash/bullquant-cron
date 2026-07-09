"use client"

import { useState, useEffect, useMemo } from "react"
import { DecisionChart } from "./DecisionChart"
import { useTranslations } from "next-intl"

type PeriodType = "QUARTERLY" | "TTM" | "ANNUAL"

// Linha de fundamentais serializada (Decimals do Prisma já convertidos para number).
type FundamentalRow = {
  periodType?: string
  fiscalYear?: number
  fiscalQuarter?: number | null
  label?: string
  revenue?: number | null
  grossProfit?: number | null
  operatingIncome?: number | null
  netIncome?: number | null
  ebitda?: number | null
  operatingCashFlow?: number | null
  capex?: number | null
  freeCashFlow?: number | null
  epsDiluted?: number | null
  operatingExpenses?: number | null
  returnOnEquity?: number | null
  researchAndDevelopment?: number | null
  sellingGeneralAndAdmin?: number | null
  cash?: number | null
  totalDebt?: number | null
  sharesOutstanding?: number | null
  grossMargin?: number | null
  operatingMargin?: number | null
  netMargin?: number | null
  profitMargin?: number | null
  roic?: number | null
  dividendPerShare?: number | null
  revenueSegments?: Record<string, number> | null
  businessKpis?: Record<string, number> | null
}

export function FinancialsEngine({ ticker, sector, currencySymbol = "$" }: { ticker: string, sector?: string | null, currencySymbol?: string }) {
  const t = useTranslations("financials")
  const isBank = sector === "Financials"
  const isReit = sector === "Real Estate"
  const [data, setData] = useState<FundamentalRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodType>("ANNUAL")
  
  // Ratios internal tab state
  const [ratioTab, setRatioTab] = useState<"ROIC" | "ROE" | "GROSS" | "OPERATING" | "PROFIT">(isBank ? "ROE" : "ROIC")

  useEffect(() => {
    async function fetchFundamentals() {
      try {
        const res = await fetch(`/api/fundamentals/${ticker}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error("Failed to fetch fundamentals", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchFundamentals()
  }, [ticker])

  const processedData = useMemo(() => {
    if (data.length === 0) return []

    if (period === "ANNUAL") {
      const annuals = data.filter(d => d.periodType === "ANNUAL")
      return annuals.map(a => ({
        ...a,
        label: `${a.fiscalYear}`
      }))
    }

    const quarterlies = data.filter(d => d.periodType === "QUARTERLY")

    if (period === "QUARTERLY") {
      return quarterlies.map(q => ({
        ...q,
        label: `Q${q.fiscalQuarter} '${String(q.fiscalYear).slice(2)}`
      }))
    }

    // TTM Calculation
    if (period === "TTM") {
      const ttmData = []
      // Start from the 4th quarter available to calculate a full TTM
      for (let i = 3; i < quarterlies.length; i++) {
        const current = quarterlies[i]
        const last4 = quarterlies.slice(i - 3, i + 1)
        
        // Sum flows
        const revenue = last4.reduce((acc, q) => acc + (q.revenue || 0), 0)
        const netIncome = last4.reduce((acc, q) => acc + (q.netIncome || 0), 0)
        const ebitda = last4.reduce((acc, q) => acc + (q.ebitda || 0), 0)
        const operatingCashFlow = last4.reduce((acc, q) => acc + (q.operatingCashFlow || 0), 0)
        const capex = last4.reduce((acc, q) => acc + (q.capex || 0), 0)
        const freeCashFlow = operatingCashFlow - capex
        const epsDiluted = last4.reduce((acc, q) => acc + (q.epsDiluted || 0), 0)
        const opEx = last4.reduce((acc, q) => acc + (q.operatingExpenses || 0), 0)
        const rAndD = last4.reduce((acc, q) => acc + (q.researchAndDevelopment || 0), 0)
        const sga = last4.reduce((acc, q) => acc + (q.sellingGeneralAndAdmin || 0), 0)
        
        // Latest for balance sheet/ratios
        const cash = current.cash
        const totalDebt = current.totalDebt
        const sharesOutstanding = current.sharesOutstanding
        const grossMargin = last4.reduce((acc, q) => acc + (q.grossProfit || 0), 0) / revenue
        const operatingMargin = last4.reduce((acc, q) => acc + (q.operatingIncome || 0), 0) / revenue
        const profitMargin = netIncome / revenue
        const roic = current.roic 
        const returnOnEquity = current.returnOnEquity
        const dividendPerShare = last4.reduce((acc, q) => acc + (q.dividendPerShare || 0), 0)

        // Segments
        const segments: Record<string, number> = {}
        last4.forEach(q => {
          const segs = q.revenueSegments
          if (segs) {
            Object.keys(segs).forEach(k => {
              segments[k] = (segments[k] || 0) + segs[k]
            })
          }
        })

        // Business KPIs (latest for TTM, same as snapshot)
        const kpis: Record<string, number> = {}
        if (current.businessKpis) {
          Object.assign(kpis, current.businessKpis)
        }

        ttmData.push({
          label: `TTM Q${current.fiscalQuarter} '${String(current.fiscalYear).slice(2)}`,
          revenue, netIncome, ebitda, operatingCashFlow, capex, freeCashFlow, epsDiluted,
          operatingExpenses: opEx, researchAndDevelopment: rAndD, sellingGeneralAndAdmin: sga,
          cash, totalDebt, sharesOutstanding, grossMargin, operatingMargin, profitMargin,
          roic, returnOnEquity, dividendPerShare, revenueSegments: segments,
          businessKpis: kpis
        })
      }
      return ttmData
    }

    return []
  }, [data, period])

  const calcCAGR = (key: string) => {
    if (processedData.length < 2) return null
    const row0 = processedData[0] as Record<string, unknown>
    const rowN = processedData[processedData.length - 1] as Record<string, unknown>
    const start = Number(row0[key] ?? 0)
    const end = Number(rowN[key] ?? 0)
    if (!start || !end || start <= 0) return null
    const years = period === "ANNUAL" ? processedData.length - 1 : (processedData.length - 1) / 4
    if (years <= 0) return null
    return Math.pow(end / start, 1 / years) - 1
  }

  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center animate-pulse bg-card rounded-xl border border-border/40 mt-8">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    )
  }

  // Pre-process segments and KPIs for dynamic keys
  let segmentKeys: string[] = []
  const periodWithSegments = processedData.find(d => d.revenueSegments && Object.keys(d.revenueSegments).length > 0)
  if (periodWithSegments) {
    segmentKeys = Object.keys(periodWithSegments.revenueSegments as Record<string, number>)
  }
  
  // Flatten segments into main object for Recharts
  const chartData = processedData.map(d => ({
    ...d,
    profitMargin: d.profitMargin !== undefined ? d.profitMargin : d.netMargin,
    operatingExpenses: (d.operatingExpenses !== null && d.operatingExpenses !== undefined) ? d.operatingExpenses : (d.sellingGeneralAndAdmin !== null && d.sellingGeneralAndAdmin !== undefined ? d.sellingGeneralAndAdmin : null),
    ...d.revenueSegments,
    capexInv: d.capex ? -d.capex : 0 // Negative capex for composed chart
  }))

  const segmentColors = ['#f97316', '#fcd34d', '#fde047', '#86efac', '#38bdf8', '#c084fc']

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold tracking-tight">{t('engineTitle')}</h2>
        <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 w-fit">
          {(["QUARTERLY", "TTM", "ANNUAL"] as PeriodType[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                period === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`periods.${p.toLowerCase()}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.revenue')} 
          data={chartData} 
          type="BAR" 
          config={{ isCurrency: true, dataKeys: [{ key: 'revenue', color: 'var(--chart-1)', type: 'bar' }] }} 
          cagr={calcCAGR('revenue')}
        />

        {segmentKeys.length > 0 && (
          <DecisionChart currencySymbol={currencySymbol} 
            title={t('charts.revenueBySegment')} 
            data={chartData} 
            type="STACKED_BAR" 
            config={{ 
              isCurrency: true, 
              dataKeys: segmentKeys.map((k, i) => ({ key: k, color: segmentColors[i % segmentColors.length], type: 'bar', stackId: 'a' })) 
            }} 
          />
        )}
        
        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.epsDiluted')} 
          data={chartData} 
          type="BAR" 
          config={{ dataKeys: [{ key: 'epsDiluted', color: 'var(--chart-1)', type: 'bar' }] }} 
          cagr={calcCAGR('epsDiluted')}
        />

        {!isBank && (
          <DecisionChart currencySymbol={currencySymbol} 
            title={isReit ? "AFFO / FCF" : t('charts.freeCashFlow')} 
            data={chartData} 
            type="COMPOSED" 
            config={{ 
              isCurrency: true,
              dataKeys: [
                { key: 'freeCashFlow', name: 'FCF', color: 'var(--chart-1)', type: 'bar' },
                { key: 'operatingCashFlow', name: 'OCF', color: 'var(--chart-5)', type: 'line' },
                { key: 'capex', name: 'CapEx', color: 'var(--chart-4)', type: 'line' }
              ],
              defaultHiddenKeys: ['operatingCashFlow', 'capex']
            }} 
            cagr={calcCAGR('freeCashFlow')}
            infoTooltip={isReit ? "Para Fundos Imobiliários (REITs), o CapEx reflete os custos de manutenção imobiliária e de arrendamento, resultando numa proxy para o AFFO." : undefined}
          />
        )}

        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.netIncome')} 
          data={chartData} 
          type="BAR" 
          config={{ isCurrency: true, dataKeys: [{ key: 'netIncome', color: 'var(--chart-1)', type: 'bar' }] }} 
          cagr={calcCAGR('netIncome')}
        />

        {!isBank && (
          <DecisionChart currencySymbol={currencySymbol} 
            title={t('charts.ebitda')} 
            data={chartData} 
            type="BAR" 
            config={{ isCurrency: true, dataKeys: [{ key: 'ebitda', color: 'var(--chart-1)', type: 'bar' }] }} 
            cagr={calcCAGR('ebitda')}
          />
        )}

        <DecisionChart currencySymbol={currencySymbol} 
          title={isBank ? "Operating Expenses" : t('charts.expenses')} 
          data={chartData} 
          type={isBank ? "BAR" : "STACKED_BAR"} 
          config={{ 
            isCurrency: true,
            dataKeys: isBank ? [
              { key: 'operatingExpenses', name: 'OpEx', color: 'var(--chart-4)', type: 'bar' }
            ] : [
              { key: 'researchAndDevelopment', name: 'R&D', color: 'var(--chart-5)', type: 'bar', stackId: 'a' },
              { key: 'sellingGeneralAndAdmin', name: 'SG&A', color: 'var(--chart-4)', type: 'bar', stackId: 'a' },
              { key: 'capex', name: 'CapEx', color: 'var(--chart-1)', type: 'bar', stackId: 'a' }
            ] 
          }} 
        />

        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.cashDebt')} 
          data={chartData} 
          type="BAR" 
          config={{ 
            isCurrency: true,
            dataKeys: [
              { key: 'cash', name: 'Cash', color: 'var(--bull)', type: 'bar' },
              { key: 'totalDebt', name: 'Debt', color: 'var(--bear)', type: 'bar' }
            ] 
          }} 
        />

        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.sharesOutstanding')} 
          data={chartData} 
          type="BAR" 
          config={{ dataKeys: [{ key: 'sharesOutstanding', color: 'var(--chart-4)', type: 'bar' }], inverseColors: true, isLargeNumber: true }} 
          cagr={calcCAGR('sharesOutstanding')}
        />

        <DecisionChart currencySymbol={currencySymbol} 
          title={t('charts.dividends')} 
          data={chartData} 
          type="BAR" 
          config={{ dataKeys: [{ key: 'dividendPerShare', name: 'Dividend/Share', color: 'var(--chart-1)', type: 'bar' }] }} 
          cagr={calcCAGR('dividendPerShare')}
          emptyMessage="Esta empresa não distribui dividendos."
        />

        {/* 4-in-1 Ratios Card */}
        {(() => {
            const tabs = (
              <div className="flex bg-muted/50 p-1 rounded-md border border-border/40">
                {(["ROIC", "ROE", "GROSS", "OPERATING", "PROFIT"] as const)
                  .filter(tab => {
                    if (isBank && (tab === "ROIC" || tab === "GROSS")) return false;
                    if (!isBank && tab === "ROE") return false;
                    return true;
                  })
                  .map(tab => (
                  <button
                    key={tab}
                    onClick={(e) => { e.stopPropagation(); setRatioTab(tab) }}
                    className={`px-2 py-1 text-xs font-semibold rounded-sm transition-all whitespace-nowrap shrink-0 ${
                      ratioTab === tab ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(`ratios.${tab.toLowerCase()}`)}
                  </button>
                ))}
              </div>
            );

            return (
              <>
                {ratioTab === "ROIC" && <DecisionChart currencySymbol={currencySymbol} title={t('charts.roic')} data={chartData} type="COMPOSED" headerExtra={tabs} config={{ isPercentage: true, dataKeys: [{ key: 'roic', color: 'var(--chart-1)', type: 'bar' }], referenceLine: { y: 0.15, color: 'var(--bull)', label: '15%' } }} />}
                {ratioTab === "ROE" && <DecisionChart currencySymbol={currencySymbol} title="Return on Equity" data={chartData} type="BAR" headerExtra={tabs} config={{ isPercentage: true, dataKeys: [{ key: 'returnOnEquity', color: 'var(--chart-1)', type: 'bar' }] }} />}
                {ratioTab === "GROSS" && <DecisionChart currencySymbol={currencySymbol} title={t('charts.grossMargin')} data={chartData} type="LINE" headerExtra={tabs} config={{ isPercentage: true, dataKeys: [{ key: 'grossMargin', color: 'var(--chart-1)', type: 'line' }] }} />}
                {ratioTab === "OPERATING" && <DecisionChart currencySymbol={currencySymbol} title={t('charts.operatingMargin')} data={chartData} type="LINE" headerExtra={tabs} config={{ isPercentage: true, dataKeys: [{ key: 'operatingMargin', color: 'var(--chart-1)', type: 'line' }] }} />}
                {ratioTab === "PROFIT" && <DecisionChart currencySymbol={currencySymbol} title={t('charts.profitMargin')} data={chartData} type="LINE" headerExtra={tabs} config={{ isPercentage: true, dataKeys: [{ key: 'profitMargin', color: 'var(--chart-1)', type: 'line' }] }} />}
              </>
            );
          })()}

      </div>
    </div>
  )
}
