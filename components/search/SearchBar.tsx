"use client"

import * as React from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/useDebounce"
import { useTranslations } from "next-intl"
import { useRecentSearches, type RecentSearch } from "@/hooks/useRecentSearches"


export function SearchBar() {
  const router = useRouter()
  const t = useTranslations('search')
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<RecentSearch[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLFormElement>(null)
  const { addSearch } = useRecentSearches()
  
  const debouncedQuery = useDebounce(query, 300)

  React.useEffect(() => {
    const fetchResults = async () => {
      if (debouncedQuery.length < 2) {
        setResults([])
        setIsOpen(false)
        return
      }

      setIsLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
        const data = await res.json()
        setResults(data)
        setIsOpen(true)
      } catch (error) {
        console.error("Failed to search", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchResults()
  }, [debouncedQuery])

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      setIsOpen(false)
      router.push(`/stock/${query.trim().toUpperCase()}`)
    }
  }

  const handleSelect = (company: RecentSearch) => {
    addSearch(company)
    setQuery("")
    setIsOpen(false)
    router.push(`/stock/${company.ticker}`)
  }

  return (
    <form ref={wrapperRef} onSubmit={handleSearch} className="relative w-full max-w-sm group">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
      <Input
        type="search"
        placeholder={t('placeholder')}
        className="w-full rounded-full bg-white/5 border-white/10 pl-10 md:w-[300px] lg:w-[400px] focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-white/10 transition-all backdrop-blur-md shadow-inner placeholder:text-muted-foreground/50 h-10"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!isOpen && e.target.value.length >= 2) setIsOpen(true)
        }}
        onFocus={() => {
          if (query.length >= 2) setIsOpen(true)
        }}
      />
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-popover border border-border/50 rounded-xl shadow-lg overflow-hidden z-50 animate-in fade-in-0 zoom-in-95 backdrop-blur-xl">
          <ul className="max-h-[300px] overflow-y-auto py-2">
            {results.map((company) => (
              <li key={company.ticker}>
                <button
                  type="button"
                  onClick={() => handleSelect(company)}
                  className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors flex items-center justify-between group/item"
                >
                  <div className="flex items-center gap-3">
                    {company.logoUrl ? (
                      <img src={company.logoUrl} alt={company.ticker} className="w-8 h-8 rounded-full bg-white p-0.5 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted text-[10px] font-bold text-muted-foreground border border-border/50">
                        {company.ticker.substring(0, 2)}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-foreground group-hover/item:text-primary transition-colors">
                        {company.ticker}
                      </div>
                      <div className="text-sm text-muted-foreground line-clamp-1">
                        {company.name}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-md">
                    {company.exchange}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute top-full mt-2 w-full bg-popover border border-border/50 rounded-xl shadow-lg p-6 text-center z-50 backdrop-blur-xl">
          <p className="text-muted-foreground text-sm">{t('noResults')}</p>
        </div>
      )}
    </form>
  )
}
