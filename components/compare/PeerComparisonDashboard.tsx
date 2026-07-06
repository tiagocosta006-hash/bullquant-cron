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
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts'
import { Company, Fundamental } from '@prisma/client'

type SerializedFundamental = any // In real life, cast decimal to number

interface PeerComparisonDashboardProps {
  baseCompany: Company
  baseFundamentals: SerializedFundamental[]
  availablePeers: Company[]
}

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#ca8a04', '#9333ea']

export function PeerComparisonDashboard({ baseCompany, baseFundamentals, availablePeers }: PeerComparisonDashboardProps) {
  const [open, setOpen] = useState(false)
  const [selectedPeers, setSelectedPeers] = useState<Company[]>([])
  const [peerFundamentals, setPeerFundamentals] = useState<Record<string, SerializedFundamental[]>>({})
  const [loadingPeers, setLoadingPeers] = useState<Record<string, boolean>>({})
  const [isIndexed, setIsIndexed] = useState(false)
  const [prices, setPrices] = useState<Record<string, number>>({})

  // Fetch price helper
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

  // Fetch base company price on mount
  useEffect(() => {
    fetchPriceForTicker(baseCompany.ticker)
  }, [baseCompany.ticker])

  // Max 3 peers (+1 base) = 4 companies max
  const maxPeers = 3

  const addPeer = async (peer: Company) => {
    if (selectedPeers.length >= maxPeers) return
    if (selectedPeers.find(p => p.ticker === peer.ticker)) return

    setSelectedPeers([...selectedPeers, peer])
    
    // Fetch fundamentals if not loaded
    if (!peerFundamentals[peer.ticker]) {
      setLoadingPeers(prev => ({ ...prev, [peer.ticker]: true }))
      try {
        const res = await fetch(`/api/fundamentals/${peer.ticker}`)
        if (res.ok) {
          const data = await res.json()
          setPeerFundamentals(prev => ({ ...prev, [peer.ticker]: data.filter((f: any) => f.periodType === 'ANNUAL') }))
        }
        await fetchPriceForTicker(peer.ticker)
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

  // Combine data for charts
  const chartData = useMemo(() => {
    const allCompanies = [baseCompany, ...selectedPeers]
    const fundamentalsMap: Record<string, SerializedFundamental[]> = {
      [baseCompany.ticker]: baseFundamentals,
      ...peerFundamentals
    }

    // Find all unique years across selected companies
    const yearsSet = new Set<number>()
    allCompanies.forEach(company => {
      const funds = fundamentalsMap[company.ticker] || []
      funds.forEach(f => yearsSet.add(f.fiscalYear))
    })

    const sortedYears = Array.from(yearsSet).sort((a, b) => a - b)

    // Build data array
    return sortedYears.map(year => {
      const dataPoint: any = { year: year.toString() }
      
      allCompanies.forEach(company => {
        const funds = fundamentalsMap[company.ticker] || []
        const fundForYear = funds.find(f => f.fiscalYear === year)
        
        if (fundForYear) {
          let rev = Number(fundForYear.revenue)
          let ni = Number(fundForYear.netIncome)
          
          if (isIndexed) {
            // Find base year value
            const earliestFund = funds[0]
            if (earliestFund) {
              const baseRev = Number(earliestFund.revenue)
              const baseNi = Number(earliestFund.netIncome)
              if (baseRev !== 0) rev = (rev / baseRev) * 100
              if (baseNi !== 0) ni = (ni / Math.abs(baseNi)) * 100
            }
          }
          
          dataPoint[`${company.ticker}_revenue`] = rev
          dataPoint[`${company.ticker}_netIncome`] = ni
        }
      })
      
      return dataPoint
    })
  }, [baseCompany, baseFundamentals, selectedPeers, peerFundamentals, isIndexed])

  const formatYAxis = (tick: number) => {
    if (isIndexed) return `${tick.toFixed(0)}%`
    if (Math.abs(tick) >= 1e9) return `$${(tick / 1e9).toFixed(1)}B`
    if (Math.abs(tick) >= 1e6) return `$${(tick / 1e6).toFixed(1)}M`
    return `$${tick}`
  }

  // Valuation Multiples Table Data
  const valuationData = useMemo(() => {
    const allCompanies = [baseCompany, ...selectedPeers]
    return allCompanies.map(company => {
      const funds = company.ticker === baseCompany.ticker ? baseFundamentals : peerFundamentals[company.ticker] || []
      const latest = funds[funds.length - 1]
      
      if (!latest) return { ticker: company.ticker, name: company.name, pe: 'N/A', evEbitda: 'N/A', roic: 'N/A', margin: 'N/A' }

      // Dummy calculations for demonstration. 
      // In a real app, price should be fetched live and PE calculated as (Market Cap / Net Income)
      // EV = Market Cap + Total Debt - Cash
      // ROIC = NOPAT / Invested Capital
      
      const netIncome = Number(latest.netIncome)
      const revenue = Number(latest.revenue)
      const grossProfit = Number(latest.grossProfit) || 0
      const sharesOut = Number(latest.sharesOutstanding) || 0
      const totalDebt = Number(latest.totalDebt) || 0
      const cash = Number(latest.cashAndEquivalents) || 0
      const ebitda = Number(latest.ebitda) || 0
      
      const netMargin = revenue ? ((netIncome / revenue) * 100).toFixed(1) + '%' : 'N/A'
      const displayGross = revenue && grossProfit ? ((grossProfit / revenue) * 100).toFixed(1) + '%' : 'N/A'

      const currentPrice = prices[company.ticker]
      let pe = 'N/A'
      let evEbitda = 'N/A'

      if (currentPrice && sharesOut > 0) {
        const marketCap = currentPrice * sharesOut
        if (netIncome > 0) {
          pe = (marketCap / netIncome).toFixed(1) + 'x'
        }
        if (ebitda > 0) {
          const ev = marketCap + totalDebt - cash
          evEbitda = (ev / ebitda).toFixed(1) + 'x'
        }
      } else if (!currentPrice) {
        pe = 'A carregar...'
        evEbitda = 'A carregar...'
      }

      return {
        ticker: company.ticker,
        name: company.name,
        pe: pe,
        evEbitda: evEbitda,
        roic: netMargin, // fallback using net margin
        margin: displayGross
      }
    })
  }, [baseCompany, selectedPeers, baseFundamentals, peerFundamentals, prices])

  return (
    <div className="space-y-8">
      {/* Selector Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-semibold text-muted-foreground mr-2">Na Arena:</span>
              <Badge variant="default" className="text-sm py-1">{baseCompany.ticker} - {baseCompany.name}</Badge>
              
              {selectedPeers.map(peer => (
                <Badge key={peer.ticker} variant="secondary" className="text-sm py-1 flex items-center gap-1">
                  {peer.ticker} - {peer.name}
                  <button onClick={() => removePeer(peer.ticker)} className="ml-1 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}

              {selectedPeers.length < maxPeers && (
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger render={
                    <Button variant="outline" role="combobox" aria-expanded={open} className="w-[250px] justify-between border-dashed">
                      + Adicionar Concorrente
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  } />
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Procurar empresa..." />
                      <CommandList>
                        <CommandEmpty>Nenhum concorrente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {availablePeers.map((peer) => (
                            <CommandItem
                              key={peer.ticker}
                              value={peer.ticker}
                              onSelect={() => {
                                addPeer(peer)
                                setOpen(false)
                              }}
                              disabled={selectedPeers.some(p => p.ticker === peer.ticker)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedPeers.some(p => p.ticker === peer.ticker) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {peer.ticker} - {peer.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch id="indexed" checked={isIndexed} onCheckedChange={setIsIndexed} />
              <Label htmlFor="indexed">Base 100 (Crescimento Indexado)</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Valuation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Múltiplos e Rentabilidade</CardTitle>
          <CardDescription>Comparação lado a lado do último ano fiscal.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-t-lg">
                <tr>
                  <th className="px-6 py-3 font-semibold">Empresa</th>
                  <th className="px-6 py-3 font-semibold">Net Margin</th>
                  <th className="px-6 py-3 font-semibold">Gross Margin</th>
                  <th className="px-6 py-3 font-semibold">P/E Ratio</th>
                  <th className="px-6 py-3 font-semibold">EV / EBITDA</th>
                </tr>
              </thead>
              <tbody>
                {valuationData.map((row, i) => (
                  <tr key={row.ticker} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                      {row.ticker}
                    </td>
                    <td className="px-6 py-4">{row.roic}</td>
                    <td className="px-6 py-4">{row.margin}</td>
                    <td className="px-6 py-4 text-muted-foreground">{row.pe}</td>
                    <td className="px-6 py-4 text-muted-foreground">{row.evEbitda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Evolução de Receitas (Revenue)</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  axisLine={false} 
                  tickLine={false}
                  domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                />
                <RechartsTooltip 
                  formatter={(value: any) => [isIndexed ? `${Number(value).toFixed(1)}%` : formatYAxis(Number(value))]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                {[baseCompany, ...selectedPeers].map((company, index) => (
                  <Line 
                    key={company.ticker}
                    type="monotone" 
                    dataKey={`${company.ticker}_revenue`} 
                    name={company.ticker}
                    stroke={COLORS[index % COLORS.length]} 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lucro Líquido (Net Income)</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="year" axisLine={false} tickLine={false} />
                <YAxis 
                  tickFormatter={formatYAxis} 
                  axisLine={false} 
                  tickLine={false}
                  domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                />
                <RechartsTooltip 
                  formatter={(value: any) => [isIndexed ? `${Number(value).toFixed(1)}%` : formatYAxis(Number(value))]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                />
                <Legend />
                {[baseCompany, ...selectedPeers].map((company, index) => (
                  <Line 
                    key={company.ticker}
                    type="monotone" 
                    dataKey={`${company.ticker}_netIncome`} 
                    name={company.ticker}
                    stroke={COLORS[index % COLORS.length]} 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
