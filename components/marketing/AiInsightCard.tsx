"use client";

import { useRef } from "react";
import { BrainCircuit, FileText, ShieldCheck } from "lucide-react";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";

/**
 * AiInsightCard — cartão da Story 3, fiel ao Analista IA real do produto
 * (StockAnalyst: tese de investimento + badge de moat + grelha de KPIs).
 * Os blocos revelam-se em sequência via scrub, reversível. O badge usa
 * verde (bull) porque É direção — moat largo é positivo — nunca decoração.
 * Sem motion, o cartão está completo.
 */
export function AiInsightCard({
  title,
  chipLabel,
  thesisLabel,
  thesis,
  moatLabel,
  moatValue,
  kpis,
  chatUser,
  chatAnswer,
  chatCite,
  disclaimer,
}: {
  title: string;
  chipLabel: string;
  thesisLabel: string;
  thesis: string;
  moatLabel: string;
  moatValue: string;
  kpis: { label: string; value: string; insight: string }[];
  chatUser: string;
  chatAnswer: string;
  chatCite: string;
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
      <LiquidGlass className="relative overflow-hidden rounded-3xl p-6 sm:p-8">
        {/* hairline superior do herói da tese, como no produto */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
          aria-hidden
        />

        <div data-item className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <BrainCircuit className="h-3.5 w-3.5" strokeWidth={2} />
            {chipLabel}
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </div>

        <div data-item className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/80">
              {thesisLabel}
            </div>
            <p className="text-base font-medium leading-relaxed text-foreground md:text-lg">
              {thesis}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 self-start rounded-2xl border border-bull/30 bg-bull/10 px-4 py-3 text-bull">
            <ShieldCheck className="h-6 w-6" />
            <div className="leading-tight">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                {moatLabel}
              </div>
              <div className="text-sm font-bold">{moatValue}</div>
            </div>
          </div>
        </div>

        {/* mini-KPIs na grelha hairline do produto */}
        <div data-item className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50">
          {kpis.map((k) => (
            <div key={k.label} className="flex flex-col gap-2 bg-card p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <p className="nums text-xl font-bold tracking-tight text-foreground">{k.value}</p>
              <p className="text-xs leading-relaxed text-muted-foreground/80">{k.insight}</p>
            </div>
          ))}
        </div>

        {/* cena de chat — mesmas bolhas do AnalystChat real / TerminalMock */}
        <div data-item className="mt-6 space-y-2 border-t border-border/50 pt-6">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
              {chatUser}
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border/50 bg-muted/50 px-4 py-2.5 text-sm text-foreground">
              {chatAnswer}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <FileText className="h-3 w-3" />
              {chatCite}
            </span>
          </div>
        </div>

        <p
          data-item
          className="mt-6 max-w-[52ch] border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground/80"
        >
          {disclaimer}
        </p>
      </LiquidGlass>
    </div>
  );
}
