"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ScreenerChips — mock do card "Listas curadas" do bento: os chips das
 * listas temáticas (Growth, Dividend Growth, Buyback Machines, Wide Moat)
 * e o chip "ativo" cicla entre eles com um leve fade, ambient motion igual
 * ao `LiveCell`. Só corre em viewport e nunca com prefers-reduced-motion
 * (SSR mostra sempre o primeiro chip ativo).
 */
export function ScreenerChips({
  labels,
  intervalMs = 3400,
}: {
  labels: string[];
  intervalMs?: number;
}) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let iv = 0;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(iv);
      if (!e.isIntersecting) return;
      iv = window.setInterval(() => {
        setActive((i) => (i + 1) % labels.length);
      }, intervalMs);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(iv);
    };
  }, [labels.length, intervalMs]);

  return (
    <div ref={ref} className="mt-5 flex flex-wrap gap-2">
      {labels.map((label, i) => (
        <span
          key={label}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-500",
            i === active
              ? "bg-primary/15 text-primary scale-[1.04]"
              : "border border-border/60 bg-card/40 text-muted-foreground",
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
