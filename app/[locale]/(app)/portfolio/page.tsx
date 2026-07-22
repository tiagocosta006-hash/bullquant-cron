"use client"

import { useEffect, useMemo, useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Link } from '@/i18n/routing';
import { Clock, Briefcase, Loader2 } from "lucide-react"
import { PageHeader } from "@/components/layout/PageHeader"
import { PortfolioCard } from "@/components/portfolio/PortfolioCard"
import { PortfolioTable } from "@/components/portfolio/PortfolioTable"
import { PortfolioEmptyState } from "@/components/portfolio/PortfolioEmptyState"
import { PortfolioSuggestions } from "@/components/portfolio/PortfolioSuggestions"
import { PortfolioSummary } from "@/components/portfolio/PortfolioSummary"
import { PortfolioToolbar } from "@/components/portfolio/PortfolioToolbar"
import { PortfolioValueChart } from "@/components/portfolio/PortfolioValueChart"
import { PortfolioAllocation } from "@/components/portfolio/PortfolioAllocation"
import { PortfolioManageBar } from "@/components/portfolio/PortfolioManageBar"
import { ImportPortfolio } from "@/components/portfolio/ImportPortfolio"
import { AddPositionDialog } from "@/components/portfolio/AddPositionDialog"
import { calculatePositionPnl, aggregatePnl } from "@/lib/finance/portfolio"
import type { PortfolioItem, PriceData, SortKey, ViewMode } from "@/components/portfolio/types"

const VIEW_MODE_STORAGE_KEY = "portfolio.viewMode"

