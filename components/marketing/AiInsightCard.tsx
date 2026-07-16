"use client";

import { useRef } from "react";
import { Sparkles } from "lucide-react";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";

/**
 * AiInsightCard — cartão da Story 3: um AI Brief que se "escreve" com o
 * scroll (blocos revelam-se em sequência via scrub, reversível). Chips
 * de sentimento usam verde/vermelho porque SÃO direção (positivo/risco),
 * nunca decoração. Sem motion, o cartão está completo.
 */
export function AiInsightCard({
  title,
  summary,
  catalystsLabel,
  catalysts,
  riskLabel,
  risk,
  disclaimer,
}: {
  title: string;
  summary: string;
  catalystsLabel: string;
  catalysts: string[];
  riskLabel: string;
  risk: string;
  disclaimer: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const items = rootRef.current?.querySelectorAll<HTMLElement>("[data-item]");
        if (!items?.length) return;
        gsap.fromTo(
          items,
          { opacity: 0.1, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: 1,
            stagger: 0.6,
            ease: "none",
            scrollTrigger: {
              trigger: rootRef.current,
              start: "top 80%",
              end: "top 30%",
              scrub: 0.5,
            },
          },
        );
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      <LiquidGlass className="rounded-3xl p-6 sm:p-8">
        <div data-item className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <Sparkles className="h-4.5 w-4.5" strokeWidth={2} />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>

        <p data-item className="mt-5 text-base leading-relaxed text-foreground/90">
          {summary}
        </p>

        <div data-item className="mt-6">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {catalystsLabel}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {catalysts.map((c) => (
              <span
                key={c}
                className="rounded-full bg-bull/10 px-3 py-1.5 text-xs font-semibold text-bull"
              >
                ▲ {c}
              </span>
            ))}
          </div>
        </div>

        <div data-item className="mt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {riskLabel}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="rounded-full bg-bear/10 px-3 py-1.5 text-xs font-semibold text-bear">
              ▼ {risk}
            </span>
          </div>
        </div>

        <p
          data-item
          className="mt-6 border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground/80"
        >
          {disclaimer}
        </p>
      </LiquidGlass>
    </div>
  );
}
