"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/useDebounce"
import { CompanyLogo } from "@/components/ui/CompanyLogo"

interface SearchResult {
  ticker: string
  name: string
  exchange: string
  logoUrl: string | null
}

/** Pesquisa de ticker para adicionar manualmente uma posição — abre o
 *  AddPositionDialog (quantidade + preço) via onSelect, tal como o quick-add
 *  do estado vazio, mas disponível também com portfólio já preenchido.
 *  O dropdown de resultados renderiza num portal porque o painel-pai usa
 *  `.glass` (overflow: hidden para o efeito de vidro) e cortava a lista. */
export function ManualAddSearch({ onSelect }: { onSelect: (ticker: string) => void }) {
  const t = useTranslations("portfolio.manage")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
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
        setResults(Array.isArray(data) ? data : [])
        setIsOpen(true)
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchResults()
  }, [debouncedQuery])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const updateRect = () => {
      const el = wrapperRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    updateRect()
    window.addEventListener("scroll", updateRect, true)
    window.addEventListener("resize", updateRect)
    return () => {
      window.removeEventListener("scroll", updateRect, true)
      window.removeEventListener("resize", updateRect)
    }
  }, [isOpen])

  const handleSelect = (company: SearchResult) => {
    setQuery("")
    setResults([])
    setIsOpen(false)
    onSelect(company.ticker)
  }

  const showResults = isOpen && results.length > 0
  const showNoResults = isOpen && query.length >= 2 && !isLoading && results.length === 0

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder={t("manualAddPlaceholder")}
        className="w-full pl-10"
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

      {mounted && (showResults || showNoResults) && rect && createPortal(
        <div
          style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
          className="z-[100] bg-popover border border-border/50 rounded-xl shadow-lg overflow-hidden"
        >
          {showResults ? (
            <ul className="max-h-[280px] overflow-y-auto py-2">
              {results.map((company) => (
                <li key={company.ticker}>
                  <button
                    type="button"
                    onClick={() => handleSelect(company)}
                    className="w-full px-4 py-2.5 text-left hover:bg-muted/50 transition-colors flex items-center gap-3"
                  >
                    <CompanyLogo
                      src={company.logoUrl}
                      alt={company.ticker}
                      fallback={company.ticker}
                      size={28}
                      className="rounded-full"
                      imgClassName="p-0.5"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-foreground">{company.ticker}</div>
                      <div className="text-xs text-muted-foreground truncate">{company.name}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-center text-sm text-muted-foreground">{t("manualAddNoResults")}</p>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
