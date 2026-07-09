"use client"

import { useTranslations } from "next-intl"
import { ChevronRight } from "lucide-react"

interface IndustryListProps {
  industries: Record<string, number>
  onSelect: (industry: string) => void
}

export function IndustryList({ industries, onSelect }: IndustryListProps) {
  const t = useTranslations("explore")

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
          className="glass flex items-center justify-between p-4 rounded-xl text-left group transition-transform hover:-translate-y-0.5"
        >
          <div>
            <h4 className="font-medium text-foreground group-hover:text-primary transition-colors">
              {industryName === "Unknown" ? t("otherIndustries") : industryName}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">{t("companiesCount", { count })}</p>
          </div>
          <ChevronRight size={18} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </button>
      ))}
    </div>
  )
}
