"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { SearchCode } from "lucide-react"
import { ScreenerFilters, ScreenerFiltersType } from "@/components/screener/ScreenerFilters"
import { ScreenerResults, ScreenerCompany } from "@/components/screener/ScreenerResults"
import { useDebounce } from "@/hooks/useDebounce"

export default function ScreenerPage() {
  const t = useTranslations("screener")
  const [isLoading, setIsLoading] = useState(true)
  const [results, setResults] = useState<ScreenerCompany[]>([])

  const [filters, setFilters] = useState<ScreenerFiltersType>({
    sector: "ALL",
    minGrossMargin: 0,
    minRoic: 0,
    minRevenue: 0,
    minEarningsYield: 0,
  })

  // Debounce the entire filter object so we don't spam the API while dragging sliders
  const debouncedFilters = useDebounce(filters, 500)

  useEffect(() => {
    async function fetchResults() {
      setIsLoading(true)
      try {
        const response = await fetch("/api/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(debouncedFilters),
        })
        if (response.ok) {
          const data = await response.json()
          setResults(data)
        } else {
          console.error("Failed to fetch screener results")
          setResults([])
        }
      } catch (error) {
        console.error("Error fetching screener:", error)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [debouncedFilters])

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-6 h-full flex flex-col">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <SearchCode className="h-6 w-6 text-primary" />
          {t("title")}
        </h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-1 overflow-y-auto">
          <ScreenerFilters filters={filters} onChange={setFilters} />
        </div>
        
        <div className="lg:col-span-3 overflow-y-auto pb-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">{t("results.count", { count: results.length })}</h3>
          </div>
          <ScreenerResults companies={results} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )
}
