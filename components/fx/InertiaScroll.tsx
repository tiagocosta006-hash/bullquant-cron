"use client";

import { useEffect } from "react";

/**
 * InertiaScroll — o peso de scroll único do produto (só roda do rato).
 * Meio-termo entre o nativo instantâneo e o "pesado" original das
 * fundações; no topo/fundo há um rubber-band elástico em vez de bater
 * na parede. Auto-desativa-se se não conseguir mover o scroll (nunca
 * prende a página) e ignora alvos com scroll próprio ([data-native-scroll]).
 *
 * Montar UMA vez por grupo de rotas (landing e terminal). `wrapId`
 * aponta para o wrapper que recebe o transform do rubber-band (opcional).
 */
export function InertiaScroll({ wrapId }: { wrapId?: string }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !window.matchMedia("(hover: hover)").matches) return;

    const scroller = document.scrollingElement || document.documentElement;
    const wrap = wrapId ? document.getElementById(wrapId) : null;
    // meio-termo: nem o peso pesado das fundações nem o nativo instantâneo do terminal
    const STEP = 0.65;
    const GLIDE = 0.16;
    const OVER_MAX = 70;
    const OVER_GAIN = 0.3;
    const OVER_SPRING = 0.85;

    let target = scroller.scrollTop;
    let currentY = scroller.scrollTop;
    let over = 0;
    let animating = false;
    let ok = true;
    let raf = 0;

    const maxY = () => scroller.scrollHeight - scroller.clientHeight;

    const tick = () => {
      currentY += (target - currentY) * GLIDE;
      if (Math.abs(target - currentY) < 0.3) currentY = target;
      const before = scroller.scrollTop;
      scroller.scrollTop = currentY;
      if (ok && Math.abs(scroller.scrollTop - before) < 0.1 && Math.abs(currentY - before) > 1) {
        ok = false;
        animating = false;
        if (wrap) wrap.style.transform = "";
        return;
      }
      over *= OVER_SPRING;
      if (Math.abs(over) < 0.15) over = 0;
      if (wrap) wrap.style.transform = over ? `translate3d(0, ${(-over).toFixed(2)}px, 0)` : "";
      if (Math.abs(target - currentY) < 0.3 && over === 0) {
        animating = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (!animating) {
        animating = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || !ok) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-native-scroll], textarea, select, [role='dialog'], [role='listbox']")) return;
      e.preventDefault();
      let raw = target + e.deltaY * STEP;
      const lim = maxY();
      if (raw < 0) {
        over += raw * OVER_GAIN;
        raw = 0;
      } else if (raw > lim) {
        over += (raw - lim) * OVER_GAIN;
        raw = lim;
      }
      over = Math.max(-OVER_MAX, Math.min(OVER_MAX, over));
      target = raw;
      kick();
    };

    const onScroll = () => {
      if (Math.abs(scroller.scrollTop - currentY) > 3) {
        target = currentY = scroller.scrollTop;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      if (wrap) wrap.style.transform = "";
    };
  }, [wrapId]);

  return null;
}
