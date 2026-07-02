"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import Image from "next/image"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react"

export type ScreenerCompany = {
  id: string
  ticker: string
  name: string
  logoUrl: string | null
  sector: string
  revenue: number | null
  grossMargin: number | null
  roic: number | null
  dividendPerShare: number | null
  earningsYield?: number | null
}

interface ScreenerResultsProps {
  companies: ScreenerCompany[]
  isLoading: boolean
}

export function ScreenerResults({ companies, isLoading }: ScreenerResultsProps) {
  const t = useTranslations("screener")

  const formatPercent = (val: number | null) => {
    if (val === null) return "N/A"
    return `${(val * 100).toFixed(1)}%`
  }

  const formatMoney = (val: number | null) => {
    if (val === null) return "N/A"
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`
    return `$${val.toFixed(2)}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-xl bg-card">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground">{t("results.loading")}</p>
        </div>
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border rounded-xl bg-card text-center p-6 gap-2">
        <p className="text-lg font-semibold">{t("results.empty")}</p>
        <p className="text-muted-foreground">{t("results.emptyDesc")}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>{t("results.company")}</TableHead>
            <TableHead>{t("results.sector")}</TableHead>
            <TableHead className="text-right">{t("results.revenue")}</TableHead>
            <TableHead className="text-right">{t("results.grossMargin")}</TableHead>
            <TableHead className="text-right">{t("results.roic")}</TableHead>
            <TableHead className="text-right">{t("results.earningsYield")}</TableHead>
            <TableHead className="text-right">{t("results.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id} className="group hover:bg-muted/50 transition-colors">
              <TableCell className="font-medium">
                <Link href={`/stock/${company.ticker}`} className="flex items-center gap-3">
                  {company.logoUrl ? (
                    <Image
                      src={company.logoUrl}
                      alt={company.name}
                      width={32}
                      height={32}
                      className="rounded-full bg-white object-contain"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {company.ticker.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{company.ticker}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">
                      {company.name}
                    </span>
                  </div>
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{company.sector || "N/A"}</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(company.revenue)}</TableCell>
              <TableCell className="text-right font-mono">
                {company.grossMargin !== null && company.grossMargin > 0.4 ? (
                  <span className="text-bull font-semibold">{formatPercent(company.grossMargin)}</span>
                ) : (
                  formatPercent(company.grossMargin)
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {company.roic !== null && company.roic > 0.15 ? (
                  <span className="text-bull font-semibold flex items-center justify-end gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {formatPercent(company.roic)}
                  </span>
                ) : company.roic !== null && company.roic < 0 ? (
                  <span className="text-bear flex items-center justify-end gap-1">
                    <TrendingDown className="h-3 w-3" />
                    {formatPercent(company.roic)}
                  </span>
                ) : (
                  formatPercent(company.roic)
                )}
              </TableCell>
              <TableCell className="text-right font-mono">
                {company.earningsYield !== undefined && company.earningsYield !== null && company.earningsYield > 0.05 ? (
                  <span className="text-bull font-semibold">{formatPercent(company.earningsYield)}</span>
                ) : (
                  formatPercent(company.earningsYield ?? null)
                )}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/stock/${company.ticker}`}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="sr-only">{t("results.viewStock")}</span>
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
