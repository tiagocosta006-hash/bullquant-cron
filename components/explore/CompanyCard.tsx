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
      className="text-left flex flex-col h-full p-5 rounded-xl border border-white/5 bg-card hover:bg-card-hover hover:border-white/10 transition-all group"
    >
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 shrink-0 bg-white/5 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
            {company.logoUrl ? (
              <Image src={company.logoUrl} alt={company.name} width={32} height={32} className="object-contain" />
            ) : (
              <span className="text-white/40 font-bold">{company.ticker.substring(0, 2)}</span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white group-hover:text-primary transition-colors line-clamp-1">{company.name}</h3>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span className="font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/70">{company.ticker}</span>
              <span className="line-clamp-1">{company.industry}</span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="flex-1 mb-2">
          <p className="text-sm text-white/70 line-clamp-5 leading-relaxed">
            {company.description || t("noDescription")}
          </p>
        </div>


    </button>
  )
}
