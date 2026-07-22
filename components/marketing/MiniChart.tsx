"use client";

import { BarChart3, Maximize2, Table2 } from "lucide-react";
import {
  W,
  PAD,
  BAR_W,
  REVENUE,
  FCF,
  OCF,
  CAPEX,
  FIRST_YEAR,
  barX,
  barPath,
  lineD,
} from "@/components/marketing/ChartScrollDraw";
import { cn } from "@/lib/utils";

/**
 * MiniChart — os 3 mini-gráficos do painel Fundamentais do TerminalMock
 * (Receita, Receita por segmento, FCF). Ao contrário do ChartScrollDraw
 * (Story 01), aqui NÃO há scrub/lente/refs: estático, pinta completo desde o
 * primeiro paint (o painel só é visto depois de trocar de tab, não faz
 * sentido reanimar em scroll).
 *
 * Reutiliza a geometria + os MESMOS dados (REVENUE/FCF/OCF/CAPEX) exportados
 * de ChartScrollDraw.tsx — coerência total de números entre a Story 01 e o
 * TerminalMock (o mesmo ano de 2025 mostra o mesmo valor nos dois sítios).
 * ChartScrollDraw.tsx não importa nenhuma lib de gráficos client-side, por
 * isso é seguro reexportar estes símbolos para este ficheiro (ver nota
 * abaixo sobre o que NUNCA se pode importar).
 *
 * ⚠️ NUNCA importar nada de components/stock/StockAnalyst.tsx (nem só a
 * constante SEGMENT_COLORS): esse ficheiro importa o cartão de gráfico real
 * da app (que por sua vez importa a lib de gráficos client-side usada em
 * produção), e mesmo um import de uma única constante arrastaria esse módulo
 * para o grafo de imports do bundle de marketing. Por isso a paleta abaixo é
 * uma CÓPIA LITERAL (não um import) dos 3 primeiros valores de SEGMENT_COLORS
 * em components/stock/StockAnalyst.tsx:74-83 — mesmo padrão que o próprio
 * StockAnalyst.tsx já usa para copiar do motor de gráficos financeiros real.
 */

// Cópia literal (não import) de components/stock/StockAnalyst.tsx:74-83 —
// só os 3 primeiros, chega para os 3 segmentos sintéticos abaixo.
const SEGMENT_COLORS = ["#2a78d6", "#1baf7a", "#eda100"];

// Dataset sintético só para o variant "stacked" (não existe em
// ChartScrollDraw). Os 3 segmentos somam ≈ REVENUE de cada ano — mantém
// coerência interna com a Story 01 (nunca um número "diferente" à vista).
const SEG_A = REVENUE.map((v) => Math.round(v * 0.52));
const SEG_B = REVENUE.map((v) => Math.round(v * 0.31));
const SEG_C = REVENUE.map((v, i) => v - SEG_A[i] - SEG_B[i]);
const SEGMENTS = [SEG_A, SEG_B, SEG_C];

// Geometria de painel único (cartão individual, não os 2 painéis fundidos do
// ChartScrollDraw): uma só baseline. O viewBox é quase QUADRADO (560×420, ~0.75)
// para o cartão inteiro — chrome + gráfico + padding — ler como um quadrado, e
// não como a faixa achatada de antes. O SVG escala sozinho (viewBox fixo +
// w-full h-auto), por isso isto define a proporção, não pixels.
const TOP = 16;
const BASE = 384;
const MINI_H = 420;
const GRID_FRACS = [0.25, 0.5, 0.75];

/** header decorativo de cartão — cópia fiel do chrome real do cartão de
 *  gráfico da app (duplicado de ChartScrollDraw.tsx, não exportado de lá de
 *  propósito: uma função de ~30 linhas não justifica alargar a superfície de
 *  export do ChartScrollDraw). `cagr` é opcional: o card real de "Receita por
 *  segmento" no motor de gráficos financeiros nunca passa `cagr=` ao cartão
 *  (STACKED_BAR sem essa prop) — replicamos esse comportamento omitindo a
 *  linha de CAGR quando `cagr` não é passado (ver o componente real do
 *  cartão de gráfico em components/stock/, linhas ~392-396). */
export function ChartCardChrome({
  title,
  cagrLabel,
  cagr,
}: {
  title: string;
  cagrLabel?: string;
  cagr?: string;
}) {
  // Layout compacto: os 3 cartões vivem lado a lado (1/3 da largura do mock),
  // onde o título+CAGR+ícones em linha (como no cartão real, que é largo) não
  // caberiam. Título e CAGR empilham; o cluster de ícones — a assinatura
  // visual do cartão real — mantém-se, mais pequeno e só a partir de sm.
  return (
    <div className="mb-1 flex items-start justify-between gap-2 px-1 pt-1">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold leading-tight text-foreground">{title}</div>
        {cagr != null && (
          <div className="nums text-[11px] font-semibold text-muted-foreground">
            {cagrLabel}: <span className="text-bull">{cagr}</span>
          </div>
        )}
      </div>
      <div className="hidden shrink-0 gap-0.5 rounded-md border border-border/40 bg-muted/50 p-0.5 sm:flex">
        <span className="rounded bg-background p-0.5 text-foreground shadow-sm">
          <BarChart3 className="h-3 w-3" />
        </span>
        <span className="rounded p-0.5 text-muted-foreground">
          <Table2 className="h-3 w-3" />
        </span>
        <span className="rounded p-0.5 text-muted-foreground">
          <Maximize2 className="h-3 w-3" />
        </span>
      </div>
    </div>
  );
}

