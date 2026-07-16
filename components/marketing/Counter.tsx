"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * Counter — número que conta do 0 ao valor final ao entrar no viewport,
 * reversível como o Reveal (sai do ecrã → volta a 0 e reconta ao voltar).
 * SSR renderiza o valor final (SEO/no-JS); reduced-motion fica estático.
 */
export function Counter({
  value,
  prefix = "",
  suffix = "",
  duration = 1.4,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const state = { v: 0 };
    let tween: gsap.core.Tween | null = null;
    const render = () => {
      el.textContent = `${prefix}${Math.round(state.v)}${suffix}`;
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        tween?.kill();
        if (entry.isIntersecting) {
          tween = gsap.to(state, { v: value, duration, ease: "power2.out", onUpdate: render });
        } else {
          state.v = 0;
          render();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      tween?.kill();
    };
  }, [value, prefix, suffix, duration]);

  return (
    <span ref={ref} className={cn("nums", className)}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
