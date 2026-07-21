"use client"

import { useState, useMemo, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts'
import { Company } from '@prisma/client'

type SerializedFundamental = any

interface PeerComparisonDashboardProps {
  baseCompany: Company
  baseFundamentals: SerializedFundamental[]
  availablePeers: Company[]
}

// categorical, ordem fixa (dourado primeiro = a empresa-base) — mapeado aos tokens de marca
const COLORS = ['var(--chart-1)', 'var(--chart-5)', 'var(--bull)', 'var(--bear)', 'var(--chart-4)']

// ── Painel de vidro (mesma linguagem do StockAnalyst) ────────────────
function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="glass rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

// ── Tooltip de gráfico unificado (mesmas convenções do DecisionChart) ─
function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: readonly any[]
  label?: string
  format: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="z-50 min-w-[150px] rounded-xl border border-border bg-popover/95 p-3 text-popover-foreground shadow-xl supports-[backdrop-filter]:backdrop-blur">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1.5">
        {payload.map((entry, index: number) => (
          <div key={index} className="flex items-center gap-2 text-[13px]">
            {/* chave de série: traço fino (não caixa) — regra dataviz */}
            <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="nums ml-auto pl-4 font-semibold">
              {entry.value == null ? 'N/A' : format(Number(entry.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PeerComparisonDashboard({ baseCompany, baseFundamentals, availablePeers }: PeerComparisonDashboardProps) {
  const t = useTranslations('compare')
  const [open, setOpen] = useState(false)
  const [selectedPeers, setSelectedPeers] = useState<Company[]>([])
  const [peerFundamentals, setPeerFundamentals] = useState<Record<string, SerializedFundamental[]>>({})
  const [valuationHistory, setValuationHistory] = useState<Record<string, any[]>>({})
  const [loadingPeers, setLoadingPeers] = useState<Record<string, boolean>>({})
  const [isIndexed, setIsIndexed] = useState(false)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [valuationMetric, setValuationMetric] = useState<"pe" | "ps">("pe")

  const fetchPriceForTicker = async (tk: string) => {
    try {
      const res = await fetch(`/api/price/${tk}`)
      if (res.ok) {
        const data = await res.json()
        setPrices(prev => ({ ...prev, [tk]: data.currentPrice }))
      }
    } catch {
      console.error("Failed to fetch price for", tk)
    }
  }

  const fetchValuationHistory = async (tk: string) => {
    try {
      const res = await fetch(`/api/valuation/${tk}`)
      if (res.ok) {
        const data = await res.json()
        setValuationHistory(prev => ({ ...prev, [tk]: data }))
      }
    } catch {
      console.error("Failed to fetch valuation history for", tk)
    }
  }

  useEffect(() => {
    fetchPriceForTicker(baseCompany.ticker)
    fetchValuationHistory(baseCompany.ticker)
  }, [baseCompany.ticker])

  const maxPeers = 3

  const addPeer = async (peer: Company) => {
    if (selectedPeers.length >= maxPeers) return
    if (selectedPeers.find(p => p.ticker === peer.ticker)) return

    setSelectedPeers([...selectedPeers, peer])

    if (!peerFundamentals[peer.ticker]) {
      setLoadingPeers(prev => ({ ...prev, [peer.ticker]: true }))
      try {
        const res = await fetch(`/api/fundamentals/${peer.ticker}`)
        if (res.ok) {
          const data = await res.json()
          setPeerFundamentals(prev => ({ ...prev, [peer.ticker]: data.filter((f: any) => f.periodType === 'ANNUAL') }))
        }
        await fetchPriceForTicker(peer.ticker)
        await fetchValuationHistory(peer.ticker)
      } catch (e) {
        console.error("Failed to load peer fundamentals", e)
      } finally {
        setLoadingPeers(prev => ({ ...prev, [peer.ticker]: false }))
      }
    }
  }

  const removePeer = (ticker: string) => {
    setSelectedPeers(selectedPeers.filter(p => p.ticker !== ticker))
  }

  // Combined Line Chart Data (Historical)
  const chartData = useMemo(() => {
    const allCompanies = [baseCompany, ...selectedPeers]
    const fundamentalsMap: Record<string, SerializedFundamental[]> = {
      [baseCompany.ticker]: baseFundamentals,
      ...peerFundamentals
    }

    const yearsSet = new Set<number>()
    allCompanies.forEach(company => {
      const funds = fundamentalsMap[company.ticker] || []
      funds.forEach(f => yearsSet.add(f.fiscalYear))
    })

    const sortedYears = Array.from(yearsSet).sort((a, b) => a - b)

    return sortedYears.map(year => {
      const dataPoint: any = { year: year.toString() }

      allCompanies.forEach(company => {
        const funds = fundamentalsMap[company.ticker] || []
        const fundForYear = funds.find(f => f.fiscalYear === year)

        if (fundForYear) {
          let rev = Number(fundForYear.revenue) || 0
          let ni = Number(fundForYear.netIncome) || 0
          let fcf = Number(fundForYear.freeCashFlow) || 0
          let grossM = Number(fundForYear.grossMargin) || 0
          let netM = Number(fundForYear.netMargin) || 0

          if (isIndexed) {
            const earliestFund = funds[0]
            if (earliestFund) {
              const baseRev = Number(earliestFund.revenue) || 1
              const baseNi = Number(earliestFund.netIncome) || 1
              const baseFcf = Number(earliestFund.freeCashFlow) || 1
              if (baseRev !== 0) rev = (rev / baseRev) * 100
              if (baseNi !== 0) ni = (ni / Math.abs(baseNi)) * 100
              if (baseFcf !== 0) fcf = (fcf / Math.abs(baseFcf)) * 100
            }
          } else {
            grossM = grossM * 100
            netM = netM * 100
          }

          dataPoint[`${company.ticker}_revenue`] = rev
          dataPoint[`${company.ticker}_netIncome`] = ni
          dataPoint[`${company.ticker}_fcf`] = fcf
          dataPoint[`${company.ticker}_grossMargin`] = grossM
          dataPoint[`${company.ticker}_netMargin`] = netM
        }
      })

      return dataPoint
    })
  }, [baseCompany, baseFundamentals, selectedPeers, peerFundamentals, isIndexed])

  // Historical Valuation Chart Data
  const valuationChartData = useMemo(() => {
    const allCompanies = [baseCompany, ...selectedPeers]
    const map = new Map<string, any>()

    allCompanies.forEach(company => {
      const history = valuationHistory[company.ticker] || []
      history.forEach(d => {
        if (!map.has(d.date)) map.set(d.date, { date: d.date })
        const entry = map.get(d.date)
        entry[`${company.ticker}_pe`] = d.pe
        entry[`${company.ticker}_ps`] = d.ps
      })
    })

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [baseCompany, selectedPeers, valuationHistory])

  const formatCurrencyAxis = (tick: number) => {
    if (isIndexed) return `${tick.toFixed(0)}%`
    if (Math.abs(tick) >= 1e9) return `$${(tick / 1e9).toFixed(1)}B`
    if (Math.abs(tick) >= 1e6) return `$${(tick / 1e6).toFixed(1)}M`
    return `$${tick}`
  }

  const formatPercentAxis = (tick: number) => {
    return `${tick.toFixed(0)}%`
  }

  const formatMultipleAxis = (tick: number) => {
    return `${tick.toFixed(1)}x`
  }

  // Expanded Valuation Data (Current Multiples & Health)
  const valuationData = useMemo(() => {
    const allCompanies = [baseCompany, ...selectedPeers]
    return allCompanies.map(company => {
      const funds = company.ticker === baseCompany.ticker ? baseFundamentals : peerFundamentals[company.ticker] || []
      const latest = funds[funds.length - 1]

      if (!latest) return {
        ticker: company.ticker, name: company.name, pe: null, ps: null, evEbitda: null, pfcf: null,
        debtToCash: 'N/A', roic: 'N/A', roe: 'N/A'
      }

      const netIncome = Number(latest.netIncome) || 0
      const revenue = Number(latest.revenue) || 0
      const freeCashFlow = Number(latest.freeCashFlow) || 0
      const sharesOut = Number(latest.sharesOutstanding) || 0
      const totalDebt = Number(latest.totalDebt) || 0
      const cash = Number(latest.cash) || 0
      const ebitda = Number(latest.ebitda) || 0
      const roic = Number(latest.roic) || 0
      const roe = Number(latest.returnOnEquity) || 0

      const currentPrice = prices[company.ticker]
      let pe = null
      let ps = null
      let pfcf = null
      let evEbitda = null

      if (currentPrice && sharesOut > 0) {
        const marketCap = currentPrice * sharesOut
        if (netIncome > 0) pe = marketCap / netIncome
        if (revenue > 0) ps = marketCap / revenue
        if (freeCashFlow > 0) pfcf = marketCap / freeCashFlow
        if (ebitda > 0) {
          const ev = marketCap + totalDebt - cash
          evEbitda = ev / ebitda
        }
      }

      const debtToCash = cash > 0 ? (totalDebt / cash).toFixed(2) + 'x' : 'N/A'
      const roicDisplay = roic ? (roic * 100).toFixed(1) + '%' : 'N/A'
      const roeDisplay = roe ? (roe * 100).toFixed(1) + '%' : 'N/A'

      return {
        ticker: company.ticker,
        name: company.name,
        pe,
        ps,
        pfcf,
        evEbitda,
        debtToCash,
        roic: roicDisplay,
        roe: roeDisplay
      }
    })
  }, [baseCompany, baseFundamentals, selectedPeers, peerFundamentals, prices])

  const allCompanies = [baseCompany, ...selectedPeers]

  return (
    <div className="space-y-8">
      {/* Seletor de pares */}
      <Panel
        title={t('selectorLabel', { max: maxPeers })}
        action={
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 p-3">
            <Switch id="indexed-mode" checked={isIndexed} onCheckedChange={setIsIndexed} />
            <div className="space-y-0.5">
              <Label htmlFor="indexed-mode" className="font-medium">{t('indexedLabel')}</Label>
              <p className="max-w-[240px] text-[10px] leading-tight text-muted-foreground">
                {t('indexedDesc')}
              </p>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default" className="px-3 py-1 text-sm">
            {baseCompany.ticker} · {t('base')}
          </Badge>

          {selectedPeers.map((peer, idx) => (
            <Badge
              key={peer.ticker}
              variant="secondary"
              className="flex items-center gap-1 px-3 py-1 text-sm"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: COLORS[(idx + 1) % COLORS.length] }}
              />
              {peer.ticker}
              {loadingPeers[peer.ticker] && (
                <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              )}
              {/* O X precisa de ser um <button> próprio, não o <svg> direto do Badge —
                  o Badge aplica [&>svg]:pointer-events-none aos filhos, o que anulava o onClick. */}
              <button
                type="button"
                onClick={() => removePeer(peer.ticker)}
                aria-label={`Remover ${peer.ticker}`}
                className="cursor-pointer transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {selectedPeers.length < maxPeers && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger className="inline-flex h-8 w-auto items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-xs font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                {t('addPeer')}
                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t('searchPlaceholder')} />
                  <CommandList>
                    <CommandEmpty>{t('noResults')}</CommandEmpty>
                    <CommandGroup>
                      {availablePeers.map((peer) => {
                        const isSelected = selectedPeers.some(p => p.ticker === peer.ticker)
                        return (
                          <CommandItem
                            key={peer.ticker}
                            value={`${peer.ticker} ${peer.name}`}
                            onSelect={() => {
                              addPeer(peer)
                              setOpen(false)
                            }}
                            disabled={isSelected}
                            className={isSelected ? "opacity-50" : ""}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="w-14 font-semibold">{peer.ticker}</span>
                            <span className="truncate text-muted-foreground">{peer.name}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </Panel>

      {/* Análise histórica */}
      <Panel title={t('historicalTitle')} description={t('historicalDesc')}>
        <Tabs defaultValue="growth" className="w-full">
          <TabsList className="mb-4 flex-wrap">
            <TabsTrigger value="growth">{t('tabGrowth')}</TabsTrigger>
            <TabsTrigger value="fcf">{t('tabFcf')}</TabsTrigger>
            <TabsTrigger value="margins">{t('tabMargins')}</TabsTrigger>
            <TabsTrigger value="valuation" className="bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{t('tabValuation')}</TabsTrigger>
          </TabsList>

          <TabsContent value="growth" className="space-y-4">
            <div className="mt-4 h-[400px] w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatCurrencyAxis}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                  />
                  <RechartsTooltip content={(p) => <ChartTooltip {...p} label={p.label != null ? String(p.label) : undefined} format={(v) => isIndexed ? `${v.toFixed(1)}%` : formatCurrencyAxis(v)} />} cursor={{ stroke: 'var(--muted)', opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  {allCompanies.map((company, idx) => (
                    <Line
                      key={`${company.ticker}_rev`}
                      type="linear"
                      dataKey={`${company.ticker}_revenue`}
                      name={`${company.ticker} ${t('seriesRevenue')}`}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="fcf" className="space-y-4">
            <div className="mt-4 h-[400px] w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatCurrencyAxis}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                  />
                  <RechartsTooltip content={(p) => <ChartTooltip {...p} label={p.label != null ? String(p.label) : undefined} format={(v) => isIndexed ? `${v.toFixed(1)}%` : formatCurrencyAxis(v)} />} cursor={{ stroke: 'var(--muted)', opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  {allCompanies.map((company, idx) => (
                    <Line
                      key={`${company.ticker}_fcf`}
                      type="linear"
                      dataKey={`${company.ticker}_fcf`}
                      name={`${company.ticker} ${t('seriesFcf')}`}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="margins" className="space-y-4">
            <div className="mt-4 h-[400px] w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatPercentAxis}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                  />
                  <RechartsTooltip content={(p) => <ChartTooltip {...p} label={p.label != null ? String(p.label) : undefined} format={(v) => formatPercentAxis(v)} />} cursor={{ stroke: 'var(--muted)', opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  {allCompanies.map((company, idx) => (
                    <Line
                      key={`${company.ticker}_grossMargin`}
                      type="linear"
                      dataKey={`${company.ticker}_grossMargin`}
                      name={`${company.ticker} ${t('seriesGrossMargin')}`}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 3 }}
                    />
                  ))}
                  {allCompanies.map((company, idx) => (
                    <Line
                      key={`${company.ticker}_netMargin`}
                      type="linear"
                      dataKey={`${company.ticker}_netMargin`}
                      name={`${company.ticker} ${t('seriesNetMargin')}`}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="valuation" className="space-y-4">
            <div className="mt-4 flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">{t('metricLabel')}</Label>
                <p className="text-xs text-muted-foreground">{t('metricDesc')}</p>
              </div>
              <Select value={valuationMetric} onValueChange={(v: any) => v && setValuationMetric(v as "pe" | "ps")}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder={t('metricPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pe">{t('metricPe')}</SelectItem>
                  <SelectItem value="ps">{t('metricPs')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 h-[350px] w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
              <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                <LineChart data={valuationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    tickFormatter={(val) => {
                      const d = new Date(val)
                      return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`
                    }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={formatMultipleAxis}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    domain={[0, 'auto']}
                  />
                  <RechartsTooltip content={(p) => <ChartTooltip {...p} label={p.label != null ? String(p.label) : undefined} format={(v) => `${v.toFixed(1)}x`} />} cursor={{ stroke: 'var(--muted)', opacity: 0.4 }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />

                  {allCompanies.map((company, idx) => (
                    <Line
                      key={`${company.ticker}_val`}
                      type="linear"
                      dataKey={`${company.ticker}_${valuationMetric}`}
                      name={`${company.ticker} ${valuationMetric === 'pe' ? t('barPe') : t('barPs')}`}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </Panel>

      {/* Múltiplos atuais */}
      <Panel title={t('currentTitle')} description={t('currentDesc')}>
        <div className="mt-2 h-[350px] w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
          <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
            <BarChart data={valuationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.6} vertical={false} />
              <XAxis dataKey="ticker" axisLine={false} tickLine={false} tick={{ fill: 'var(--foreground)', fontSize: 12, fontWeight: 600 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} tickFormatter={(val) => `${val}x`} />
              <RechartsTooltip content={(p) => <ChartTooltip {...p} label={p.label != null ? String(p.label) : undefined} format={(v) => `${v.toFixed(1)}x`} />} cursor={{ fill: 'var(--muted)', opacity: 0.2 }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="pe" name={t('barPe')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar dataKey="ps" name={t('barPs')} fill="var(--chart-5)" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar dataKey="pfcf" name={t('barPfcf')} fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar dataKey="evEbitda" name={t('barEvEbitda')} fill="var(--bear)" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Saúde financeira (tabela) */}
      <Panel title={t('healthTitle')} description={t('healthDesc')}>
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold">{t('thCompany')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thPe')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thPs')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thEvEbitda')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thDebtCash')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thRoic')}</th>
                <th className="px-6 py-4 text-right font-semibold">{t('thRoe')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {valuationData.map((data) => (
                <tr key={data.ticker} className="transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-foreground">{data.ticker}</div>
                    <div className="max-w-[150px] truncate text-xs text-muted-foreground">{data.name}</div>
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.pe ? `${data.pe.toFixed(1)}x` : 'N/A'}
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.ps ? `${data.ps.toFixed(1)}x` : 'N/A'}
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.evEbitda ? `${data.evEbitda.toFixed(1)}x` : 'N/A'}
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.debtToCash}
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.roic}
                  </td>
                  <td className="nums px-6 py-4 text-right font-medium">
                    {data.roe}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
