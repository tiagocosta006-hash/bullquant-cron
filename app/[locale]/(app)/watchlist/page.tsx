"use client"

import { useEffect, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Link } from '@/i18n/routing';
import { Clock, Star, Loader2, Plus } from "lucide-react"
import { PageHeader } from "@/components/layout/PageHeader"
import { PortfolioCard } from "@/components/portfolio/PortfolioCard"
import { AddPositionDialog } from "@/components/portfolio/AddPositionDialog"
import { PortfolioSuggestions } from "@/components/portfolio/PortfolioSuggestions"
import { ManualAddSearch } from "@/components/portfolio/ManualAddSearch"
import { ExploreTeaser } from "@/components/watchlist/ExploreTeaser"
import type { Company, PortfolioItem, PriceData } from "@/components/portfolio/types"

const POPULAR_TICKERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "NFLX"]

type WatchlistApiItem = {
  id: string
  addedAt: string
  company: Company
}

export default function WatchlistPage() {
  const t = useTranslations("watchlist")
  const locale = useLocale()
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isPricesLoading, setIsPricesLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [authError, setAuthError] = useState(false)
  const [addingTicker, setAddingTicker] = useState<string | null>(null)
  // "mover para portfólio": ticker escolhido para criar posição
  const [positionTicker, setPositionTicker] = useState<string | null>(null)

  const fetchWatchlist = async () => {
    try {
      const res = await fetch("/api/watchlist")
      if (res.status === 401) {
        setAuthError(true)
        setIsLoading(false)
        return
      }
      if (res.ok) {
        const data = await res.json()
        // Reutilizamos os componentes do portfólio: um item de watchlist é um
        // PortfolioItem sem posição (quantity/avgBuyPrice a null).
        setItems(
          ((data.items || []) as WatchlistApiItem[]).map((item) => ({
            id: item.id,
            company: item.company,
            quantity: null,
            avgBuyPrice: null,
          }))
        )
      }
    } catch (err) {
      console.error("Failed to fetch watchlist", err)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchPrices = async (tickers: string[]) => {
    if (tickers.length === 0) return
    setIsPricesLoading(true)
    try {
      const res = await fetch(`/api/prices/batch?tickers=${tickers.join(",")}`)
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
    if (items.some((item) => item.company.ticker === ticker)) return
    setAddingTicker(ticker)
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      })
      if (res.ok) {
        await fetchWatchlist()
      }
    } catch (err) {
      console.error("Failed to add ticker", err)
    } finally {
      setAddingTicker(null)
    }
  }

  const handleRemove = async (ticker: string) => {
    const previousItems = items
    setItems((prev) => prev.filter((item) => item.company.ticker !== ticker))
    try {
      const res = await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      })
      if (!res.ok) {
        setItems(previousItems)
      }
    } catch (err) {
      console.error("Failed to remove ticker", err)
      setItems(previousItems)
    }
  }

  // Posição criada no portfólio → tira da watchlist (fluxo "mover")
  const handlePositionAdded = async () => {
    if (positionTicker) {
      await handleRemove(positionTicker)
    }
    setPositionTicker(null)
  }

  useEffect(() => {
    const init = async () => { await fetchWatchlist() }
    init()
  }, [])

  useEffect(() => {
    if (items.length > 0) {
      const tickers = items.map((item) => item.company.ticker)
      const initPrices = async () => { await fetchPrices(tickers) }
      initPrices()
      const interval = setInterval(() => fetchPrices(tickers), 60000)
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
    return (
      <div className="container max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
          <Star className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-3">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("loginRequired")}</p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-semibold transition-opacity"
        >
          {t("loginButton")}
        </Link>
      </div>
    )
  }

  const upToday = Object.values(prices).filter((p) => p.change !== undefined && p.change >= 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Star className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          lastUpdate ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {lastUpdate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <div className="space-y-8">
          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{t("empty.title")}</h3>
              <p className="text-sm text-muted-foreground mt-1">{t("empty.description")}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ManualAddSearch onSelect={handleQuickAdd} />
              <div className="flex flex-wrap items-center gap-2">
                {POPULAR_TICKERS.slice(0, 4).map((ticker) => (
                  <QuickAddChip
                    key={ticker}
                    ticker={ticker}
                    isAdding={addingTicker === ticker}
                    onQuickAdd={handleQuickAdd}
                  />
                ))}
              </div>
            </div>
          </div>

          <ExploreTeaser />
        </div>
      ) : (
        <>
          <div className="glass flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl px-6 py-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("stats.following")}</p>
              <p className="nums text-2xl font-extrabold">{items.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("stats.upToday")}</p>
              <p className="nums text-2xl font-extrabold text-bull">{upToday}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <PortfolioCard
                key={item.id}
                item={item}
                price={prices[item.company.ticker]}
                onRemove={handleRemove}
                onAddPosition={setPositionTicker}
              />
            ))}
          </div>

          {items.length < 4 && <PortfolioSuggestions />}

          {lastUpdate && (
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground mt-4 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>{t("lastUpdate")} {lastUpdate.toLocaleTimeString(locale)}</span>
              {isPricesLoading && <Loader2 className="w-3 h-3 animate-spin ml-2" />}
            </div>
          )}
        </>
      )}

      <AddPositionDialog
        ticker={positionTicker}
        open={positionTicker !== null}
        onOpenChange={(open) => { if (!open) setPositionTicker(null) }}
        onAdded={handlePositionAdded}
      />
    </div>
  )
}

function QuickAddChip({
  ticker,
  isAdding,
  onQuickAdd,
}: {
  ticker: string
  isAdding: boolean
  onQuickAdd: (ticker: string) => void
}) {
  const t = useTranslations("watchlist")
  return (
    <button
      onClick={() => onQuickAdd(ticker)}
      disabled={isAdding}
      aria-label={`${t("empty.quickAdd")} ${ticker}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
      {ticker}
    </button>
  )
}
