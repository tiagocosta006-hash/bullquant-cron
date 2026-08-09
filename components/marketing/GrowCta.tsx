"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * GrowCta — o CTA final cresce com o scroll (scrub, reversível) à medida
 * que se aproxima do centro do ecrã, para dar mais vontade de clicar.
 * Sem motion fica à escala natural.
 */
export function GrowCta({
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
        /* O topo da escala TEM de ser 1. Esteve em 1.2 e partia o layout:
           o `gap-4` da linha é medido na caixa por escalar, por isso a 120%
           o botão dourado transbordava ~20% para cima do "Espreitar sem
           conta" — os dois ficavam colados/sobrepostos. Crescer de 0.86 até
           ao tamanho natural dá o mesmo efeito sem sair da própria caixa. */
        gsap.fromTo(
          ref.current,
          { scale: 0.86 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: ref.current,
              start: "top 92%",
              end: "top 38%",
              scrub: 0.4,
            },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
