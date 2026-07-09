"use client"

import Link from "next/link"
import Image from "next/image"
import { useTranslations } from "next-intl"

interface CompanyCardProps {
  company: {
    id: string
    ticker: string
    name: string
    logoUrl: string | null
    sector: string
    industry: string
    description: string | null
    revenue: number | null
    netMargin: number | null
    roic: number | null
    ceo?: string | null
    revenueSegments?: any
  }
  onClick: (company: any) => void
}



export function CompanyCard({ company, onClick }: CompanyCardProps) {
  const t = useTranslations("explore")

  return (
    <button
      onClick={() => onClick(company)}
      className="glass text-left flex flex-col h-full p-5 rounded-xl transition-transform hover:-translate-y-0.5 group"
    >

        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 shrink-0 bg-muted rounded-lg border border-border flex items-center justify-center overflow-hidden">
            {company.logoUrl ? (
              <Image src={company.logoUrl} alt={company.name} width={32} height={32} className="object-contain" />
            ) : (
              <span className="text-muted-foreground font-bold">{company.ticker.substring(0, 2)}</span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">{company.name}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="nums font-semibold bg-accent px-1.5 py-0.5 rounded text-foreground">{company.ticker}</span>
              <span className="line-clamp-1">{company.industry}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 mb-2">
          <p className="text-sm text-muted-foreground line-clamp-5 leading-relaxed">
            {company.description || t("noDescription")}
          </p>
        </div>


    </button>
  )
}
