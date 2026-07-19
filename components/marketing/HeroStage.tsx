"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";

/**
 * HeroStage — dolly de câmara na saída do hero: ao primeiro scroll, o
 * conteúdo recua em profundidade (encolhe, sobe, esbate) enquanto o
 * terminal do showcase avança por baixo — corte de câmara à Revolut.
 * Só transform/opacity em scrub (nunca pin — ver lib/marketing/gsap.ts).
 * NOTA: os filhos usam .hero-in (animation-fill both) — o transform do
 * GSAP vive NESTE wrapper, nunca nos mesmos nós, senão conflituam.
 */
export function HeroStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(ref.current, {
          y: -48,
          scale: 0.96,
          opacity: 0.35,
          transformOrigin: "50% 20%",
          ease: "none",
          scrollTrigger: {
            trigger: ref.current!.parentElement,
            start: "top top",
            end: "bottom 30%",
            scrub: 0.4,
          },
        });
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
