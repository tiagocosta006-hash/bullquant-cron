"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * MarqueeViewport — a casca cliente da fita de ticker: possui o
 * `.marquee`/`.marquee-track` e faz a TRAVAGEM SUAVE em hover.
 *
 * O `animation-play-state: paused` do CSS é discreto (não interpolável), por
 * isso a fita parava a seco. Aqui interpola-se o `playbackRate` da
 * CSSAnimation: 1 → 0 à entrada, 0 → 1 à saída. As keyframes continuam a ser
 * a fonte de verdade e o `--marquee-duration` continua a vir do servidor.
 *
 * Os itens entram como `children` para o TickerMarquee continuar Server
 * Component (Links, logos e sparklines ficam renderizados no servidor) — só
 * estes dois divs atravessam a fronteira.
 *
 * Vive em components/fx/ e não em marketing/ porque o TickerMarquee também é
 * usado no terminal (app/(app)/dashboard). Só importa react + cn.
 *
 * Sem JS ou com prefers-reduced-motion cai no fallback do CSS
 * (`.marquee:not([data-js]):hover`) — ver globals.css.
 */
const EASE_MS = 420;
// easeOutCubic: trava depressa no início e assenta devagar — é o que lê como
// travagem em vez de corte.
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function MarqueeViewport({
  label,
  durationSec,
  className,
  children,
}: {
  label: string;
  durationSec: number;
  className?: string;
  children: React.ReactNode;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const view = viewRef.current;
    const track = trackRef.current;
    if (!view || !track) return;
    // Leitura única, como em lib/motion.ts / Reveal.tsx: mudar a preferência
    // do SO a meio da sessão exige reload, como em todo o resto da app.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof track.getAnimations !== "function") return;

    // Assume o controlo → desliga a pausa binária do CSS. Imperativo e nunca
    // renderizado no servidor, senão o caminho sem JS ficava sem pausa.
    view.dataset.js = "";

    let anim: Animation | null = null;
    let raf = 0;
    let from = 1;
    let to = 1;
    let t0 = 0;

    const pick = () => {
      const all = track.getAnimations();
      return (
        all.find((a) => (a as CSSAnimation).animationName === "marquee-x") ?? all[0] ?? null
      );
    };

    const tick = (now: number) => {
      raf = 0;
      if (!anim) return;
      const p = Math.min(1, (now - t0) / EASE_MS);
      anim.playbackRate = from + (to - from) * easeOut(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    const glide = (target: number) => {
      // Resolvida na 1ª interação (não no mount) e re-resolvida se ficou
      // stale — troca de tema, content-visibility, HMR em dev.
      if (!anim || anim.playState === "idle") anim = pick();
      if (!anim) {
        // getAnimations() vazio: devolve o comando ao CSS. O `:hover` reavalia
        // de imediato porque o rato ainda está sobre a fita → cai na pausa
        // antiga em vez de ficar um handler morto.
        delete view.dataset.js;
        return;
      }
      from = anim.playbackRate;
      to = target;
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const stop = () => glide(0);
    const go = () => glide(1);

    // mouseenter/leave e não pointer*: em toque o pointerenter deixava a fita
    // presa parada (o :hover em touch é sticky de qualquer forma).
    view.addEventListener("mouseenter", stop);
    view.addEventListener("mouseleave", go);
    // Paridade para navegação por teclado nos Links de dentro da fita.
    view.addEventListener("focusin", stop);
    view.addEventListener("focusout", go);

    return () => {
      cancelAnimationFrame(raf);
      view.removeEventListener("mouseenter", stop);
      view.removeEventListener("mouseleave", go);
      view.removeEventListener("focusin", stop);
      view.removeEventListener("focusout", go);
      delete view.dataset.js;
      if (anim) anim.playbackRate = 1;
    };
  }, []);

  return (
    <div ref={viewRef} aria-label={label} className={cn("marquee marquee-band w-full py-4", className)}>
      <div
        ref={trackRef}
        className="marquee-track flex items-center"
        style={{ "--marquee-duration": `${durationSec}s` } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
