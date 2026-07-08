"use client"

import { Building2, Cpu, HeartPulse, ShoppingBag, ShoppingCart, Zap, Landmark, Factory, Plane, Wheat, Home, BoxSelect } from "lucide-react"

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
  "Utilities": { icon: Plane, color: "text-teal-500", bg: "bg-teal-500/10" },
  "Communication Services": { icon: Building2, color: "text-purple-500", bg: "bg-purple-500/10" },
  "Unknown": { icon: Wheat, color: "text-zinc-500", bg: "bg-zinc-500/10" }
}

interface SectorGridProps {
  sectors: Record<string, { count: number; industries: Record<string, number> }>
  onSelect: (sector: string) => void
}

export function SectorGrid({ sectors, onSelect }: SectorGridProps) {
  // Ordenar por número de empresas (descendente)
  const sortedSectors = Object.entries(sectors).sort((a, b) => b[1].count - a[1].count)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {sortedSectors.map(([sectorName, data]) => {
        const config = SECTOR_CONFIG[sectorName] || SECTOR_CONFIG["Unknown"]
        const Icon = config.icon

        return (
          <button
            key={sectorName}
            onClick={() => onSelect(sectorName)}
            className="group flex flex-col items-start p-5 rounded-xl border border-white/5 bg-card hover:bg-card-hover hover:border-white/10 transition-all text-left"
          >
            <div className={`p-3 rounded-lg ${config.bg} ${config.color} mb-4 group-hover:scale-110 transition-transform`}>
              <Icon size={24} strokeWidth={1.5} />
            </div>
            <h3 className="font-semibold text-white text-lg mb-1">{sectorName === "Unknown" ? "Outros" : sectorName}</h3>
            <p className="text-sm text-white/50">{data.count} empresas</p>
          </button>
        )
      })}
    </div>
  )
}