export default function Home() {
  const t = useTranslations("portfolio")
  const locale = useLocale()
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [prices, setPrices] = useState<Record<string, PriceData>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isPricesLoading, setIsPricesLoading] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [authError, setAuthError] = useState(false)
  const [addingTicker, setAddingTicker] = useState<string | null>(null)
  // Posições exigem quantidade + preço médio → o quick-add abre um diálogo.
  const [positionTicker, setPositionTicker] = useState<string | null>(null)
  // Edição de uma posição existente (diálogo em modo edit)
  const [editItem, setEditItem] = useState<PortfolioItem | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("addedAt")
  const [sectorFilter, setSectorFilter] = useState("ALL")
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid"
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return stored === "grid" || stored === "table" ? stored : "grid"
  })
  const [isImportOpen, setIsImportOpen] = useState(false)

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

  const handleQuickAdd = (ticker: string) => {
    if (items.some(item => item.company.ticker === ticker)) return
    setPositionTicker(ticker)
  }

  const handlePositionAdded = async () => {
    setPositionTicker(null)
    setAddingTicker(null)
    // A API não devolve a `company`; refetch é necessário para ter logo/nome/exchange/sector.
    await fetchPortfolio()
  }

  const handleEdit = (ticker: string) => {
    const item = items.find(i => i.company.ticker === ticker)
    if (item) setEditItem(item)
  }

  const handleEdited = async () => {
    setEditItem(null)
    await fetchPortfolio()
  }

  const handleRemove = async (ticker: string) => {
    const previousItems = items
    setItems(prev => prev.filter(item => item.company.ticker !== ticker))
    try {
      const res = await fetch('/api/portfolio/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker })
      })
      if (!res.ok) {
        setItems(previousItems)
      }
    } catch (err) {
      console.error("Failed to remove ticker", err)
      setItems(previousItems)
    }
  }

  useEffect(() => {
    const init = async () => { await fetchPortfolio() }
    init()
  }, [])

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
  }

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

  const sectors = useMemo(() => {
    const unique = new Set(items.map(item => item.company.sector).filter((s): s is string => !!s))
    return Array.from(unique).sort()
  }, [items])

  const portfolioPnl = useMemo(() => {
    const positions = items
      .map(item => {
        const quantity = item.quantity !== null ? Number(item.quantity) : null
        const avgBuyPrice = item.avgBuyPrice !== null ? Number(item.avgBuyPrice) : null
        const fees = item.fees !== null && item.fees !== undefined ? Number(item.fees) : 0
        const currentPrice = prices[item.company.ticker]?.currentPrice
        if (quantity === null || avgBuyPrice === null || currentPrice === undefined) return null
        return calculatePositionPnl(quantity, avgBuyPrice, currentPrice, fees)
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)

    if (positions.length === 0) return null
    return aggregatePnl(positions)
  }, [items, prices])

  const hasRealPositions = items.some(item => item.quantity !== null)

  const visibleItems = useMemo(() => {
    let filtered = items
    if (sectorFilter !== "ALL") {
      filtered = filtered.filter(item => item.company.sector === sectorFilter)
    }

    const sorted = [...filtered]
    switch (sortKey) {
      case "name":
        sorted.sort((a, b) => a.company.name.localeCompare(b.company.name))
        break
      case "sector":
        sorted.sort((a, b) => (a.company.sector || "").localeCompare(b.company.sector || ""))
        break
      case "changePercent":
        sorted.sort((a, b) => {
          const changeA = prices[a.company.ticker]?.changePercent ?? -Infinity
          const changeB = prices[b.company.ticker]?.changePercent ?? -Infinity
          return changeB - changeA
        })
        break
      case "addedAt":
      default:
        // A API já devolve os items ordenados por addedAt desc.
        break
    }
    return sorted
  }, [items, prices, sectorFilter, sortKey])

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
          <Briefcase className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-3">{t('landing.title')}</h1>
        <p className="text-muted-foreground mb-2">{t('loginRequired')}</p>
        <p className="text-muted-foreground mb-8">{t('landing.description')}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/stock/AAPL"
            className="w-full sm:w-auto px-6 py-3 rounded-xl border border-border bg-background hover:bg-muted/50 font-semibold transition-colors"
          >
            {t('landing.testExample')}
          </Link>
          <Link
            href="/register"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 font-semibold transition-opacity"
          >
            {t('landing.createAccount')}
          </Link>
        </div>
        <Link href="/login" className="inline-block mt-6 text-sm font-medium text-primary hover:underline">
          {t('loginButton')}
        </Link>
      </div>
    )
  }

  const upToday = Object.values(prices).filter(p => p.change !== undefined && p.change >= 0).length

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Briefcase className="h-6 w-6" />}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          lastUpdate ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {lastUpdate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <>
          <PortfolioEmptyState addingTicker={addingTicker} onQuickAdd={handleQuickAdd} />
          <PortfolioManageBar onImportClick={() => setIsImportOpen(true)} onSynced={fetchPortfolio} onManualAdd={handleQuickAdd} />
        </>
      ) : (
        <>
          <PortfolioSummary positions={items.length} upToday={upToday} pnl={portfolioPnl} />

          {hasRealPositions && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <PortfolioValueChart />
              </div>
              <PortfolioAllocation items={items} prices={prices} />
            </div>
          )}

          <PortfolioManageBar onImportClick={() => setIsImportOpen(true)} onSynced={fetchPortfolio} onManualAdd={handleQuickAdd} />

          <PortfolioToolbar
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            sectorFilter={sectorFilter}
            onSectorFilterChange={setSectorFilter}
            sectors={sectors}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleItems.map((item) => (
                <PortfolioCard
                  key={item.id}
                  item={item}
                  price={prices[item.company.ticker]}
                  onRemove={handleRemove}
                  onEdit={handleEdit}
                />
              ))}
            </div>
          ) : (
            <PortfolioTable items={visibleItems} prices={prices} onRemove={handleRemove} onEdit={handleEdit} />
          )}
        </>
      )}

      {isImportOpen && (
        <ImportPortfolio
          onClose={() => setIsImportOpen(false)}
          onImported={fetchPortfolio}
        />
      )}

      <AddPositionDialog
        ticker={positionTicker}
        open={positionTicker !== null}
        onOpenChange={(open) => { if (!open) setPositionTicker(null) }}
        onAdded={handlePositionAdded}
      />

      <AddPositionDialog
        mode="edit"
        ticker={editItem?.company.ticker ?? null}
        initial={editItem}
        open={editItem !== null}
        onOpenChange={(open) => { if (!open) setEditItem(null) }}
        onAdded={handleEdited}
      />

      {items.length > 0 && items.length < 4 && (
        <PortfolioSuggestions />
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