export type MiniChartVariant = "bars" | "stacked" | "composed";

export function MiniChart({
  variant,
  ariaLabel,
  className,
}: {
  variant: MiniChartVariant;
  ariaLabel: string;
  className?: string;
}) {
  if (variant === "stacked") {
    // topo de cada pilha (para a grelha recessiva ficar à escala certa)
    const totals = REVENUE;
    const scale = (BASE - TOP) / Math.max(...totals);
    const yStack = (v: number) => BASE - v * scale;

    return (
      <svg
        viewBox={`0 0 ${W} ${MINI_H}`}
        role="img"
        aria-label={ariaLabel}
        className={cn("h-auto w-full", className)}
      >
        {GRID_FRACS.map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={yStack(f * Math.max(...totals))}
            y2={yStack(f * Math.max(...totals))}
            stroke="var(--border)"
            strokeDasharray="6 14"
            strokeWidth="2"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" strokeWidth="2" />

        {REVENUE.map((_, i) => {
          // pilha empilhada SEM topo arredondado (retângulos planos) — a
          // stacked bar real (type="STACKED_BAR" no cartão de gráfico da app) não arredonda
          // segmentos internos, só a barra composta como um todo.
          let cursor = BASE;
          return SEGMENTS.map((seg, si) => {
            const h = seg[i] * scale;
            const y = cursor - h;
            cursor = y;
            return (
              <rect
                key={`seg-${si}-${i}`}
                x={barX(i)}
                y={y}
                width={BAR_W}
                height={Math.max(0, h)}
                fill={SEGMENT_COLORS[si % SEGMENT_COLORS.length]}
                opacity="0.9"
              />
            );
          });
        })}

        <text x={barX(0)} y={MINI_H - 8} fontSize="30" className="nums" fill="var(--foreground)" fillOpacity="0.6">
          {FIRST_YEAR}
        </text>
        <text
          x={barX(REVENUE.length - 1) + BAR_W}
          y={MINI_H - 8}
          textAnchor="end"
          fontSize="30"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.6"
        >
          {FIRST_YEAR + REVENUE.length - 1}
        </text>
      </svg>
    );
  }

  if (variant === "composed") {
    const scale = (BASE - TOP) / Math.max(...OCF);
    const yFn = (v: number) => BASE - v * scale;
    const ocfD = lineD(OCF, yFn);
    const capexD = lineD(CAPEX, yFn);

    return (
      <svg
        viewBox={`0 0 ${W} ${MINI_H}`}
        role="img"
        aria-label={ariaLabel}
        className={cn("h-auto w-full", className)}
      >
        {GRID_FRACS.map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={yFn(f * Math.max(...OCF))}
            y2={yFn(f * Math.max(...OCF))}
            stroke="var(--border)"
            strokeDasharray="6 14"
            strokeWidth="2"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" strokeWidth="2" />

        {FCF.map((v, i) => (
          <path key={i} d={barPath(i, v, BASE, yFn)} fill="var(--chart-1)" opacity="0.9" />
        ))}
        <path d={capexD} fill="none" stroke="var(--chart-4)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
        <path d={ocfD} fill="none" stroke="var(--chart-5)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />

        <text x={barX(0)} y={MINI_H - 8} fontSize="30" className="nums" fill="var(--foreground)" fillOpacity="0.6">
          {FIRST_YEAR}
        </text>
        <text
          x={barX(FCF.length - 1) + BAR_W}
          y={MINI_H - 8}
          textAnchor="end"
          fontSize="30"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.6"
        >
          {FIRST_YEAR + FCF.length - 1}
        </text>
      </svg>
    );
  }

  // variant === "bars" (Receita)
  const scale = (BASE - TOP) / Math.max(...REVENUE);
  const yFn = (v: number) => BASE - v * scale;

  return (
    <svg
      viewBox={`0 0 ${W} ${MINI_H}`}
      role="img"
      aria-label={ariaLabel}
      className={cn("h-auto w-full", className)}
    >
      {GRID_FRACS.map((f) => (
        <line
          key={f}
          x1={PAD}
          x2={W - PAD}
          y1={yFn(f * Math.max(...REVENUE))}
          y2={yFn(f * Math.max(...REVENUE))}
          stroke="var(--border)"
          strokeDasharray="6 14"
          strokeWidth="2"
        />
      ))}
      <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" strokeWidth="2" />

      {REVENUE.map((v, i) => (
        <path key={i} d={barPath(i, v, BASE, yFn)} fill="var(--chart-1)" opacity="0.9" />
      ))}

      <text x={barX(0)} y={MINI_H - 8} fontSize="30" className="nums" fill="var(--foreground)" fillOpacity="0.6">
        {FIRST_YEAR}
      </text>
      <text
        x={barX(REVENUE.length - 1) + BAR_W}
        y={MINI_H - 8}
        textAnchor="end"
        fontSize="30"
        className="nums"
        fill="var(--foreground)"
        fillOpacity="0.6"
      >
        {FIRST_YEAR + REVENUE.length - 1}
      </text>
    </svg>
  );
}
