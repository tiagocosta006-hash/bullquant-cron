"use client"

import { useState, useEffect, useMemo } from "react"
import { Info, BarChart3, FileSpreadsheet } from "lucide-react"
import { DecisionChart } from "./DecisionChart"
import { FinancialStatements } from "./FinancialStatements"
import { useTranslations } from "next-intl"

type PeriodType = "QUARTERLY" | "TTM" | "ANNUAL"

// Linha de fundamentais serializada (Decimals do Prisma já convertidos para number).
type FundamentalRow = {
  periodType?: string
  fiscalYear?: number
  fiscalQuarter?: number | null
  label?: string
  isPreliminary?: boolean
  revenue?: number | null
  costOfRevenue?: number | null
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
  // Demonstrações Contabilísticas Expandidas
  depreciationAndAmortization?: number | null
  interestExpense?: number | null
  netInterestIncome?: number | null
  otherNonOperatingIncome?: number | null
  incomeBeforeTax?: number | null
  taxExpense?: number | null
  cashAndEquivalents?: number | null
  accountsReceivable?: number | null
  inventory?: number | null
  totalCurrentAssets?: number | null
  propertyPlantEquipment?: number | null
  goodwillAndIntangibles?: number | null
  totalAssets?: number | null
  accountsPayable?: number | null
  shortTermDebt?: number | null
  totalCurrentLiabilities?: number | null
  longTermDebt?: number | null
  totalLiabilities?: number | null
  retainedEarnings?: number | null
  totalEquity?: number | null
  stockBasedCompensation?: number | null
  investingCashFlow?: number | null
  shareRepurchases?: number | null
  dividendsPaid?: number | null
  financingCashFlow?: number | null
  netChangeInCash?: number | null
}

