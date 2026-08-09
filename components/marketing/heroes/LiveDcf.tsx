"use client";

import { useEffect, useRef, useState } from "react";

import { runDcf } from "@/lib/finance/dcf";

/**
 * A DCF a correr-se a si própria. Os sliders movem-se, o fair value recalcula
 * a cada frame e assenta num veredicto.
 *
 * ⚠️ Usa o motor REAL (`lib/finance/dcf.ts`), o mesmo da calculadora do
 * produto — não uma aproximação para a landing. Se o motor mudar, isto muda
 * com ele, e nunca pode mostrar um número que a app não produziria.
 *
 * Os inputs (FCF, ações, dívida, caixa, preço) vêm do servidor, da nossa BD.
 */
export function LiveDcf({
  fcf0,
  shares,
  netDebt,
  currentPrice,
  ticker,
}: {
  fcf0: number;
  shares: number;
  netDebt: number;
  currentPrice: number;
  ticker: string;
}) {
  // valores de partida e de chegada: a animação percorre-os, e o resultado
  // final é o que a calculadora real daria com estas premissas
  const FROM = { growth: 0.03, wacc: 0.12 };
  const TO = { growth: 0.13, wacc: 0.075 };

  const [t, setT] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(1);
      return;
    }
    let raf = 0;
    let started = false;
    const el = ref.current;

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started) return;
        started = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / 2600, 1);
          setT(1 - Math.pow(1 - p, 3));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    if (el) io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const growth = FROM.growth + (TO.growth - FROM.growth) * t;
  const wacc = FROM.wacc + (TO.wacc - FROM.wacc) * t;

  const r = runDcf({
    fcf0,
    growthStage1: growth,
    growthStage2: growth * 0.6,
    wacc,
    terminalGrowth: 0.025,
    shares,
    netDebt,
    currentPrice,
  });

  const under = r.marginOfSafety > 0;

  const Slider = ({ label, value }: { label: string; value: number }) => (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="nums font-semibold tabular-nums">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
        {/* barra por transform (scaleX) e não por width: width faz layout a
            cada frame, scaleX é composição pura */}
        <div
          className="h-full origin-left rounded-full bg-primary"
          style={{ transform: `scaleX(${Math.min(value / 0.16, 1)})` }}
        />
      </div>
    </div>
  );

  return (
    <div ref={ref} className="grid gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-2">
      <div className="space-y-5">
        <Slider label="Crescimento anual (anos 1–5)" value={growth} />
        <Slider label="WACC" value={wacc} />
        <Slider label="Crescimento terminal" value={0.025} />
      </div>

      <div className="flex flex-col justify-center border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <p className="text-sm text-muted-foreground">Valor justo por ação</p>
        <p className="nums mt-1 text-5xl font-extrabold tabular-nums sm:text-6xl">
          ${r.fairValue.toFixed(2)}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Preço actual <span className="nums tabular-nums">${currentPrice.toFixed(2)}</span>
        </p>
        <p
          className={`nums mt-4 text-xl font-bold tabular-nums ${under ? "text-bull" : "text-bear"}`}
        >
          {under ? "Subavaliada" : "Sobreavaliada"} {(r.marginOfSafety * 100).toFixed(1)}%
        </p>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          {ticker} · calculado com o mesmo motor da calculadora do BullValue, a partir dos
          fundamentais reais. Uma DCF depende das tuas premissas — não é conselho de investimento.
        </p>
      </div>
    </div>
  );
}
