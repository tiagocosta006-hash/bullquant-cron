"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import { TrendingUp, TrendingDown, Clock, Search, Briefcase, Loader2, ArrowRight } from "lucide-react"

type Company = {
  id: string;
  ticker: string;
  name: string;
  logoUrl: string | null;
  exchange: string;
}

type PortfolioItem = {
  id: string;
  company: Company;
}

type PriceData = {
  currentPrice: number;
  change: number;
  changePercent: number;
}

export default function Home() {
  const t = useTranslations("portfolio")
  const locale = useLocale()
  const router = useRouter()
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isPricesLoading, setIsPricesLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [authError, setAuthError] = useState(false)
  const [addingTicker, setAddingTicker] = useState<string | null>(null)

  const fetchPortfolio = async () => {
    try {
      const res = await fetch('/api/portfolio')
      if (res.status === 401) {
        setAuthError(true)
        setIsLoading(false)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
      }
    } catch (err) {
      console.error("Failed to fetch portfolio", err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPrices = async (tickers: string[]) => {
    if (tickers.length === 0) return
    setIsPricesLoading(true)
    try {
      const res = await fetch(`/api/prices/batch?tickers=${tickers.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setPrices(data)
        setLastUpdate(new Date())
      }
    } catch (err) {
      console.error("Failed to fetch prices", err)
    } finally {
      setIsPricesLoading(false)
    }
  }

  const handleQuickAdd = async (ticker: string) => {
    setAddingTicker(ticker)
    try {
      const res = await fetch('/api/portfolio/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      })
      if (res.ok) {
        await fetchPortfolio()
      }
    } catch (err) {
      console.error("Failed to add ticker", err)
    } finally {
      setAddingTicker(null)
    }
  }

  useEffect(() => {
    const init = async () => { await fetchPortfolio() }
    init()
  }, [])

  // Sem sessão → enviar para login (sem side-effect dentro do render).
  useEffect(() => {
    if (authError) router.replace("/login")
  }, [authError, router])

  useEffect(() => {
    if (items.length > 0) {
      const tickers = items.map(item => item.company.ticker)
      const initPrices = async () => { await fetchPrices(tickers) }
      initPrices()
      
      const interval = setInterval(() => {
        fetchPrices(tickers)
      }, 60000) // update every minute
      
      return () => clearInterval(interval)
    }
  }, [items])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (authError) {
    // O redirect é tratado no useEffect acima.
    return null;
  }

  const upToday = Object.values(prices).filter(p => p.change >= 0).length
  const POPULAR_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "NFLX"]
  const suggestedTickers = POPULAR_TICKERS.filter(ticker => !items.some(item => item.company.ticker === ticker)).slice(0, 4)

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <Briefcase className="w-8 h-8 text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        
        {items.length > 0 && (
          <div className="flex items-center gap-6 bg-card border border-border p-3 px-5 rounded-2xl shadow-sm">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t('positions')}</span>
              <span className="text-xl font-bold">{items.length}</span>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t('upToday')}</span>
              <span className="text-xl font-bold text-bull flex items-center gap-1">
                <TrendingUp className="w-4 h-4" /> {upToday}
              </span>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-card border border-border/60 rounded-2xl p-12 text-center shadow-sm">
          <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-2">{t('emptyState.title')}</h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            {t('emptyState.description')}
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {["AAPL", "MSFT", "NVDA", "AMZN"].map(ticker => (
              <button 
                key={ticker} 
                onClick={() => handleQuickAdd(ticker)}
                disabled={addingTicker === ticker}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/50 bg-background hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm transition-all group disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="font-extrabold text-lg group-hover:text-primary transition-colors">{ticker}</span>
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-1">
                  {addingTicker === ticker ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> {t('emptyState.adding')}</>
                  ) : (
                    <>{t('emptyState.quickAdd')} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity -ml-2 group-hover:ml-0" /></>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const price = prices[item.company.ticker]
            const isPositive = price ? price.change >= 0 : true
            
            return (
              <Link href={`/stock/${item.company.ticker}`} key={item.id} className="block group">
                <div className="bg-card border border-border/60 hover:border-primary/50 hover:shadow-md transition-all p-5 rounded-2xl flex flex-col h-full relative overflow-hidden">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/5 p-2 rounded-lg border border-primary/10 flex items-center justify-center shrink-0 w-12 h-12">
                        {item.company.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`${item.company.logoUrl}?v=1`} alt={item.company.name} referrerPolicy="no-referrer" className="w-8 h-8 object-contain rounded bg-white p-0.5" />
                        ) : (
                          <span className="font-bold text-primary">{item.company.ticker[0]}</span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg group-hover:text-primary transition-colors line-clamp-1">{item.company.ticker}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.company.name}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-auto pt-4 border-t border-border/40 flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-medium mb-1">{t('card.currentPrice')}</p>
                      {price ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-extrabold">${price.currentPrice.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="h-8 w-24 bg-muted animate-pulse rounded"></div>
                      )}
                    </div>
                    
                    {price && (
                      <div className={`flex flex-col items-end ${isPositive ? 'text-bull' : 'text-bear'}`}>
                        <div className="flex items-center gap-1 font-bold">
                          {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          <span>{isPositive ? '+' : ''}{price.changePercent.toFixed(2)}%</span>
                        </div>
                        <span className="text-xs font-medium opacity-80">{isPositive ? '+' : ''}{price.change.toFixed(2)} USD</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      
      {items.length > 0 && items.length < 4 && suggestedTickers.length > 0 && (
        <div className="mt-12 pt-8 border-t border-border/40">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            {t('suggestions.title')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {suggestedTickers.map(ticker => (
              <button 
                key={ticker} 
                onClick={() => handleQuickAdd(ticker)}
                disabled={addingTicker === ticker}
                className="flex flex-col items-center justify-center p-4 rounded-xl border border-border/50 bg-background hover:bg-muted/50 hover:border-primary/50 hover:shadow-sm transition-all group disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="font-extrabold text-lg group-hover:text-primary transition-colors">{ticker}</span>
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-1">
                  {addingTicker === ticker ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> {t('emptyState.adding')}</>
                  ) : (
                    <>{t('emptyState.quickAdd')} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity -ml-2 group-hover:ml-0" /></>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {lastUpdate && items.length > 0 && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground mt-4 font-medium">
          <Clock className="w-3.5 h-3.5" />
          <span>{t('lastUpdate')} {lastUpdate.toLocaleTimeString(locale)}</span>
          {isPricesLoading && <Loader2 className="w-3 h-3 animate-spin ml-2" />}
        </div>
      )}
    </div>
  )
}
