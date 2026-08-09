"use client";

import { Cpu, Factory, HeartPulse, Landmark } from "lucide-react";

/**
 * ExploreReplica — mock fiel de components/explore/SectorGrid.tsx: heading +
 * grelha de cards de setor (ícone + nome + contagem). Sem fetch, hardcoded.
 *
 * A paleta ícone/cor é uma CÓPIA LITERAL (não import) de 4 entradas de
 * SECTOR_CONFIG em components/explore/SectorGrid.tsx:7-20 — o mesmo padrão
 * de duplicação usado em MiniChart.tsx para SEGMENT_COLORS, para nunca
 * acoplar o bundle de marketing a um ficheiro fora do seu escopo.
 */
const SECTORS = [
  { name: "Information Technology", icon: Cpu, color: "text-blue-500", bg: "bg-blue-500/10" },
  { name: "Health Care", icon: HeartPulse, color: "text-red-500", bg: "bg-red-500/10" },
  { name: "Financials", icon: Landmark, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  { name: "Industrials", icon: Factory, color: "text-slate-400", bg: "bg-slate-400/10" },
] as const;

export function ExploreReplica({
  heading,
  companiesLabels,
}: {
  /** explore.sectorsTitle */
  heading: string;
  /**
   * explore.companiesCount já resolvido (plural i18n) para cada setor, na
   * MESMA ordem de SECTORS acima — resolvido no servidor (page.tsx) porque
   * um Server Component nunca pode passar uma função como prop a um Client
   * Component (a ponte RSC só serializa dados, não funções/closures).
   */
  companiesLabels: string[];
}) {
  return (
    <div data-replica className="mt-5 space-y-3">
      <h3 className="text-xl font-semibold text-foreground/90">{heading}</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SECTORS.map(({ name, icon: Icon, color, bg }, i) => (
          <div
            key={name}
            /* duration-200 fixo de propósito: isto é uma RÉPLICA do terminal
               dentro da landing e tem de continuar a ler como o produto, não
               herdar os 450ms do .motion-lush (igual ao DashboardReplica). */
            className="glass group flex flex-col items-start rounded-xl p-4 text-left transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className={`mb-3 rounded-lg p-2.5 ${bg} ${color} transition-transform group-hover:scale-110`}>
              <Icon size={20} strokeWidth={1.5} />
            </div>
            <h4 className="text-sm font-semibold text-foreground">{name}</h4>
            <p className="text-xs text-muted-foreground">{companiesLabels[i]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
