"use client";

import { useCallback, useEffect, useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * ChartScrollDraw — a Story 1 mostra os DOIS gráficos reais que o produto
 * tem em /stock/[ticker] (Fundamentais): Receita (barras) e FCF (barra +
 * linhas OCF/CapEx) — os mesmos dataKeys/cores de FinancialsEngine.tsx.
 * Antes eram desenhados como um único gráfico combinado (barras de receita
 * + linha de FCF) que não existe em lado nenhum do produto; agora são dois
 * painéis empilhados e fiéis, ligados por um único cursor/tooltip partilhado.
 * Com o scroll (scrub), as barras crescem da baseline com stagger, as linhas
 * de OCF/CapEx traçam-se (dashoffset) e os labels finais aparecem. Sem
 * motion, o gráfico está completo desde o primeiro paint.
 */
const REVENUE = [38, 42, 47, 52, 60, 66, 71, 78, 86, 95]; // B$, 2016–2025
const FCF = [11, 13, 15, 18, 22, 25, 28, 32, 37, 42];
const CAPEX = [3, 4, 4, 5, 6, 7, 8, 9, 10, 12];
const OCF = FCF.map((v, i) => v + CAPEX[i]); // FCF = OCF − CapEx (mesma fórmula do produto)
const FIRST_YEAR = 2016;

const W = 560;
const H = 460;
const PAD = 8;
const STEP = (W - PAD * 2) / REVENUE.length;
const BAR_W = 30;

// Painel A — Receita (só barras, igual a FinancialsEngine `charts.revenue`)
const A_TOP = 24;
const A_BASE = 168;
const A_SCALE = (A_BASE - A_TOP) / Math.max(...REVENUE);

// Painel B — FCF composto (barra FCF + linha OCF + linha CapEx), igual a
// FinancialsEngine `charts.freeCashFlow` (type COMPOSED); escala partilhada
// pelo maior valor (OCF) para as três séries ficarem no mesmo eixo.
const B_TOP = 218;
const B_BASE = 396;
const B_SCALE = (B_BASE - B_TOP) / Math.max(...OCF);

const barX = (i: number) => PAD + i * STEP + (STEP - BAR_W) / 2;
const cx = (i: number) => PAD + i * STEP + STEP / 2;
const yA = (v: number) => A_BASE - v * A_SCALE;
const yB = (v: number) => B_BASE - v * B_SCALE;

/** barra com topo arredondado (4px) e base reta na baseline do painel */
function barPath(i: number, v: number, base: number, yFn: (v: number) => number) {
  const x = barX(i);
  const top = yFn(v);
  const r = 4;
  return [
    `M${x} ${base}`,
    `V${top + r}`,
    `Q${x} ${top} ${x + r} ${top}`,
    `H${x + BAR_W - r}`,
    `Q${x + BAR_W} ${top} ${x + BAR_W} ${top + r}`,
    `V${base}`,
    "Z",
  ].join(" ");
}

const lineD = (arr: number[], yFn: (v: number) => number) =>
  arr.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i)} ${yFn(v)}`).join(" ");

const OCF_LINE_D = lineD(OCF, yB);
const CAPEX_LINE_D = lineD(CAPEX, yB);
const GRID_FRACS = [0.25, 0.5, 0.75];

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
  const ocfLineRef = useRef<SVGPathElement>(null);
  const capexLineRef = useRef<SVGPathElement>(null);

  // ── lente de análise: feixe + dot com cauda de cometa + tooltip glass
  //    + realce magnético das barras; tudo com lag suave (quickTo),
  //    independente dos scrubs de scroll (que só tocam scaleY/dash).
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorRef = useRef<SVGGElement>(null);
  const cursorDotRef = useRef<SVGCircleElement>(null);
  const trailARef = useRef<SVGCircleElement>(null);
  const trailBRef = useRef<SVGCircleElement>(null);
  const tooltipRef = useRef<SVGGElement>(null);
  const ttYearRef = useRef<SVGTextElement>(null);
  const ttRevRef = useRef<SVGTextElement>(null);
  const ttFcfRef = useRef<SVGTextElement>(null);
  const fadeToRef = useRef<((v: number) => void) | null>(null);
  const trailToRef = useRef<Array<{ x: (v: number) => void; y: (v: number) => void }>>([]);
  const hoverRef = useRef(false);
  const proxyRef = useRef({ p: REVENUE.length - 1 });
  const pToRef = useRef<((v: number) => void) | null>(null);
  const barsRef = useRef<SVGPathElement[]>([]);

  /**
   * paint(p) — desenha a lente inteira a partir de uma posição CONTÍNUA
   * (0..9 float). O dot desliza sobre a linha de OCF (painel B) — é este
   * contínuo que dá o feel Revolut/Apple: os números do tooltip fluem, e
   * o realce das barras (ambos os painéis, mesmo índice partilhado) é uma
   * onda gaussiana sem degraus.
   */
  const paint = useCallback((p: number) => {
    const group = cursorRef.current;
    const svg = svgRef.current;
    if (!group || !svg) return;
    const c = Math.min(REVENUE.length - 1, Math.max(0, p));
    const i0 = Math.floor(c);
    const i1 = Math.min(REVENUE.length - 1, i0 + 1);
    const f = c - i0;
    const lerp = (a: number, b: number) => a + (b - a) * f;
    const x = PAD + STEP / 2 + c * STEP;
    const y = yB(lerp(OCF[i0], OCF[i1]));
    const nearest = Math.round(c);

    gsap.set(group, { x });
    cursorDotRef.current?.setAttribute("cy", y.toFixed(1));

    // números interpolados — fluem enquanto arrastas
    const rev = lerp(REVENUE[i0], REVENUE[i1]);
    const fcf = lerp(FCF[i0], FCF[i1]);
    const yoy =
      nearest > 0
        ? `+${Math.round(((REVENUE[nearest] - REVENUE[nearest - 1]) / REVENUE[nearest - 1]) * 100)}%`
        : "—";
    if (ttYearRef.current) ttYearRef.current.textContent = String(FIRST_YEAR + nearest);
    if (ttRevRef.current) ttRevRef.current.textContent = `$${Math.round(rev)}B · ${yoy}`;
    if (ttFcfRef.current) ttFcfRef.current.textContent = `$${Math.round(fcf)}B`;
    if (tooltipRef.current) {
      const flip = nearest >= REVENUE.length - 3;
      tooltipRef.current.setAttribute("transform", `translate(${flip ? -158 : 14} 0)`);
    }

    // onda gaussiana de luz nas barras (painel A e B, mesmo índice — só opacity)
    if (!barsRef.current.length) {
      barsRef.current = Array.from(svg.querySelectorAll<SVGPathElement>("[data-bar]"));
    }
    barsRef.current.forEach((bar, i) => {
      const idx = Number(bar.dataset.idx ?? i);
      const d = idx - c;
      bar.style.opacity = (0.42 + 0.58 * Math.exp(-(d * d) / 1.8)).toFixed(3);
      bar.style.filter = Math.abs(d) < 0.5 ? "brightness(1.08)" : "";
    });

    // cauda de cometa: ghosts perseguem a posição suavizada
    trailToRef.current.forEach((to, k) => {
      to.x(x);
      to.y(y);
      gsap.to(k === 0 ? trailARef.current : trailBRef.current, {
        opacity: [0.35, 0.15][k],
        duration: 0.2,
      });
    });
  }, []);

  /** alvo contínuo com suavização (quickTo sobre o proxy → paint) */
  const showP = useCallback(
    (p: number) => {
      const group = cursorRef.current;
      if (!group) return;
      if (prefersReducedMotion()) {
        paint(p);
        group.style.opacity = "1";
        return;
      }
      if (!pToRef.current) {
        // primeiro movimento: aterra sem deslizar desde a posição antiga
        proxyRef.current.p = p;
        paint(p);
        const proxy = proxyRef.current;
        pToRef.current = gsap.quickTo(proxy, "p", {
          duration: 0.5,
          ease: "power3.out",
          onUpdate: () => paint(proxy.p),
        });
        fadeToRef.current = gsap.quickTo(group, "opacity", { duration: 0.25, ease: "power2.out" });
        for (const el of [trailARef.current, trailBRef.current]) {
          if (el) gsap.set(el, { x: PAD + STEP / 2 + p * STEP, y: yB(OCF[Math.round(p)]) });
        }
        trailToRef.current = [trailARef.current, trailBRef.current].flatMap((el, k) =>
          el
            ? [
                {
                  x: gsap.quickTo(el, "x", { duration: 0.7 + k * 0.2, ease: "power3.out" }),
                  y: gsap.quickTo(el, "y", { duration: 0.7 + k * 0.2, ease: "power3.out" }),
                },
              ]
            : [],
        );
      }
      pToRef.current(p);
      fadeToRef.current?.(1);
    },
    [paint],
  );

  const moveCursor = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      // posição CONTÍNUA — nada de snap a índices
      const p = Math.min(REVENUE.length - 1, Math.max(0, (px - PAD - STEP / 2) / STEP));
      hoverRef.current = true;
      showP(p);
    },
    [showP],
  );

  const hideLens = useCallback(() => {
    const group = cursorRef.current;
    if (!group) return;
    if (prefersReducedMotion() || !fadeToRef.current) group.style.opacity = "0";
    else fadeToRef.current(0);
    for (const el of [trailARef.current, trailBRef.current]) {
      if (el) gsap.to(el, { opacity: 0, duration: 0.2 });
    }
    // devolver as barras ao estado de repouso
    svgRef.current?.querySelectorAll<SVGPathElement>("[data-bar]").forEach((bar) => {
      gsap.to(bar, { opacity: 0.9, duration: 0.35, ease: "power2.out", overwrite: "auto" });
      bar.style.filter = "";
    });
  }, []);

  const leaveCursor = useCallback(() => {
    hoverRef.current = false;
    hideLens();
  }, [hideLens]);

  // Attract mode: sem ponteiro em cima, um cursor-fantasma passeia pelos
  // 10 anos a cada ~9s — a interatividade a vender-se sozinha (e a única
  // forma de mobile ver esta camada). O hover real ganha sempre.
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const svg = svgRef.current;
    if (!svg) return;
    const state = { i: 0 };
    let tl: gsap.core.Timeline | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        tl?.kill();
        if (!e.isIntersecting) {
          hideLens();
          return;
        }
        tl = gsap
          .timeline({ repeat: -1, repeatDelay: 5.5, delay: 1.5 })
          .set(state, { i: 0 })
          .call(() => {
            if (!hoverRef.current) showP(0);
          })
          .to(state, {
            i: REVENUE.length - 1,
            duration: 3.4,
            ease: "power1.inOut",
            onUpdate: () => {
              if (!hoverRef.current) showP(state.i);
            },
          })
          .to({}, { duration: 0.8 })
          .call(() => {
            if (!hoverRef.current) hideLens();
          });
      },
      { threshold: 0.6 },
    );
    io.observe(svg);
    return () => {
      io.disconnect();
      tl?.kill();
    };
  }, [showP, hideLens]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const root = rootRef.current;
        const ocfLine = ocfLineRef.current;
        const capexLine = capexLineRef.current;
        if (!root || !ocfLine || !capexLine) return;
        const ocfLen = ocfLine.getTotalLength();
        const capexLen = capexLine.getTotalLength();

        gsap.fromTo(
          root.querySelectorAll("[data-bar]"),
          { scaleY: 0, transformOrigin: "50% 100%" },
          {
            scaleY: 1,
            stagger: 0.05,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 88%", end: "top 34%", scrub: 0.5 },
          },
        );
        gsap.fromTo(
          ocfLine,
          { strokeDasharray: ocfLen, strokeDashoffset: ocfLen },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 72%", end: "top 26%", scrub: 0.5 },
          },
        );
        gsap.fromTo(
          capexLine,
          { strokeDasharray: capexLen, strokeDashoffset: capexLen },
          {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: root, start: "top 68%", end: "top 22%", scrub: 0.5 },
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
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
        onPointerMove={moveCursor}
        onPointerLeave={leaveCursor}
      >
        {/* legenda de painel — igual ao título de cada card real */}
        <text x={PAD} y={A_TOP - 9} fontSize="11.5" fontWeight="600" className="nums" fill="var(--muted-foreground)">
          {legendRevenue}
        </text>
        <text x={PAD} y={B_TOP - 9} fontSize="11.5" fontWeight="600" className="nums" fill="var(--muted-foreground)">
          {legendFcf}
        </text>

        {/* grelha recessiva — painel A (Receita) */}
        {GRID_FRACS.map((f) => (
          <line
            key={`a-${f}`}
            x1={PAD}
            x2={W - PAD}
            y1={yA(f * Math.max(...REVENUE))}
            y2={yA(f * Math.max(...REVENUE))}
            stroke="var(--border)"
            strokeDasharray="2 6"
            strokeWidth="1"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={A_BASE} y2={A_BASE} stroke="var(--border)" strokeWidth="1" />

        {/* painel A — Receita (só barras, igual ao gráfico real) */}
        {REVENUE.map((v, i) => (
          <path
            key={`rev-${i}`}
            data-bar
            data-idx={i}
            d={barPath(i, v, A_BASE, yA)}
            fill="var(--chart-1)"
            opacity="0.9"
          >
            <title>{`${FIRST_YEAR + i} · $${v}B`}</title>
          </path>
        ))}

        {/* grelha recessiva — painel B (FCF composto) */}
        {GRID_FRACS.map((f) => (
          <line
            key={`b-${f}`}
            x1={PAD}
            x2={W - PAD}
            y1={yB(f * Math.max(...OCF))}
            y2={yB(f * Math.max(...OCF))}
            stroke="var(--border)"
            strokeDasharray="2 6"
            strokeWidth="1"
          />
        ))}
        <line x1={PAD} x2={W - PAD} y1={B_BASE} y2={B_BASE} stroke="var(--border)" strokeWidth="1" />

        {/* painel B — FCF (barra) + OCF (linha) + CapEx (linha), specs reais */}
        {FCF.map((v, i) => (
          <path
            key={`fcf-${i}`}
            data-bar
            data-idx={i}
            d={barPath(i, v, B_BASE, yB)}
            fill="var(--chart-1)"
            opacity="0.9"
          >
            <title>{`${FIRST_YEAR + i} · FCF $${v}B`}</title>
          </path>
        ))}
        <path
          ref={capexLineRef}
          d={CAPEX_LINE_D}
          fill="none"
          stroke="var(--chart-4)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
        <path
          ref={ocfLineRef}
          d={OCF_LINE_D}
          fill="none"
          stroke="var(--chart-5)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          data-pop
          cx={cx(OCF.length - 1)}
          cy={yB(OCF[OCF.length - 1])}
          r="4.5"
          fill="var(--chart-5)"
          stroke="var(--background)"
          strokeWidth="2"
        />

        {/* labels diretos (tinta plena — cinzento não se lê em dark) */}
        <text
          data-pop
          x={cx(OCF.length - 1) - 10}
          y={yB(OCF[OCF.length - 1]) - 14}
          textAnchor="end"
          className="nums"
          fontSize="12"
          fontWeight="600"
          fill="var(--chart-5)"
        >
          {`OCF · $${OCF[OCF.length - 1]}B`}
        </text>
        <text
          data-pop
          x={barX(FCF.length - 1) + BAR_W / 2}
          y={yB(FCF[FCF.length - 1]) - 10}
          textAnchor="middle"
          className="nums"
          fontSize="13"
          fontWeight="600"
          fill="var(--foreground)"
        >
          {`${legendFcf} · $${FCF[FCF.length - 1]}B`}
        </text>
        <text
          data-pop
          x={barX(REVENUE.length - 1) + BAR_W / 2}
          y={yA(REVENUE[REVENUE.length - 1]) - 10}
          textAnchor="middle"
          className="nums"
          fontSize="13"
          fontWeight="600"
          fill="var(--foreground)"
        >
          {`$${REVENUE[REVENUE.length - 1]}B`}
        </text>

        {/* lente de análise — segue o cursor (ver showP), atravessa os 2 painéis */}
        <defs>
          <linearGradient id="csd-beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--primary)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
          {/* fade vertical do feixe — sem fim abrupto em cima/baixo */}
          <linearGradient id="csd-beam-v" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.12" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.9" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="csd-beam-mask">
            <rect x={-14} y={A_TOP - 4} width={28} height={B_BASE - A_TOP + 4} fill="url(#csd-beam-v)" />
          </mask>
        </defs>
        {/* cauda de cometa (fora do grupo — lags próprios por transform) */}
        <circle ref={trailBRef} cx={0} cy={0} r="3" fill="var(--primary)" opacity="0" pointerEvents="none" />
        <circle ref={trailARef} cx={0} cy={0} r="3.6" fill="var(--primary)" opacity="0" pointerEvents="none" />
        <g ref={cursorRef} aria-hidden="true" style={{ opacity: 0 }} pointerEvents="none">
          {/* feixe vertical suave, atravessa Receita + FCF */}
          <rect
            x={-14}
            y={A_TOP - 4}
            width={28}
            height={B_BASE - A_TOP + 4}
            fill="url(#csd-beam)"
            mask="url(#csd-beam-mask)"
          />
          <circle
            ref={cursorDotRef}
            cx={0}
            cy={yB(OCF[OCF.length - 1])}
            r="5"
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth="2"
            style={{
              filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--primary) 60%, transparent))",
            }}
          />
          {/* tooltip glass (rect + textos SVG; flip de lado nas bordas) */}
          <g ref={tooltipRef} transform="translate(14 0)">
            <rect
              x={0}
              y={A_TOP - 6}
              width={144}
              height={62}
              rx={10}
              style={{ fill: "color-mix(in srgb, var(--card) 88%, transparent)" }}
              stroke="var(--border)"
            />
            <text
              ref={ttYearRef}
              x={12}
              y={A_TOP + 12}
              className="nums"
              fontSize="12"
              fontWeight="700"
              fill="var(--foreground)"
            >
              {FIRST_YEAR + REVENUE.length - 1}
            </text>
            <circle cx={16} cy={A_TOP + 26} r={3.5} fill="var(--chart-1)" />
            <text
              ref={ttRevRef}
              x={26}
              y={A_TOP + 30}
              className="nums"
              fontSize="11.5"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {`$${REVENUE[REVENUE.length - 1]}B · +10%`}
            </text>
            <rect x={12.5} y={A_TOP + 39.5} width={8} height={2.5} rx={1.25} fill="var(--chart-1)" />
            <text
              ref={ttFcfRef}
              x={26}
              y={A_TOP + 45}
              className="nums"
              fontSize="11.5"
              fontWeight="600"
              fill="var(--foreground)"
            >
              {`$${FCF[FCF.length - 1]}B`}
            </text>
          </g>
        </g>

        {/* eixo temporal: primeiro/último ano */}
        <text
          x={barX(0)}
          y={H - 14}
          fontSize="12"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.7"
        >
          {FIRST_YEAR}
        </text>
        <text
          x={barX(REVENUE.length - 1) + BAR_W}
          y={H - 14}
          textAnchor="end"
          fontSize="12"
          className="nums"
          fill="var(--foreground)"
          fillOpacity="0.7"
        >
          {FIRST_YEAR + REVENUE.length - 1}
        </text>
      </svg>

      {/* legenda — as 4 séries dos 2 gráficos reais (Receita; FCF/OCF/CapEx) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-xs font-medium text-foreground/70">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
          {legendRevenue}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />
          {legendFcf}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-5)]" aria-hidden />
          OCF
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded-full bg-[var(--chart-4)]" aria-hidden />
          CapEx
        </span>
      </div>
    </div>
  );
}
