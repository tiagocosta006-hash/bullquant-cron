"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PortfolioReplica — mock fiel de: components/portfolio/PortfolioSummary.tsx
 * (stats), o gráfico real de evolução do portfólio em components/portfolio/
 * (mini área — SVG à mão, NUNCA a lib de gráficos client-side da app, mesmo
 * gradiente #10b981/tabs) e o gráfico real de alocação em components/
 * portfolio/ (barras + CHART_COLORS). Sem fetch, dados hardcoded; labels via
 * props (chaves reais de portfolio.*).
 */

const VALUE_TABS = ["1m", "6m", "1y", "max"] as const;

// mesma curva ilustrativa em ambos os sítios (coerência interna)
const AREA_POINTS = [12, 18, 15, 24, 28, 22, 34, 40, 37, 48, 44, 56];
const AREA_W = 280;
const AREA_H = 56;

function areaPath(points: number[]) {
  const max = Math.max(...points);
  const step = AREA_W / (points.length - 1);
  const y = (v: number) => AREA_H - (v / max) * (AREA_H - 8);
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${i * step} ${y(v)}`).join(" ");
  const fill = `${line} L${AREA_W} ${AREA_H} L0 ${AREA_H} Z`;
  return { line, fill };
}

// Só os 2 setores de maior peso — o cartão do bento é compacto; a lista real
// (ordenada por peso desc) mostra todos, aqui trunca-se como um "top 2".
const ALLOCATION = [
  { sector: "Information Technology", percent: 0.42 },
  { sector: "Health Care", percent: 0.24 },
];

const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)"];

export function PortfolioReplica({
  labels,
}: {
  labels: {
    marketValue: string;
    totalPnl: string;
    positions: string;
    upToday: string;
    allocationTitle: string;
    valueTabs: Record<(typeof VALUE_TABS)[number], string>;
  };
}) {
  const { line, fill } = areaPath(AREA_POINTS);

  return (
    <div className="mt-5 space-y-3">
      {/* summary — cópia fiel de PortfolioSummary.tsx.
          2 colunas SEMPRE (não sm:grid-cols-4): o `sm:` dispara com o viewport,
          mas este cartão é meia-largura de um max-w-6xl — sobravam ~105px por
          coluna e os montantes partiam ("48 219,40" com o $ na linha de baixo).
          A página real também está a 2 colunas enquanto é estreita. */}
      <div className="glass rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.marketValue}
            </p>
            <p className="nums whitespace-nowrap text-lg font-extrabold tracking-tight">48 219,40 $</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.positions}
            </p>
            <p className="nums whitespace-nowrap text-lg font-extrabold tracking-tight">12</p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.totalPnl}
            </p>
            {/* a % entre parênteses existe no PortfolioSummary real e faltava aqui */}
            <p className="nums flex items-center gap-1 whitespace-nowrap text-lg font-extrabold tracking-tight text-bull">
              <TrendingUp className="h-4 w-4 shrink-0" />
              +3 812,10 $
              <span className="text-xs font-semibold opacity-80">(+8,6%)</span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {labels.upToday}
            </p>
            <p className="nums flex items-center gap-1 whitespace-nowrap text-lg font-extrabold tracking-tight text-bull">
              <TrendingUp className="h-4 w-4 shrink-0" /> 8
            </p>
          </div>
        </div>
      </div>

      {/* gráfico + alocação lado a lado — a MESMA composição da página real
          (evolução em coluna larga, alocação ao lado), e mantém o cartão do
          bento compacto em vez de empilhar 3 blocos. */}
      <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        {/* mini área — SVG à mão, mesmo gradiente/tabs do gráfico real de evolução */}
        <div className="glass rounded-xl p-3">
          <div className="mb-2 flex items-center justify-end">
            <div className="flex w-fit rounded-lg border border-border/40 bg-muted/50 p-1">
              {VALUE_TABS.map((tab) => (
                <span
                  key={tab}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all",
                    tab === "6m" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {labels.valueTabs[tab]}
                </span>
              ))}
            </div>
          </div>
          <svg viewBox={`0 0 ${AREA_W} ${AREA_H}`} className="h-auto w-full" role="img" aria-hidden>
            <defs>
              <linearGradient id="portfolio-replica-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={fill} fill="url(#portfolio-replica-area)" />
            <path d={line} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* alocação — barras, cópia fiel do gráfico real de alocação por setor */}
        <div className="glass rounded-xl p-3">
          <h3 className="mb-2 text-[11px] font-semibold text-muted-foreground">
            {labels.allocationTitle}
          </h3>
          <div className="space-y-2">
            {ALLOCATION.map((entry, i) => (
              <div key={entry.sector}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium">{entry.sector}</span>
                  <span className="nums shrink-0 text-[11px] text-muted-foreground">
                    {Math.round(entry.percent * 100)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${entry.percent * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
