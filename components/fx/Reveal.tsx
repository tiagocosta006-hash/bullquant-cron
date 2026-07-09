"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — fade + slide + blur REVERSÍVEL das fundações: entra ao
 * aparecer no viewport e volta a sair quando sai (scroll para cima).
 * O CSS vive em globals.css (`.reveal` / `.reveal.in`); reduced-motion
 * mostra tudo imediatamente.
 */
export function Reveal({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => entry.target.classList.toggle("in", entry.isIntersecting));
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("reveal", className)} {...rest}>
      {children}
    </div>
  );
}
