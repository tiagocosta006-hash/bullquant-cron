"use client"

import { useTranslations } from "next-intl"
import Link from "next/link"
import { CompanyLogo } from "@/components/ui/CompanyLogo"
import { Building2, X, Users, ArrowRight, Activity, HandCoins, ExternalLink, Scale, Globe, TrendingUp, TrendingDown } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface BusinessProfileSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company: {
    id: string
    ticker: string
    name: string
    logoUrl: string | null
    sector: string
    industry: string
    description: string | null
    ceo: string | null
    revenueSegments: any
    geographicFocus?: string | null
    bullCase?: string | null
    bearCase?: string | null
    swot?: any
    extraInfo?: string | null
  } | null
}

export function BusinessProfileSheet({ open, onOpenChange, company }: BusinessProfileSheetProps) {
  const t = useTranslations("explore")

  if (!company) return null

  // Parse revenue segments se existirem
  const segmentsObj = typeof company.revenueSegments === 'string' 
    ? JSON.parse(company.revenueSegments) 
    : company.revenueSegments
  
  // Transformar num array ordenado
  let segmentsArr: { name: string, value: number }[] = []
  if (segmentsObj && typeof segmentsObj === 'object') {
    segmentsArr = Object.entries(segmentsObj)
      .map(([name, val]) => ({ name, value: Number(val) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) // Top 5
  }

  // Calculate total for percentages
  const totalRev = segmentsArr.reduce((acc, s) => acc + s.value, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass !w-[90vw] sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-5xl !p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-6 border-b border-border">
            <div className="flex items-start justify-between mb-4">
              <CompanyLogo
                src={company.logoUrl}
                alt={company.name}
                fallback={company.ticker}
                size={64}
                className="rounded-xl"
                imgClassName="p-2"
              />
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-1">{company.name}</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="nums font-semibold bg-primary/12 text-primary px-2 py-0.5 rounded">
                {company.ticker}
              </span>
              <div className="flex items-center gap-1.5">
                <Building2 size={14} />
                <span>{company.industry}</span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-8">
            {/* O Negócio */}
            <section>
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-3">
                <Activity size={18} className="text-primary" />
                {t("sheet.businessModel")}
              </h3>
              <p className="text-foreground/80 leading-relaxed">
                {company.description || t("noDescription")}
              </p>
            </section>

            {/* Como ganham dinheiro */}
            {segmentsArr.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                  <HandCoins size={18} className="text-bull" />
                  {t("sheet.revenueStreams")}
                </h3>
                <div className="space-y-3">
                  {segmentsArr.map((seg, i) => {
                    const pct = totalRev > 0 ? (seg.value / totalRev) * 100 : 0
                    return (
                      <div key={i} className="group">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-foreground/80 truncate pr-4">{seg.name}</span>
                          <span className="nums text-foreground font-medium">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Liderança e Mercado */}
            <div className="grid grid-cols-2 gap-4">
              {company.ceo && (
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
                    <Users size={16} className="text-primary" />
                    {t("sheet.leadership")}
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
                    <div className="w-10 h-10 rounded-full bg-primary/12 flex items-center justify-center text-primary font-bold shrink-0">
                      {company.ceo.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground font-medium truncate">{company.ceo}</p>
                      <p className="text-xs text-muted-foreground">CEO</p>
                    </div>
                  </div>
                </section>
              )}
              {company.geographicFocus && (
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
                    <Globe size={16} className="text-primary" />
                    {t("sheet.mainMarket")}
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/60 border border-border">
                    <div className="w-10 h-10 rounded-full bg-primary/12 flex items-center justify-center text-primary shrink-0">
                      <Globe size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground font-medium truncate" title={company.geographicFocus}>{company.geographicFocus}</p>
                      <p className="text-xs text-muted-foreground">{t("sheet.globalPresence")}</p>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Bull vs Bear Case — cor semântica sobe/desce, nunca decorativa */}
            {(company.bullCase || company.bearCase) && (
              <section className="grid sm:grid-cols-2 gap-4">
                {company.bullCase && (
                  <div className="p-4 rounded-xl bg-bull/10 border border-bull/25 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                      <TrendingUp size={48} className="text-bull" />
                    </div>
                    <h3 className="text-bull font-bold flex items-center gap-2 mb-2">
                      <span>🐂</span> {t("sheet.bullCase")}
                    </h3>
                    <p className="text-sm text-foreground/80 relative z-10 leading-relaxed">
                      {company.bullCase}
                    </p>
                  </div>
                )}
                {company.bearCase && (
                  <div className="p-4 rounded-xl bg-bear/10 border border-bear/25 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                      <TrendingDown size={48} className="text-bear" />
                    </div>
                    <h3 className="text-bear font-bold flex items-center gap-2 mb-2">
                      <span>🐻</span> {t("sheet.bearCase")}
                    </h3>
                    <p className="text-sm text-foreground/80 relative z-10 leading-relaxed">
                      {company.bearCase}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* SWOT Matrix — 4 quadrantes, identidade fixa (não é série de dados) */}
            {company.swot && (typeof company.swot === 'object') && (
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-primary" />
                  {t("sheet.swotTitle")}
                </h3>
                <div className="grid grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border">
                  <div className="bg-card p-4 space-y-2">
                    <h4 className="font-bold text-bull text-sm">{t("sheet.swotStrengths")}</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-3">
                      {(company.swot as any).forcas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-card p-4 space-y-2">
                    <h4 className="font-bold text-bear text-sm">{t("sheet.swotWeaknesses")}</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-3">
                      {(company.swot as any).fraquezas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-card p-4 space-y-2">
                    <h4 className="font-bold text-primary text-sm">{t("sheet.swotOpportunities")}</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-3">
                      {(company.swot as any).oportunidades?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-card p-4 space-y-2">
                    <h4 className="font-bold text-chart-4 text-sm">{t("sheet.swotThreats")}</h4>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-3">
                      {(company.swot as any).ameacas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* Extra Info */}
            {company.extraInfo && (
              <section className="p-4 rounded-xl bg-muted/60 border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <span>💡</span> {t("sheet.extraInfo")}
                </h3>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {company.extraInfo}
                </p>
              </section>
            )}

            {/* Acções / Navegação */}
            <section className="pt-4 border-t border-border space-y-3">
              <Link
                href={`/compare?ticker=${company.ticker}`}
                className="flex items-center justify-between w-full p-4 rounded-xl border border-border bg-muted/40 hover:bg-accent transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/12 text-primary">
                    <Scale size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-foreground font-medium">{t("sheet.compareTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("sheet.compareDesc")}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-muted-foreground/60 group-hover:text-foreground transition-colors" />
              </Link>
            </section>
          </div>
        </div>

        {/* Footer Fix */}
        <div className="p-6 border-t border-border shrink-0">
          <Link
            href={`/stock/${company.ticker}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
          >
            {t("sheet.viewFinancials")}
            <ExternalLink size={16} />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
