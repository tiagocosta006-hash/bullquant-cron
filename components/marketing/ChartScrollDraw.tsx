"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ChartScrollDraw — o gráfico da Story 1 desenha-se com o scroll (scrub):
 * barras de receita crescem da baseline com stagger, a linha de FCF
 * traça-se (dashoffset) e o marcador final + labels diretos aparecem.
 * Specs dataviz: barras finas com topo arredondado 4px ancorado na
 * baseline, linha 2px com marcador ≥8px, grelha recessiva, texto sempre
 * em tokens de tinta (identidade das séries: forma + label, não só cor).
 * Sem motion, o gráfico está completo desde o primeiro paint.
 */
const REVENUE = [38, 42, 47, 52, 60, 66, 71, 78, 86, 95]; // B$, 2016–2025
const FCF = [11, 13, 15, 18, 22, 25, 28, 32, 37, 42];
const FIRST_YEAR = 2016;

const W = 560;
const H = 300;
const BASE = 264;
const TOP = 20;
const PAD = 8;
const STEP = (W - PAD * 2) / REVENUE.length;
const BAR_W = 30;
const SCALE = (BASE - TOP) / Math.max(...REVENUE);

const barX = (i: number) => PAD + i * STEP + (STEP - BAR_W) / 2;
const cx = (i: number) => PAD + i * STEP + STEP / 2;
const yOf = (v: number) => BASE - v * SCALE;

/** barra com topo arredondado (4px) e base reta na baseline */
function barPath(i: number, v: number) {
  const x = barX(i);
  const top = yOf(v);
  const r = 4;
  return [
    `M${x} ${BASE}`,
    `V${top + r}`,
    `Q${x} ${top} ${x + r} ${top}`,
    `H${x + BAR_W - r}`,
    `Q${x + BAR_W} ${top} ${x + BAR_W} ${top + r}`,
    `V${BASE}`,
    "Z",
  ].join(" ");
}

const LINE_D = FCF.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i)} ${yOf(v)}`).join(" ");
const GRID_VALUES = [25, 50, 75];

export function ChartScrollDraw({
  ariaLabel,
  legendRevenue,
  legendFcf,
  className,
}: {
  ariaLabel: string;
  legendRevenue: string;
  legendFcf: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = rootRef.current;
        const line = lineRef.current;
        if (!root || !line) return;
        const len = line.getTotalLength();

        gsap.fromTo(
          root.querySelectorAll("[data-bar]"),
          { scaleY: 0, transformOrigin: "50% 100%" },
          {
            scaleY: 1,
            stagger: 0.08,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 88%", end: "top 34%", scrub: 0.5 },
          },
        );
        gsap.fromTo(
          line,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 72%", end: "top 26%", scrub: 0.5 },
          },
        );
        gsap.fromTo(
          root.querySelectorAll("[data-pop]"),
          { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" },
          {
            opacity: 1,
            scale: 1,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 40%", end: "top 24%", scrub: 0.5 },
          },
        );
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        {/* grelha recessiva */}
        {GRID_VALUES.map((v) => (
          <line
            key={v}
            x1={PAD}
            x2={W - PAD}
            y1={yOf(v)}
            y2={yOf(v)}
            stroke="var(--border)"
            strokeDasharray="2 6"
            strokeWidth="1"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={BASE} y2={BASE} stroke="var(--border)" strokeWidth="1" />

        {/* série 1 — receita (barras douradas) */}
        {REVENUE.map((v, i) => (
          <path key={i} data-bar d={barPath(i, v)} fill="var(--chart-1)" opacity="0.9">
            <title>{`${FIRST_YEAR + i} · $${v}B`}</title>
          </path>
        ))}

        {/* série 2 — FCF (linha de tinta, 2px, marcador de fim ≥8px) */}
        <path
          ref={lineRef}
          d={LINE_D}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          data-pop
          cx={cx(FCF.length - 1)}
          cy={yOf(FCF[FCF.length - 1])}
          r="4.5"
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth="2"
        />

        {/* labels diretos (tokens de tinta, nunca a cor da série) */}
        <text
          data-pop
          x={cx(FCF.length - 1) - 8}
          y={yOf(FCF[FCF.length - 1]) - 12}
          textAnchor="end"
          className="nums"
          fontSize="12"
          fontWeight="600"
          fill="var(--muted-foreground)"
        >
          {`${legendFcf} · $${FCF[FCF.length - 1]}B`}
        </text>
        <text
          data-pop
          x={barX(REVENUE.length - 1) + BAR_W / 2}
          y={yOf(REVENUE[REVENUE.length - 1]) - 10}
          textAnchor="middle"
          className="nums"
          fontSize="12"
          fontWeight="600"
          fill="var(--muted-foreground)"
        >
          {`$${REVENUE[REVENUE.length - 1]}B`}
        </text>

        {/* eixo temporal: primeiro/último ano */}
        <text x={barX(0)} y={H - 14} fontSize="11" className="nums" fill="var(--muted-foreground)">
          {FIRST_YEAR}
        </text>
        <text
          x={barX(REVENUE.length - 1) + BAR_W}
          y={H - 14}
          textAnchor="end"
          fontSize="11"
          className="nums"
          fill="var(--muted-foreground)"
        >
          {FIRST_YEAR + REVENUE.length - 1}
        </text>
      </svg>

      {/* legenda — sempre presente com 2 séries */}
      <div className="mt-3 flex items-center gap-5 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
          {legendRevenue}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-foreground" aria-hidden />
          {legendFcf}
        </span>
      </div>
    </div>
  );
}
