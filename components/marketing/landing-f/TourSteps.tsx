"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrame } from "@/components/marketing/MediaFrame";
import { ThemedImg } from "@/components/marketing/showcase/ThemedImg";
import { cn } from "@/lib/utils";

export type TourStep = {
  key: string;
  label: string;
  title: string;
  body: string;
  alt: string;
  wide: string;
  square: string;
  address: string;
};

/**
 * Versão F ("Tour guiado"): passos de texto à esquerda e, no desktop, um ecrã
 * fixo (sticky) à direita que troca de print conforme o passo que cruza o meio
 * do ecrã. Só IntersectionObserver (sem scroll listeners). Com
 * prefers-reduced-motion a troca é instantânea (transições só em motion-safe).
 * No telemóvel não há sticky: cada passo traz o seu recorte quadrado por baixo.
 */
export function TourSteps({ steps, railLabel }: { steps: TourStep[]; railLabel: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const els = refs.current.filter((el): el is HTMLLIElement => el !== null);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step ?? 0));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const current = steps[active] ?? steps[0];

  return (
    <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 lg:gap-16">
      <ol className="space-y-14 md:space-y-0">
        {steps.map((s, i) => (
          <li
            key={s.key}
            id={`visita-${s.key}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-step={i}
            className="scroll-mt-24 md:flex md:min-h-[72vh] md:flex-col md:justify-center"
          >
            <div
              className={cn(
                "md:motion-safe:transition-opacity md:motion-safe:duration-300",
                active === i ? "md:opacity-100" : "md:opacity-40",
              )}
            >
              <p className="flex items-baseline gap-2 text-sm font-semibold text-muted-foreground">
                <span className="nums font-heading text-lg italic text-primary">{String(i + 1).padStart(2, "0")}</span>
                <span>{s.label}</span>
              </p>
              <h3 className="mt-2 text-balance text-2xl font-extrabold leading-tight tracking-[-0.025em] sm:text-3xl">{s.title}</h3>
              <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm md:hidden">
              <ThemedImg src={s.square} alt={s.alt} className="aspect-square h-auto w-full object-cover" />
            </div>
          </li>
        ))}
      </ol>

      <div className="hidden md:block">
        <div className="sticky top-24 pb-6">
          <MediaFrame alt={current?.alt ?? ""} address={current?.address}>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-card">
              {steps.map((s, i) => (
                <div
                  key={s.key}
                  aria-hidden={active !== i}
                  className={cn(
                    "absolute inset-0 motion-safe:transition-opacity motion-safe:duration-500",
                    active === i ? "opacity-100" : "opacity-0",
                  )}
                >
                  <ThemedImg src={s.wide} alt={s.alt} className="h-full w-full object-cover object-top" />
                </div>
              ))}
            </div>
          </MediaFrame>
          <nav aria-label={railLabel} className="mt-4 flex flex-wrap justify-center gap-1.5">
            {steps.map((s, i) => (
              <a
                key={s.key}
                href={`#visita-${s.key}`}
                aria-current={active === i ? "step" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active === i
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