export function FinancialsEngine({ ticker, sector, currencySymbol = "$", preliminary = null }: { ticker: string, sector?: string | null, currencySymbol?: string, preliminary?: { fiscalYear: number; fiscalQuarter: number; revenue: number | null; epsDiluted: number | null } | null }) {
  const t = useTranslations("financials")
  const tFs = useTranslations("financialStatements")
  const isBank = sector === "Financials"
  const isReit = sector === "Real Estate"
  const [data, setData] = useState<FundamentalRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [mainView, setMainView] = useState<"charts" | "statements">("charts")
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
      // Soma null-aware (mesma semântica do StockSnapshot): janela toda a
      // null → null (N/A honesto), parcial → soma dos presentes. O antigo
      // `|| 0` transformava buracos legítimos (bancos sem grossProfit,
      // não-pagadores) em zeros indistinguíveis de zeros reais.
      const sumWindow = (rows: FundamentalRow[], key: keyof FundamentalRow): number | null => {
        const vals = rows.map(r => r[key]).filter((v): v is number => typeof v === "number")
        return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0)
      }
      const ttmData = []
      // Start from the 4th quarter available to calculate a full TTM
      for (let i = 3; i < quarterlies.length; i++) {
        const current = quarterlies[i]
        const last4 = quarterlies.slice(i - 3, i + 1)

        // Sum flows
        const revenue = sumWindow(last4, "revenue")
        const netIncome = sumWindow(last4, "netIncome")
        const ebitda = sumWindow(last4, "ebitda")
        const operatingCashFlow = sumWindow(last4, "operatingCashFlow")
        const capex = sumWindow(last4, "capex")
        const freeCashFlow = operatingCashFlow === null ? null : operatingCashFlow - (capex ?? 0)
        const epsDiluted = sumWindow(last4, "epsDiluted")
        const opEx = sumWindow(last4, "operatingExpenses")
        const rAndD = sumWindow(last4, "researchAndDevelopment")
        const sga = sumWindow(last4, "sellingGeneralAndAdmin")

        // Latest for balance sheet/ratios
        const cash = current.cash
        const totalDebt = current.totalDebt
        const sharesOutstanding = current.sharesOutstanding
        // Margens só com denominador real — dividir por 0 dava NaN%/Infinity
        // nos gráficos; numerador todo-null fica N/A em vez de 0%.
        const grossTtm = sumWindow(last4, "grossProfit")
        const opIncTtm = sumWindow(last4, "operatingIncome")
        const grossMargin = revenue !== null && revenue > 0 && grossTtm !== null ? grossTtm / revenue : null
        const operatingMargin = revenue !== null && revenue > 0 && opIncTtm !== null ? opIncTtm / revenue : null
        const profitMargin = revenue !== null && revenue > 0 && netIncome !== null ? netIncome / revenue : null
        const roic = current.roic
        const returnOnEquity = current.returnOnEquity
        const dividendPerShare = sumWindow(last4, "dividendPerShare")

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
    // end <= 0: Math.pow(negativo, 1/n) devolve NaN — melhor N/A que "NaN%"
    if (!start || !end || start <= 0 || end <= 0) return null
    const years = period === "ANNUAL" ? processedData.length - 1 : (processedData.length - 1) / 4
    if (years <= 0) return null
    return Math.pow(end / start, 1 / years) - 1
  }

  // Pre-process segments and KPIs for dynamic keys
  // União de todas as categorias vistas em QUALQUER período, não só num de
  // referência — empresas reorganizam segmentos ao longo do tempo (ex.: MSFT
  // fundiu "Windows"+"Devices" em "Windows and Devices" e dividiu "Office
  // Products and Cloud Services" em "Microsoft 365 Commercial/Consumer" a
  // partir de FY2023) ou entram em novos negócios — usar só um período como
  // referência escondia essas categorias nos restantes anos.
  const segmentKeySet = new Set<string>()
  processedData.forEach(d => {
    if (d.revenueSegments) {
      Object.keys(d.revenueSegments).forEach(k => segmentKeySet.add(k))
    }
  })

  // Paleta categórica validada (CVD-safe, ΔE mínimo entre adjacentes ≥ 12) —
  // nunca gerar uma cor a mais: uma 9ª série não recebe uma nova cor, funde-se
  // em "Other" (regra da skill de dataviz). MAX_SEGMENT_SERIES == nº de cores.
  const segmentColors = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
  const MAX_SEGMENT_SERIES = segmentColors.length

  let segmentKeys = Array.from(segmentKeySet)
  let foldedSegmentKeys: Set<string> | null = null
  if (segmentKeys.length > MAX_SEGMENT_SERIES) {
    const totals = new Map<string, number>()
    segmentKeys.forEach(k => {
      const total = processedData.reduce((sum, d) => sum + (d.revenueSegments?.[k] ?? 0), 0)
      totals.set(k, total)
    })
    const bySize = [...segmentKeys].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
    const kept = bySize.slice(0, MAX_SEGMENT_SERIES - 1)
    foldedSegmentKeys = new Set(bySize.slice(MAX_SEGMENT_SERIES - 1))
    segmentKeys = [...kept, 'Other']
  }

  // Flatten segments into main object for Recharts
  const chartData = processedData.map(d => {
    let segs = d.revenueSegments
    if (foldedSegmentKeys && segs) {
      const merged: Record<string, number> = {}
      let otherSum = 0
      Object.entries(segs).forEach(([k, v]) => {
        if (foldedSegmentKeys!.has(k) || k === 'Other') {
          otherSum += v
        } else {
          merged[k] = v
        }
      })
      merged['Other'] = otherSum
      segs = merged
    }
    return {
      ...d,
      profitMargin: d.profitMargin !== undefined ? d.profitMargin : d.netMargin,
      operatingExpenses: (d.operatingExpenses !== null && d.operatingExpenses !== undefined) ? d.operatingExpenses : (d.sellingGeneralAndAdmin !== null && d.sellingGeneralAndAdmin !== undefined ? d.sellingGeneralAndAdmin : null),
      ...segs,
      // null fica null (gap no gráfico) — 0 fabricado era indistinguível de capex zero real
      capexInv: d.capex != null ? -d.capex : null // Negative capex for composed chart
    }
  })

  // Barra preliminar: revenue/EPS já reportados (earnings) mas ainda sem 10-Q.
  // Só no modo trimestral e só se o trimestre ainda não existir nos oficiais.
  const showPreliminary = useMemo(() => {
    if (!preliminary || period !== "QUARTERLY" || chartData.length === 0) return null
    const last = chartData[chartData.length - 1]
    const isNewer =
      preliminary.fiscalYear > (last.fiscalYear ?? 0) ||
      (preliminary.fiscalYear === (last.fiscalYear ?? 0) &&
        preliminary.fiscalQuarter > (last.fiscalQuarter ?? 0))
    if (!isNewer) return null
    return {
      label: `Q${preliminary.fiscalQuarter}'${String(preliminary.fiscalYear).slice(2)}`,
      fiscalYear: preliminary.fiscalYear,
      fiscalQuarter: preliminary.fiscalQuarter,
      revenue: preliminary.revenue,
      epsDiluted: preliminary.epsDiluted,
      isPreliminary: true,
    }
  }, [preliminary, period, chartData])

  const revenueChartData = showPreliminary
    ? [...chartData, { ...showPreliminary, revenue: showPreliminary.revenue }]
    : chartData

  const epsChartData = showPreliminary
    ? [...chartData, { ...showPreliminary, epsDiluted: showPreliminary.epsDiluted }]
    : chartData

  // Aviso guiado pelos DADOS reais: se o histórico trimestral for escasso (típico
  // das europeias, que reportam semestral/anual), avisar em vez de mostrar um
  // gráfico trimestral enganosamente curto. Um reporter trimestral completo tem
  // ~4 Q por ano; abaixo de 3× o nº de anuais = claramente incompleto. Assim a
  // ASML (poucos Q) mostra o aviso, mas a AAPL (histórico completo) não.
  const quarterlyCount = data.filter(d => d.periodType === "QUARTERLY").length
  const annualCount = data.filter(d => d.periodType === "ANNUAL").length
  const sparseQuarterly = annualCount > 0 && quarterlyCount < annualCount * 3

  if (isLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center animate-pulse bg-card rounded-xl border border-border/40 mt-8">
        <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="mt-12 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-2xl font-bold tracking-tight">{t('engineTitle')}</h2>
          <div className="flex bg-muted/40 p-1 rounded-xl border border-border/50 shadow-inner">
            <button
              onClick={() => setMainView("charts")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mainView === "charts"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              {tFs("viewModes.charts")}
            </button>
            <button
              onClick={() => setMainView("statements")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mainView === "statements"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {tFs("viewModes.statements")}
            </button>
          </div>
        </div>

        {mainView === "charts" && (
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
        )}
      </div>

      {mainView === "statements" ? (
        <FinancialStatements
          ticker={ticker}
          data={data}
          currencySymbol={currencySymbol}
          defaultPeriod={period}
        />
      ) : (
        <>
          {sparseQuarterly && (period === "QUARTERLY" || period === "TTM") && (
            <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{t('sparseQuarterlyNote')}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <DecisionChart currencySymbol={currencySymbol}
              title={t('charts.revenue')}
              data={revenueChartData}
              type="BAR"
              config={{ isCurrency: true, dataKeys: [{ key: 'revenue', color: 'var(--chart-1)', type: 'bar' }] }}
              cagr={calcCAGR('revenue')}
              infoTooltip={showPreliminary ? t('preliminaryInfo') : undefined}
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
              data={epsChartData}
              type="BAR"
              config={{ dataKeys: [{ key: 'epsDiluted', color: 'var(--chart-1)', type: 'bar' }] }}
              cagr={calcCAGR('epsDiluted')}
              infoTooltip={showPreliminary ? t('preliminaryInfo') : undefined}
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
                infoTooltip={isReit ? t('reitFcfTooltip') : undefined}
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
              emptyMessage={t('charts.noDividends')}
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

                const ratioConfigs = {
                  ROIC: {
                    title: t('charts.roic'),
                    type: "COMPOSED" as const,
                    config: { isPercentage: true, dataKeys: [{ key: 'roic', color: 'var(--chart-1)', type: 'bar' as const }], referenceLine: { y: 0.15, color: 'var(--bull)', label: '15%' } }
                  },
                  ROE: {
                    title: t('charts.returnOnEquity'),
                    type: "BAR" as const,
                    config: { isPercentage: true, dataKeys: [{ key: 'returnOnEquity', color: 'var(--chart-1)', type: 'bar' as const }] }
                  },
                  GROSS: {
                    title: t('charts.grossMargin'),
                    type: "LINE" as const,
                    config: { isPercentage: true, dataKeys: [{ key: 'grossMargin', color: 'var(--chart-1)', type: 'line' as const }] }
                  },
                  OPERATING: {
                    title: t('charts.operatingMargin'),
                    type: "LINE" as const,
                    config: { isPercentage: true, dataKeys: [{ key: 'operatingMargin', color: 'var(--chart-1)', type: 'line' as const }] }
                  },
                  PROFIT: {
                    title: t('charts.profitMargin'),
                    type: "LINE" as const,
                    config: { isPercentage: true, dataKeys: [{ key: 'profitMargin', color: 'var(--chart-1)', type: 'line' as const }] }
                  }
                };
                
                const activeConfig = ratioConfigs[ratioTab];

                return (
                  <DecisionChart 
                    key="ratios-multi-card"
                    currencySymbol={currencySymbol} 
                    title={activeConfig.title} 
                    data={chartData} 
                    type={activeConfig.type} 
                    headerExtra={tabs} 
                    config={activeConfig.config} 
                  />
                );
              })()}

          </div>
        </>
      )}
    </div>
  )
}
