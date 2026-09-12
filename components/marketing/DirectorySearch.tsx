"use client"

import { useState, useMemo } from "react"
import { Link } from "@/i18n/routing"
import { Search } from "lucide-react"

type Company = {
  ticker: string
  name: string
  sector?: string | null
  logoUrl?: string | null
}

interface DirectorySearchProps {
  companies: Company[]
  emptyMessage: string
}

export function DirectorySearch({ companies, emptyMessage }: DirectorySearchProps) {
  const [query, setQuery] = useState("")

  const filteredCompanies = useMemo(() => {
    if (!query.trim()) return companies
    
    const lowerQuery = query.toLowerCase()
    return companies.filter(
      (c) =>
        c.ticker.toLowerCase().includes(lowerQuery) ||
        c.name.toLowerCase().includes(lowerQuery) ||
        (c.sector && c.sector.toLowerCase().includes(lowerQuery))
    )
  }, [companies, query])

  // Group by first letter of ticker
  const grouped = useMemo(() => {
    return filteredCompanies.reduce((acc, company) => {
      const letter = company.ticker.charAt(0).toUpperCase()
      if (!acc[letter]) {
        acc[letter] = []
      }
      acc[letter].push(company)
      return acc
    }, {} as Record<string, typeof companies>)
  }, [filteredCompanies])

  const sortedLetters = Object.keys(grouped).sort()

  return (
    <div className="space-y-12 w-full">
      {/* Search Bar */}
      <div className="max-w-2xl mx-auto relative">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar por ticker, nome ou setor..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-4 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground text-lg shadow-sm"
          />
        </div>
      </div>

      {filteredCompanies.length === 0 ? (
        <div className="text-center text-muted-foreground p-12 glass rounded-xl">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Alphabet quick navigation */}
          {sortedLetters.length > 1 && !query.trim() && (
            <div className="flex flex-wrap gap-2 justify-center pb-8 border-b border-border/40">
              {sortedLetters.map((letter) => (
                <a
                  key={letter}
                  href={`#letter-${letter}`}
                  className="w-8 h-8 flex items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground font-medium transition-colors"
                >
                  {letter}
                </a>
              ))}
            </div>
          )}

          {/* Directory Grid */}
          <div className="space-y-16">
            {sortedLetters.map((letter) => (
              <div key={letter} id={`letter-${letter}`} className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-primary mb-6 border-b border-border/40 pb-2">
                  {letter}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {grouped[letter].map((company) => (
                    <Link
                      key={company.ticker}
                      href={`/stock/${company.ticker}`}
                      className="group flex items-start gap-4 p-4 rounded-xl glass hover:ring-2 hover:ring-primary/50 transition-all"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {company.logoUrl ? (
                          <img
                            src={company.logoUrl}
                            alt={`${company.name} logo`}
                            className="w-10 h-10 rounded-full object-contain bg-white dark:bg-white/90 p-0.5"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {company.ticker.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {company.ticker}
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {company.name}
                        </span>
                        {company.sector && (
                          <span className="text-xs font-medium text-muted-foreground/70 truncate mt-1">
                            {company.sector}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
