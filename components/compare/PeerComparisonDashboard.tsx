"use client"

import { useState, useMemo, useEffect } from 'react'
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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

export function PeerComparisonDashboard({ baseCompany, baseFundamentals, availablePeers }: PeerComparisonDashboardProps) {
  const [open, setOpen] = useState(false)
  const [selectedPeers, setSelectedPeers] = useState<Company[]>([])
  const [peerFundamentals, setPeerFundamentals] = useState<Record<string, SerializedFundamental[]>>({})
  const [valuationHistory, setValuationHistory] = useState<Record<string, any[]>>({})
  const [loadingPeers, setLoadingPeers] = useState<Record<string, boolean>>({})
  const [isIndexed, setIsIndexed] = useState(false)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [valuationMetric, setValuationMetric] = useState<"pe" | "ps">("pe")

  const fetchPriceForTicker = async (t: string) => {
    try {
      const res = await fetch(`/api/price/${t}`)
      if (res.ok) {
        const data = await res.json()
        setPrices(prev => ({ ...prev, [t]: data.currentPrice }))
      }
    } catch (e) {
      console.error("Failed to fetch price for", t)
    }
  }

  const fetchValuationHistory = async (t: string) => {
    try {
      const res = await fetch(`/api/valuation/${t}`)
      if (res.ok) {
        const data = await res.json()
        setValuationHistory(prev => ({ ...prev, [t]: data }))
      }
    } catch (e) {
      console.error("Failed to fetch valuation history for", t)
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
      const cash = Number(latest.cash) || Number(latest.cashAndEquivalents) || 0
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

  // Custom tooltips to prevent recreating components on each render
  const renderCurrencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-md shadow-md text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {isIndexed ? `${Number(entry.value).toFixed(1)}%` : formatCurrencyAxis(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const renderPercentTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-md shadow-md text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {formatPercentAxis(entry.value)}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  const renderMultipleTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-3 rounded-md shadow-md text-sm">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">
                {entry.value ? `${entry.value.toFixed(1)}x` : 'N/A'}
              </span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-8">
      {/* Selector Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
            <div className="space-y-2 flex-1">
              <Label>Selecionar Pares (Max {maxPeers})</Label>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="default" className="text-sm py-1 px-3">
                  {baseCompany.ticker} (Base)
                </Badge>
                
                {selectedPeers.map(peer => (
                  <Badge key={peer.ticker} variant="secondary" className="text-sm py-1 px-3 flex items-center gap-1">
                    {peer.ticker}
                    <X 
                      className="w-3 h-3 cursor-pointer hover:text-destructive transition-colors" 
                      onClick={() => removePeer(peer.ticker)}
                    />
                  </Badge>
                ))}

                {selectedPeers.length < maxPeers && (
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger className="inline-flex items-center justify-between whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 py-2 w-auto">
                      Adicionar Par
                      <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Procurar concorrente..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
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
                                  <span className="font-semibold w-14">{peer.ticker}</span>
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
            </div>

            <div className="flex items-center space-x-2 bg-muted/50 p-3 rounded-lg border border-border/50">
              <Switch id="indexed-mode" checked={isIndexed} onCheckedChange={setIsIndexed} />
              <div className="space-y-0.5">
                <Label htmlFor="indexed-mode" className="font-medium">Modo de Crescimento (Base 100)</Label>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  Alinha todas as empresas ao ano inicial para comparar as percentagens de crescimento real.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Charts Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Análise Histórica</CardTitle>
          <CardDescription>Evolução financeira ao longo dos anos entre os concorrentes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="growth" className="w-full">
            <TabsList className="mb-4 flex-wrap">
              <TabsTrigger value="growth">Receitas & Lucros</TabsTrigger>
              <TabsTrigger value="fcf">Geração de Caixa (FCF)</TabsTrigger>
              <TabsTrigger value="margins">Poder de Fixação (Margens)</TabsTrigger>
              <TabsTrigger value="valuation" className="bg-primary/10 text-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Múltiplos (Histórico)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="growth" className="space-y-4">
              <div className="h-[400px] w-full mt-4 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
                <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="year" className="text-xs" tick={{ fill: 'currentColor', opacity: 0.5 }} />
                    <YAxis 
                      tickFormatter={formatCurrencyAxis} 
                      className="text-xs" 
                      tick={{ fill: 'currentColor', opacity: 0.5 }}
                      domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                    />
                    <RechartsTooltip content={renderCurrencyTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    
                    {[baseCompany, ...selectedPeers].map((company, idx) => (
                      <Line 
                        key={`${company.ticker}_rev`}
                        type="linear" 
                        dataKey={`${company.ticker}_revenue`} 
                        name={`${company.ticker} Receita`}
                        stroke={COLORS[idx]} 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="fcf" className="space-y-4">
              <div className="h-[400px] w-full mt-4 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
                <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="year" className="text-xs" tick={{ fill: 'currentColor', opacity: 0.5 }} />
                    <YAxis 
                      tickFormatter={formatCurrencyAxis} 
                      className="text-xs" 
                      tick={{ fill: 'currentColor', opacity: 0.5 }}
                      domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                    />
                    <RechartsTooltip content={renderCurrencyTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    
                    {[baseCompany, ...selectedPeers].map((company, idx) => (
                      <Line 
                        key={`${company.ticker}_fcf`}
                        type="linear" 
                        dataKey={`${company.ticker}_fcf`} 
                        name={`${company.ticker} FCF`}
                        stroke={COLORS[idx]} 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="margins" className="space-y-4">
              <div className="h-[400px] w-full mt-4 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
                <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis dataKey="year" className="text-xs" tick={{ fill: 'currentColor', opacity: 0.5 }} />
                    <YAxis 
                      tickFormatter={formatPercentAxis} 
                      className="text-xs" 
                      tick={{ fill: 'currentColor', opacity: 0.5 }}
                      domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                    />
                    <RechartsTooltip content={renderPercentTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    
                    {[baseCompany, ...selectedPeers].map((company, idx) => (
                      <Line 
                        key={`${company.ticker}_grossMargin`}
                        type="linear" 
                        dataKey={`${company.ticker}_grossMargin`} 
                        name={`${company.ticker} Margem Bruta`}
                        stroke={COLORS[idx]} 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 4 }}
                      />
                    ))}
                    {[baseCompany, ...selectedPeers].map((company, idx) => (
                      <Line 
                        key={`${company.ticker}_netMargin`}
                        type="linear" 
                        dataKey={`${company.ticker}_netMargin`} 
                        name={`${company.ticker} Margem Líquida`}
                        stroke={COLORS[idx]} 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="valuation" className="space-y-4">
              <div className="flex items-center justify-between mt-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Métrica a Analisar</Label>
                  <p className="text-xs text-muted-foreground">Analise as disparidades históricas entre os pares.</p>
                </div>
                <Select value={valuationMetric} onValueChange={(v: any) => v && setValuationMetric(v as "pe" | "ps")}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Métrica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pe">P/E Ratio (Lucro)</SelectItem>
                    <SelectItem value="ps">P/Sales (Receitas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="h-[350px] w-full mt-4 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
                <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
                  <LineChart data={valuationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs" 
                      tick={{ fill: 'currentColor', opacity: 0.5 }} 
                      tickFormatter={(val) => {
                        const d = new Date(val)
                        return `${d.getMonth()+1}/${d.getFullYear().toString().slice(2)}`
                      }} 
                    />
                    <YAxis 
                      tickFormatter={formatMultipleAxis} 
                      className="text-xs" 
                      tick={{ fill: 'currentColor', opacity: 0.5 }}
                      domain={[0, 'auto']}
                    />
                    <RechartsTooltip content={renderMultipleTooltip} />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    
                    {[baseCompany, ...selectedPeers].map((company, idx) => (
                      <Line 
                        key={`${company.ticker}_val`}
                        type="linear" 
                        dataKey={`${company.ticker}_${valuationMetric}`} 
                        name={`${company.ticker} ${valuationMetric === 'pe' ? 'P/E' : 'P/Sales'}`}
                        stroke={COLORS[idx]} 
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Current Valuation Multiples Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Múltiplos de Avaliação Atuais</CardTitle>
          <CardDescription>Comparação direta do preço que o mercado está a pagar hoje (P/E, P/Sales, EV/EBITDA).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full mt-4 [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
            <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
              <BarChart data={valuationData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="ticker" className="text-xs font-semibold" tick={{ fill: 'currentColor' }} />
                <YAxis className="text-xs" tick={{ fill: 'currentColor', opacity: 0.5 }} tickFormatter={(val) => `${val}x`} />
                <RechartsTooltip content={renderMultipleTooltip} cursor={{ fill: 'var(--muted)', opacity: 0.2 }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="pe" name="P/E Ratio" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                <Bar dataKey="ps" name="Price / Sales" fill="var(--chart-5)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                <Bar dataKey="pfcf" name="Price / FCF" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={60} />
                <Bar dataKey="evEbitda" name="EV / EBITDA" fill="var(--bear)" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Expanded Health & Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Saúde Financeira e Retornos</CardTitle>
          <CardDescription>Uma visão tabular para comparações exatas de balanço e rentabilidade.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-semibold">Empresa</th>
                  <th className="px-6 py-4 font-semibold text-right">P/E Atual</th>
                  <th className="px-6 py-4 font-semibold text-right">P/Sales Atual</th>
                  <th className="px-6 py-4 font-semibold text-right">EV / EBITDA</th>
                  <th className="px-6 py-4 font-semibold text-right">Dívida / Caixa</th>
                  <th className="px-6 py-4 font-semibold text-right">ROIC</th>
                  <th className="px-6 py-4 font-semibold text-right">ROE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {valuationData.map((data) => (
                  <tr key={data.ticker} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground">{data.ticker}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[150px]">{data.name}</div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.pe ? `${data.pe.toFixed(1)}x` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.ps ? `${data.ps.toFixed(1)}x` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.evEbitda ? `${data.evEbitda.toFixed(1)}x` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.debtToCash}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.roic}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      {data.roe}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
