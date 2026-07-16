"use client"

import { useTranslations } from "next-intl"
import { Building2, Cpu, HeartPulse, ShoppingBag, ShoppingCart, Zap, Landmark, Factory, UtilityPole, Wheat, Home, BoxSelect } from "lucide-react"

// Mapeamento simples de setores para ícones e cores
const SECTOR_CONFIG: Record<string, { icon: React.ElementType, color: string, bg: string }> = {
  "Information Technology": { icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
  "Health Care": { icon: HeartPulse, color: "text-red-500", bg: "bg-red-500/10" },
  "Consumer Discretionary": { icon: ShoppingBag, color: "text-orange-500", bg: "bg-orange-500/10" },
  "Consumer Staples": { icon: ShoppingCart, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "Energy": { icon: Zap, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  "Financials": { icon: Landmark, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  "Industrials": { icon: Factory, color: "text-slate-400", bg: "bg-slate-400/10" },
  "Materials": { icon: BoxSelect, color: "text-amber-600", bg: "bg-amber-600/10" },
  "Real Estate": { icon: Home, color: "text-cyan-500", bg: "bg-cyan-500/10" },
  "Utilities": { icon: UtilityPole, color: "text-teal-500", bg: "bg-teal-500/10" },
  "Communication Services": { icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
  "Unknown": { icon: Wheat, color: "text-zinc-500", bg: "bg-zinc-500/10" }
}

interface SectorGridProps {
  sectors: Record<string, { count: number; industries: Record<string, number> }>
  onSelect: (sector: string) => void
}

export function SectorGrid({ sectors, onSelect }: SectorGridProps) {
  const t = useTranslations("explore")

  // Ordenar por número de empresas (descendente)
  const sortedSectors = Object.entries(sectors).sort((a, b) => b[1].count - a[1].count)

  // Grelha de cards IGUAIS: com os 11 setores GICS + "Outros" são 12 cards,
  // que dividem certo em 2, 3 e 4 colunas (sem buracos nem cards gigantes).
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {sortedSectors.map(([sectorName, data]) => {
        const config = SECTOR_CONFIG[sectorName] || SECTOR_CONFIG["Unknown"]
        const Icon = config.icon

        return (
          <button
            key={sectorName}
            onClick={() => onSelect(sectorName)}
            className="glass group flex flex-col items-start p-5 rounded-xl text-left transition-transform hover:-translate-y-0.5"
          >
            <div className={`p-3 rounded-lg ${config.bg} ${config.color} mb-4 group-hover:scale-110 transition-transform`}>
              <Icon size={24} strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-foreground text-lg mb-1">{sectorName === "Unknown" ? t("other") : sectorName}</h3>
            <p className="text-sm text-muted-foreground">{t("companiesCount", { count: data.count })}</p>
          </button>
        )
      })}
    </div>
  )
}
