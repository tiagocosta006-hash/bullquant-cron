"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, Clock, Check, Plus, Scale } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import { getCurrencySymbol } from "@/lib/finance/format"

type CompanyProp = {
  ticker: string;
  name: string;
  exchange: string;
  logoUrl: string | null;
  currency?: string | null;
}

type PriceData = {
  currentPrice: number;
  change: number;
  changePercent: number;
}

export function StockHeader({ company, pdfButton }: { company: CompanyProp, pdfButton?: React.ReactNode }) {
  const t = useTranslations("stock")
  const locale = useLocale()
  const [priceData, setPriceData] = useState<PriceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  
  // Portfolio state
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false)

  const fetchPrice = async () => {
    try {
      const res = await fetch(`/api/price/${company.ticker}`)
      if (res.ok) {
        const data = await res.json()
        setPriceData({
          currentPrice: data.currentPrice,
          change: data.change,
          changePercent: data.changePercent,
        })
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error("Failed to fetch price:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPortfolioState = async () => {
    try {
      const res = await fetch(`/api/portfolio/check?ticker=${company.ticker}`)
      if (res.ok) {
        const data = await res.json()
        setIsFollowing(data.isFollowing)
      } else if (res.status === 401) {
        // User not logged in
        setIsFollowing(null)
      }
    } catch (err) {
      console.error("Failed to fetch portfolio state", err)
    }
  }

  // Initial fetch & Polling every 60 seconds
  useEffect(() => {
    const init = async () => {
      await fetchPrice()
      await fetchPortfolioState()
    }
    init()
    const interval = setInterval(fetchPrice, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.ticker])

  const toggleFollow = async () => {
    if (isFollowing === null) return // Not logged in (would ideally redirect to login)
    
    setIsUpdatingFollow(true)
    try {
      if (isFollowing) {
        const res = await fetch('/api/portfolio/remove', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: company.ticker })
        })
        if (res.ok) setIsFollowing(false)
      } else {
        const res = await fetch('/api/portfolio/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: company.ticker })
        })
        if (res.ok) setIsFollowing(true)
      }
    } catch (err) {
      console.error("Failed to toggle follow state", err)
    } finally {
      setIsUpdatingFollow(false)
    }
  }

  const isPositive = priceData ? priceData.change >= 0 : true

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border/40">
      {/* Left side: Company Info */}
      <div className="flex items-center gap-4">
        <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 shadow-sm flex items-center justify-center shrink-0 w-16 h-16 relative overflow-hidden">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={company.logoUrl} 
              alt={company.name} 
              className="w-12 h-12 object-contain rounded-lg bg-white p-1" 
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <span className={`font-extrabold text-2xl text-primary absolute ${company.logoUrl ? "hidden" : ""}`}>{company.ticker[0]}</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{company.name}</h1>
          <div className="flex items-center gap-4 mt-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border/60">{company.ticker}</span>
              <span>·</span>
              <span>{company.exchange}</span>
            </div>
            
            {/* Follow Button */}
            {isFollowing !== null && (
              <button
                onClick={toggleFollow}
                disabled={isUpdatingFollow}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shadow-sm active:scale-95 ${
                  isFollowing 
                    ? 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md'
                }`}
              >
                {isUpdatingFollow ? (
                  <span className="animate-pulse">{t('header.updating')}</span>
                ) : isFollowing ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {t('header.followed')}
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    {t('header.addToPortfolio')}
                  </>
                )}
              </button>
            )}

            {/* Compare Button */}
            <Link
              href={`/compare?ticker=${company.ticker}`}
              className="px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shadow-sm active:scale-95 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50"
            >
              <Scale className="w-3.5 h-3.5" />
              Comparar Pares
            </Link>

            {/* PDF Report Button */}
            {pdfButton}
          </div>
        </div>
      </div>

      {/* Right side: Real-time Price */}
      <div className="glass flex flex-col md:items-end p-4 rounded-xl min-w-[200px]">
        {isLoading ? (
          <div className="animate-pulse flex flex-col items-end gap-2 w-full">
            <div className="h-8 bg-muted rounded w-32"></div>
            <div className="h-4 bg-muted rounded w-24"></div>
          </div>
        ) : priceData ? (
          <>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-extrabold tracking-tighter">
                {getCurrencySymbol(company.currency)}{priceData.currentPrice.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground mb-1.5 font-medium">{company.currency || 'USD'}</span>
            </div>
            
            <div className={`flex items-center gap-1.5 text-sm font-bold mt-1 ${isPositive ? 'text-bull' : 'text-bear'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{isPositive ? '+' : ''}{priceData.change.toFixed(2)}</span>
              <span>({isPositive ? '+' : ''}{priceData.changePercent.toFixed(2)}%)</span>
            </div>
            
            {lastUpdate && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3 font-medium">
                <Clock className="w-3 h-3" />
                <span>{t('updatedAt')} {lastUpdate.toLocaleTimeString(locale)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">{t('priceUnavailable')}</div>
        )}
      </div>
    </div>
  )
}
