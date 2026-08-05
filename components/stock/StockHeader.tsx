"use client"

import { useEffect, useRef, useState } from "react"
import { successPulse } from "@/lib/motion"
import { track } from "@/lib/pulse/client"
import { TrendingUp, TrendingDown, Clock, Check, Plus, Scale } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { Link, useRouter } from '@/i18n/routing';
import { getCurrencySymbol } from "@/lib/finance/format"
import { CompanyLogo } from "@/components/ui/CompanyLogo"

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

export function StockHeader({ company, shareComponent, initialPriceData = null }: { company: CompanyProp, shareComponent?: React.ReactNode, initialPriceData?: PriceData | null }) {
  const t = useTranslations("stock")
  const locale = useLocale()
  const router = useRouter()
  const [priceData, setPriceData] = useState<PriceData | null>(initialPriceData)
  const [isLoading, setIsLoading] = useState(initialPriceData === null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(initialPriceData ? new Date() : null)
  
  // Portfolio state
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false)
  const followBtnRef = useRef<HTMLButtonElement>(null)

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

  const fetchWatchlistState = async () => {
    try {
      const res = await fetch(`/api/watchlist/check?ticker=${company.ticker}`)
      if (res.ok) {
        const data = await res.json()
        setIsFollowing(data.inWatchlist)
      } else if (res.status === 401) {
        // User not logged in
        setIsFollowing(null)
      }
    } catch (err) {
      console.error("Failed to fetch watchlist state", err)
    }
  }

  // Initial fetch & Polling every 60 seconds
  useEffect(() => {
    const init = async () => {
      await fetchPrice()
      await fetchWatchlistState()
    }
    init()
    const interval = setInterval(fetchPrice, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.ticker])

  const toggleFollow = async () => {
    // Anónimo: "Seguir" é o momento de maior intenção no header — manda
    // direto para a criação de conta em vez de ficar em no-op silencioso.
    if (isFollowing === null) {
      router.push('/register')
      return
    }

    setIsUpdatingFollow(true)
    try {
      const res = await fetch('/api/watchlist', {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: company.ticker })
      })
      if (res.ok) {
        setIsFollowing(!isFollowing)
        // celebrar a adição (não a remoção) — momento de sucesso discreto
        if (!isFollowing) {
          successPulse(followBtnRef.current)
          track("watchlist_add", { ticker: company.ticker })
        }
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
        <CompanyLogo
          src={company.logoUrl}
          alt={company.name}
          fallback={company.ticker}
          size={64}
          className="rounded-xl"
          imgClassName="p-2"
        />
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight break-words">{company.name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className="bg-muted px-2 py-0.5 rounded-md border border-border/60">{company.ticker}</span>
              <span>·</span>
              <span>{company.exchange}</span>
            </div>
            
            {/* Follow Button — visível também para anónimos (isFollowing
                fica null: nem "seguido" nem confirmado ainda); toggleFollow
                trata o caso null como redirect para /register em vez de
                esconder o botão (guest não via nenhuma afordância aqui). */}
            <button
              ref={followBtnRef}
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
                  {t('header.follow')}
                </>
              )}
            </button>

            {/* Compare Button */}
            <Link
              href={`/compare?ticker=${company.ticker}`}
              className="px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shadow-sm active:scale-95 bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/50"
            >
              <Scale className="w-3.5 h-3.5" />
              {t('header.comparePeers')}
            </Link>

            {/* Share Button */}
            {shareComponent}
          </div>
        </div>
      </div>

      {/* Right side: Real-time Price */}
      <div className="glass flex flex-col md:items-end p-4 rounded-xl w-full md:w-auto md:min-w-[200px]">
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
