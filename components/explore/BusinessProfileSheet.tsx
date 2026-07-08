"use client"

import { useTranslations } from "next-intl"
import Image from "next/image"
import Link from "next/link"
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
      <DialogContent className="!w-[90vw] sm:!max-w-3xl lg:!max-w-4xl xl:!max-w-5xl !p-0 border-sidebar-border bg-sidebar overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="p-6 border-b border-white/10 bg-black/20">
            <div className="flex items-start justify-between mb-4">
              <div className="w-16 h-16 shrink-0 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden p-2">
                {company.logoUrl ? (
                  <Image src={company.logoUrl} alt={company.name} width={48} height={48} className="object-contain" />
                ) : (
                  <span className="text-white/40 font-bold text-xl">{company.ticker.substring(0, 2)}</span>
                )}
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-1">{company.name}</h2>
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/60">
              <span className="font-mono bg-primary/20 text-primary px-2 py-0.5 rounded font-medium">
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
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
                <Activity size={18} className="text-primary" />
                {t("sheet.businessModel")}
              </h3>
              <p className="text-white/80 leading-relaxed">
                {company.description || t("noDescription")}
              </p>
            </section>

            {/* Como ganham dinheiro */}
            {segmentsArr.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <HandCoins size={18} className="text-emerald-400" />
                  {t("sheet.revenueStreams")}
                </h3>
                <div className="space-y-3">
                  {segmentsArr.map((seg, i) => {
                    const pct = totalRev > 0 ? (seg.value / totalRev) * 100 : 0
                    return (
                      <div key={i} className="group">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-white/80 truncate pr-4">{seg.name}</span>
                          <span className="text-white font-medium">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500/80 rounded-full" 
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
                  <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2 mb-3">
                    <Users size={16} className="text-blue-400" />
                    {t("sheet.leadership")}
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold shrink-0">
                      {company.ceo.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{company.ceo}</p>
                      <p className="text-xs text-white/50">CEO</p>
                    </div>
                  </div>
                </section>
              )}
              {company.geographicFocus && (
                <section>
                  <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2 mb-3">
                    <Globe size={16} className="text-cyan-400" />
                    Mercado Principal
                  </h3>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                      <Globe size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate" title={company.geographicFocus}>{company.geographicFocus}</p>
                      <p className="text-xs text-white/50">Atuação Global</p>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Bull vs Bear Case */}
            {(company.bullCase || company.bearCase) && (
              <section className="grid sm:grid-cols-2 gap-4">
                {company.bullCase && (
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                      <TrendingUp size={48} className="text-emerald-500" />
                    </div>
                    <h3 className="text-emerald-400 font-bold flex items-center gap-2 mb-2">
                      <span>🐂</span> Tese do Touro (Bull)
                    </h3>
                    <p className="text-sm text-white/80 relative z-10 leading-relaxed">
                      {company.bullCase}
                    </p>
                  </div>
                )}
                {company.bearCase && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 transform translate-x-2 -translate-y-2 group-hover:scale-110 transition-transform">
                      <TrendingDown size={48} className="text-red-500" />
                    </div>
                    <h3 className="text-red-400 font-bold flex items-center gap-2 mb-2">
                      <span>🐻</span> Tese do Urso (Bear)
                    </h3>
                    <p className="text-sm text-white/80 relative z-10 leading-relaxed">
                      {company.bearCase}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* SWOT Matrix */}
            {company.swot && (typeof company.swot === 'object') && (
              <section>
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-purple-400" />
                  Análise SWOT
                </h3>
                <div className="grid grid-cols-2 gap-px bg-white/10 rounded-xl overflow-hidden border border-white/10">
                  <div className="bg-sidebar p-4 space-y-2">
                    <h4 className="font-bold text-emerald-400 text-sm">S - Forças</h4>
                    <ul className="text-xs text-white/70 space-y-1 list-disc pl-3">
                      {(company.swot as any).forcas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-sidebar p-4 space-y-2">
                    <h4 className="font-bold text-red-400 text-sm">W - Fraquezas</h4>
                    <ul className="text-xs text-white/70 space-y-1 list-disc pl-3">
                      {(company.swot as any).fraquezas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-sidebar p-4 space-y-2">
                    <h4 className="font-bold text-blue-400 text-sm">O - Oportunidades</h4>
                    <ul className="text-xs text-white/70 space-y-1 list-disc pl-3">
                      {(company.swot as any).oportunidades?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="bg-sidebar p-4 space-y-2">
                    <h4 className="font-bold text-orange-400 text-sm">T - Ameaças</h4>
                    <ul className="text-xs text-white/70 space-y-1 list-disc pl-3">
                      {(company.swot as any).ameacas?.map((item: string, i: number) => <li key={i}>{item}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* Extra Info */}
            {company.extraInfo && (
              <section className="p-4 rounded-xl bg-white/5 border border-white/10">
                <h3 className="text-sm font-semibold text-white/70 mb-2 flex items-center gap-2">
                  <span>💡</span> Info Relevante
                </h3>
                <p className="text-sm text-white/80 leading-relaxed">
                  {company.extraInfo}
                </p>
              </section>
            )}
            
            {/* Acções / Navegação */}
            <section className="pt-4 border-t border-white/10 space-y-3">
              <Link 
                href={`/compare?ticker=${company.ticker}`}
                className="flex items-center justify-between w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400">
                    <Scale size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium">{t("sheet.compareTitle")}</p>
                    <p className="text-xs text-white/50">{t("sheet.compareDesc")}</p>
                  </div>
                </div>
                <ArrowRight size={18} className="text-white/30 group-hover:text-white transition-colors" />
              </Link>
            </section>
          </div>
        </div>

        {/* Footer Fix */}
        <div className="p-6 border-t border-white/10 bg-black/20 shrink-0">
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
