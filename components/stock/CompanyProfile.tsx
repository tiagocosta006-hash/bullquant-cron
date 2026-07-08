"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Globe, User, Users, Briefcase, Building2, MapPin, Landmark } from "lucide-react"

interface CompanyProfileProps {
  company: {
    name: string
    description: string | null
    website: string | null
    ceo: string | null
    sector: string | null
    industry: string | null
    employees: number | null
    country: string
    exchange: string
  }
}

export function CompanyProfile({ company }: CompanyProfileProps) {
  const t = useTranslations("stock.profile")

  const details = [
    {
      label: "CEO",
      value: company.ceo || "-",
      icon: User
    },
    {
      label: t("website"),
      value: company.website ? (
        <a 
          href={company.website.startsWith('http') ? company.website : `https://${company.website}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline hover:text-primary/80 transition-colors"
        >
          {company.website.replace(/^https?:\/\//, '')}
        </a>
      ) : "-",
      icon: Globe
    },
    {
      label: t("sector"),
      value: company.sector || "-",
      icon: Briefcase
    },
    {
      label: t("industry"),
      value: company.industry || "-",
      icon: Building2
    },
    {
      label: t("employees"),
      value: company.employees ? company.employees.toLocaleString("en-US") : "-",
      icon: Users
    },
    {
      label: t("country"),
      value: company.country || "-",
      icon: MapPin
    },
    {
      label: t("exchange"),
      value: company.exchange || "-",
      icon: Landmark
    }
  ]

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="mb-6 font-heading text-xl font-bold tracking-tight text-foreground">
        {t("title")}
      </h2>

      <div className="mb-8 space-y-3">
        {details.map((detail, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between border-b border-border/50 border-dashed pb-3 last:border-0 last:pb-0"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <detail.icon className="h-4 w-4 opacity-70" />
              <span className="text-sm font-medium">{detail.label}</span>
            </div>
            <div className="text-sm font-semibold text-foreground text-right max-w-[50%] truncate">
              {detail.value}
            </div>
          </div>
        ))}
      </div>

      {company.description && (
        <div className="border-t border-border/50 pt-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {company.description}
          </p>
        </div>
      )}
    </div>
  )
}
