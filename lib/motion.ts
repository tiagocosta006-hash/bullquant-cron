"use client";

import gsap from "gsap";

/**
 * Helpers de micro-interação (emotional design).
 *
 * Regra de decisão: CSS puro para estados hover/press/cor/success
 * (.pressable, .card-lift, .mos-color, .success-pop em globals.css);
 * GSAP só para scroll-scrub e contagem de números. Nunca `pin:` do
 * ScrollTrigger (parte o rubber-band do InertiaScroll).
 */

/** SSR-safe; no servidor assume que o movimento é aceitável. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Anima o textContent de um elemento entre dois números, formatado.
 * Com reduced-motion salta diretamente para o valor final.
 */
export function animateNumber(
  el: HTMLElement | null,
  from: number,
  to: number,
  format: (v: number) => string,
  duration = 0.6,
): void {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.textContent = format(to);
    return;
  }
  const proxy = { v: from };
  gsap.to(proxy, {
    v: to,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      el.textContent = format(proxy.v);
    },
  });
}

/**
 * Momento de sucesso discreto: aplica .success-pop (micro-pop + bloom
 * dourado) e remove no fim para poder repetir. No-op com reduced-motion.
 */
export function successPulse(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove("success-pop");
  // reflow para reiniciar a animação se disparada em sequência
  void el.offsetWidth;
  el.classList.add("success-pop");
  el.addEventListener(
    "animationend",
    () => el.classList.remove("success-pop"),
    { once: true },
  );
}
