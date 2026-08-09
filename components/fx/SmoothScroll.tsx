"use client";

import { useEffect } from "react";
import Lenis from "lenis";

import { gsap, ScrollTrigger } from "@/lib/marketing/gsap";

/**
 * SmoothScroll — scroll suave com Lenis.
 *
 * Substitui o antigo `InertiaScroll` (roda intercetada à mão + rubber-band).
 * Duas razões, ambas medidas:
 *
 * 1. CONFLITO. O InertiaScroll fazia `preventDefault()` em cada evento de roda
 *    e animava o `scrollTop` no seu próprio rAF, enquanto ~20 ScrollTriggers
 *    do GSAP liam a posição do scroll noutro loop. Dois donos do mesmo estado
 *    = os "choques" a meio da página. O Lenis existe precisamente para ser a
 *    ÚNICA fonte de verdade, e aqui é ele que faz avançar o ticker do GSAP.
 *
 * 2. PERFORMANCE. O rubber-band aplicava `transform: translate3d()` ao
 *    `#marketing-wrap`, que contém ~40 elementos `.glass` com `backdrop-filter`.
 *    Transformar o antecessor obriga o compositor a refazer os 40 desfoques a
 *    cada frame — era esta a origem do lag. O Lenis faz scroll NATIVO
 *    (mexe no scrollTop, não transforma nada), por isso os backdrop-filters
 *    ficam quietos.
 *
 * É o mesmo motor que a concorrência (pludata.com) usa.
 */
export function SmoothScroll() {
  useEffect(() => {
    // Respeitar a preferência do SO e não roubar o scroll em touch — no
    // telemóvel o scroll nativo já é melhor do que qualquer emulação.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover)").matches) return;

    const lenis = new Lenis({
      // ~igual ao amortecimento do site de referência: assenta depressa,
      // sem a sensação de "elástico" que obrigava a rodar duas vezes.
      lerp: 0.1,
      // 1 = uma volta de roda anda o que o SO manda. NUNCA abaixo de 1:
      // era isso que fazia a página parecer que resistia.
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    // O Lenis passa a conduzir o ScrollTrigger: uma só leitura por frame,
    // na ordem certa (primeiro o scroll, depois quem depende dele).
    lenis.on("scroll", ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  }, []);

  return null;
}
