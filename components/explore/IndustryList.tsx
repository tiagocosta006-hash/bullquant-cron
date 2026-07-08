"use client"

import { ChevronRight } from "lucide-react"

interface IndustryListProps {
  industries: Record<string, number>
  onSelect: (industry: string) => void
}

export function IndustryList({ industries, onSelect }: IndustryListProps) {
  // Ordenar por número de empresas (descendente) e alfabeticamente em caso de empate
  const sortedIndustries = Object.entries(industries).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0].localeCompare(b[0])
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {sortedIndustries.map(([industryName, count]) => (
        <button
          key={industryName}
          onClick={() => onSelect(industryName)}
          className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-card hover:bg-card-hover hover:border-white/10 transition-colors text-left group"
        >
          <div>
            <h4 className="font-medium text-white group-hover:text-primary transition-colors">
              {industryName === "Unknown" ? "Outras Indústrias" : industryName}
            </h4>
            <p className="text-xs text-white/50 mt-0.5">{count} {count === 1 ? 'empresa' : 'empresas'}</p>
          </div>
          <ChevronRight size={18} className="text-white/20 group-hover:text-primary transition-colors" />
        </button>
      ))}
    </div>
  )
}
