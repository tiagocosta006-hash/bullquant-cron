"use client";

import { useCallback, useRef, type CSSProperties } from "react";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { runDcf } from "@/lib/finance/dcf";
import { formatPercent, formatPrice } from "@/lib/finance/format";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";

/**
 * DcfScrollDemo — demo scriptada da calculadora: com o scroll, o slider
 * de crescimento avança de 4% para 10% e o Fair Value recalcula com o
 * MOTOR REAL (`runDcf` de lib/finance/dcf) — a margem de segurança vira
 * de negativa para positiva a meio do percurso. Empresa-exemplo genérica
 * (números redondos), não uma empresa real. SSR mostra o estado inicial;
 * reduced-motion fica nesse estado estático.
 */
const G_MIN = 0.04;
const G_MAX = 0.1;
const BASE_INPUTS = {
  fcf0: 8e9,
  wacc: 0.1,
  terminalGrowth: 0.025,
  shares: 1e9,
  netDebt: 5e9,
  currentPrice: 120,
};

const dcfAt = (g: number) =>
  runDcf({ ...BASE_INPUTS, growthStage1: g, growthStage2: g * 0.6 });

const INITIAL = dcfAt(G_MIN);

const marginWidth = (mos: number) =>
  `${Math.min(100, Math.max(4, ((mos + 0.1) / 0.4) * 100))}%`;

/* Crossfade bull↔bear: em vez de trocar classes no cruzamento do zero,
   a margem mapeia para --mos-t (janela suave de ±6%) e a cor interpola
   via .mos-color / var(--mos-ink) em globals.css. */
const mosT = (mos: number) => Math.min(1, Math.max(0, mos / 0.06 + 0.5));

export function DcfScrollDemo({
  labels,
}: {
  labels: {
    growth: string;
    wacc: string;
    terminal: string;
    price: string;
    fairValue: string;
    perShare: string;
    margin: string;
    undervalued: string;
    overvalued: string;
    disclaimer: string;
  };
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const growthRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const fairRef = useRef<HTMLDivElement>(null);
  const marginRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const marginFillRef = useRef<HTMLDivElement>(null);

  const render = useCallback(
    (g: number) => {
      const res = dcfAt(g);
      const mos = res.marginOfSafety;
      if (growthRef.current) growthRef.current.textContent = formatPercent(g);
      if (fillRef.current)
        fillRef.current.style.width = `${((g - G_MIN) / (G_MAX - G_MIN)) * 100}%`;
      if (fairRef.current) fairRef.current.textContent = formatPrice(res.fairValue);
      if (marginRef.current)
        marginRef.current.textContent = `${mos >= 0 ? "+" : ""}${formatPercent(mos)}`;
      if (badgeRef.current)
        badgeRef.current.textContent = mos >= 0 ? labels.undervalued : labels.overvalued;
      if (marginFillRef.current) marginFillRef.current.style.width = marginWidth(mos);
      if (rootRef.current) rootRef.current.style.setProperty("--mos-t", String(mosT(mos)));
    },
    [labels.undervalued, labels.overvalued],
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const state = { g: G_MIN };
        // Depois do scrub, o crescimento respira ±0,3pp e o Fair Value
        // recalcula ao vivo com o motor real — o cartão nunca é um still.
        // Só DEPOIS do fim (onLeave): a meio, a margem cruza zero e o
        // badge piscava. Com g=G_MAX a margem fica folgadamente positiva.
        const amb = { o: 0 };
        const breath = gsap.fromTo(
          amb,
          { o: -0.003 },
          {
            o: 0.003,
            duration: 4.5,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
            paused: true,
            onUpdate: () => render(Math.min(G_MAX + 0.003, state.g + amb.o)),
          },
        );
        gsap.to(state, {
          g: G_MAX,
          ease: "none",
          onUpdate: () => render(state.g),
          scrollTrigger: {
            trigger: rootRef.current,
            start: "top 82%",
            end: "top 22%",
            scrub: 0.5,
            onLeave: () => breath.play(),
            onEnterBack: () => breath.pause(),
            onLeaveBack: () => breath.pause(),
          },
        });
        return () => {
          breath.kill();
        };
      });
    },
    { scope: rootRef, dependencies: [render] },
  );

  const initialMos = INITIAL.marginOfSafety;

  return (
    <div
      ref={rootRef}
      className="mos-color"
      style={{ "--mos-t": mosT(initialMos) } as CSSProperties}
    >
      <LiquidGlass className="rounded-3xl p-6 sm:p-8">
        {/* Fair Value — herói full-width (nunca corta, é a estrela do cartão) */}
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {labels.fairValue} · {labels.perShare}
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div
            ref={fairRef}
            className="nums text-5xl font-extrabold leading-none tracking-tight sm:text-7xl"
          >
            {formatPrice(INITIAL.fairValue)}
          </div>
          <div className="flex items-center gap-3 pb-1">
            <span
              ref={badgeRef}
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                color: "var(--mos-ink)",
                background: "color-mix(in srgb, var(--mos-ink) 10%, transparent)",
              }}
            >
              {initialMos >= 0 ? labels.undervalued : labels.overvalued}
            </span>
            <span className="text-sm text-muted-foreground">{labels.margin}</span>
            <span ref={marginRef} className="nums text-sm font-semibold">
              {`${initialMos >= 0 ? "+" : ""}${formatPercent(initialMos)}`}
            </span>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            ref={marginFillRef}
            className="h-full rounded-full"
            style={{ width: marginWidth(initialMos), background: "var(--mos-ink)" }}
          />
        </div>

        {/* inputs — grelha compacta por baixo (o slider avança com o scroll) */}
        <div className="mt-8 grid gap-x-8 gap-y-5 border-t border-border/60 pt-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-muted-foreground">{labels.growth}</span>
              <span ref={growthRef} className="nums font-semibold text-primary">
                {formatPercent(G_MIN)}
              </span>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div ref={fillRef} className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
            </div>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-muted-foreground">{labels.wacc}</span>
            <span className="nums font-semibold">{formatPercent(BASE_INPUTS.wacc)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-muted-foreground">{labels.terminal}</span>
            <span className="nums font-semibold">{formatPercent(BASE_INPUTS.terminalGrowth)}</span>
          </div>
          <div className="flex items-baseline justify-between text-sm sm:col-span-2">
            <span className="font-medium text-muted-foreground">{labels.price}</span>
            <span className="nums font-semibold">{formatPrice(BASE_INPUTS.currentPrice)}</span>
          </div>
        </div>

        <p className="mt-6 max-w-[52ch] border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground/80">
          {labels.disclaimer}
        </p>
      </LiquidGlass>
    </div>
  );
}
