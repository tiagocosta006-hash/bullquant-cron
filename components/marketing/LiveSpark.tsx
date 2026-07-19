"use client";

import { useEffect, useRef } from "react";
import { animateNumber, prefersReducedMotion } from "@/lib/motion";

/**
 * LiveSpark — a sparkline + preço do TerminalMock ganham vida quando
 * entram no viewport: a linha desenha-se (stroke-dashoffset), um ponto
 * "ao vivo" pulsa no fim, e o preço faz ticks suaves entre valores de
 * exemplo (dados canned, não é UI real). SSR e reduced-motion mostram
 * exatamente o estado estático de sempre.
 */
const SPARK =
  "M0 34 L20 30 L40 31 L60 24 L80 26 L100 18 L120 20 L140 12 L160 14 L180 7 L200 4";

/** valores de exemplo (fecho anterior 225,48 → variação recalculada) */
const PREV_CLOSE = 225.48;
const TICKS = [227.34, 227.79, 227.12, 227.51];

const fmtPrice = (v: number) => `${v.toFixed(2).replace(".", ",")} $`;
const fmtChange = (v: number) => {
  const abs = v - PREV_CLOSE;
  const pct = (abs / PREV_CLOSE) * 100;
  return `▲ +${abs.toFixed(2).replace(".", ",")} (+${pct.toFixed(2).replace(".", ",")}%)`;
};

export function LiveSpark() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef<HTMLDivElement>(null);
  // y's da sparkline — a cada tick a linha "caminha" (sai um ponto à
  // esquerda, entra um novo à direita coerente com o sentido do preço)
  const ptsRef = useRef([34, 30, 31, 24, 26, 18, 20, 12, 14, 7, 4]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    let interval: ReturnType<typeof setInterval> | null = null;
    let tickIdx = 0;
    let drawn = false;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // desenhar a linha uma única vez
          if (!drawn && pathRef.current) {
            drawn = true;
            const path = pathRef.current;
            const len = path.getTotalLength();
            path.style.transition = "none";
            path.style.strokeDasharray = `${len}`;
            path.style.strokeDashoffset = `${len}`;
            if (dotRef.current) dotRef.current.style.opacity = "0";
            void path.getBoundingClientRect();
            path.style.transition = "stroke-dashoffset 1.2s var(--ease-out)";
            path.style.strokeDashoffset = "0";
            path.addEventListener(
              "transitionend",
              () => {
                if (dotRef.current) dotRef.current.style.opacity = "1";
              },
              { once: true },
            );
          }
          // ticks de preço só enquanto visível
          if (!interval) {
            interval = setInterval(() => {
              const from = TICKS[tickIdx % TICKS.length];
              tickIdx += 1;
              const to = TICKS[tickIdx % TICKS.length];
              animateNumber(priceRef.current, from, to, fmtPrice, 0.5);
              if (changeRef.current) changeRef.current.textContent = fmtChange(to);

              // a linha caminha um passo, coerente com o sentido do tick
              const pts = ptsRef.current;
              const dir = to > from ? -1 : 1; // preço sobe → y desce
              const last = pts[pts.length - 1];
              const nextY = Math.min(36, Math.max(3, last + dir * (2 + Math.random() * 3)));
              ptsRef.current = [...pts.slice(1), nextY];
              const path = pathRef.current;
              if (path) {
                // limpar o draw inicial antes do 1.º rebuild
                path.style.transition = "none";
                path.style.strokeDasharray = "none";
                const step = 200 / (ptsRef.current.length - 1);
                const d = ptsRef.current
                  .map((y, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${y.toFixed(1)}`)
                  .join(" ");
                path.setAttribute("d", d);
                areaRef.current?.setAttribute("d", `${d} L200 40 L0 40 Z`);
                dotRef.current?.setAttribute("cy", nextY.toFixed(1));
              }
            }, 3000);
          }
        } else if (interval) {
          clearInterval(interval);
          interval = null;
        }
      },
      { threshold: 0.3 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <div ref={rootRef}>
      <div ref={priceRef} className="nums mt-2 text-4xl font-bold tracking-tight">
        {fmtPrice(TICKS[0])}
      </div>
      <div ref={changeRef} className="nums mt-1 text-sm font-semibold text-bull">
        {fmtChange(TICKS[0])}
      </div>
      <svg
        viewBox="0 0 200 40"
        preserveAspectRatio="none"
        className="mt-4 h-12 w-full overflow-visible"
        aria-hidden="true"
      >
        <path ref={areaRef} d={`${SPARK} L200 40 L0 40 Z`} fill="var(--primary)" opacity="0.12" />
        <path
          ref={pathRef}
          d={SPARK}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle ref={dotRef} className="live-dot" cx="200" cy="4" r="2.5" fill="var(--primary)" />
      </svg>
    </div>
  );
}
