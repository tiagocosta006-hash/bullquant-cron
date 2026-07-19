"use client";

import { useEffect, useRef } from "react";

/**
 * LiveCell — célula de "quadro de cotações": alterna entre valores
 * canned com um flash de opacidade (apaga 0.25s, reacende com o valor
 * novo). Só em viewport, nunca com reduced-motion. SSR mostra values[0].
 */
export function LiveCell({
  values,
  intervalMs = 4200,
  className,
}: {
  values: string[];
  intervalMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let iv = 0;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(iv);
      if (!e.isIntersecting) return;
      iv = window.setInterval(() => {
        i = (i + 1) % values.length;
        el.style.transition = "opacity .25s ease";
        el.style.opacity = "0.35";
        setTimeout(() => {
          el.textContent = values[i];
          el.style.opacity = "1";
        }, 250);
      }, intervalMs);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(iv);
    };
  }, [values, intervalMs]);

  return (
    <span ref={ref} className={className}>
      {values[0]}
    </span>
  );
}
