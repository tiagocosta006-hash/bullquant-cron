"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * Parallax — deriva vertical ±amp presa ao scroll (scrub): o elemento
 * percorre a página a uma velocidade ligeiramente diferente do resto,
 * separando os planos (profundidade à Revolut). Transform puro, nunca
 * pin. Sem JS/reduced-motion fica na posição natural.
 */
export function Parallax({
  amp = 40,
  zoom = false,
  className,
  children,
}: {
  /** amplitude em px (entra +amp abaixo, sai -amp acima); manter ≤44 */
  amp?: number;
  /** também escala 0.94 → 1.04 ao atravessar o viewport */
  zoom?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          ref.current,
          { y: amp, ...(zoom ? { scale: 0.94 } : {}) },
          {
            y: -amp,
            ...(zoom ? { scale: 1.04 } : {}),
            ease: "none",
            scrollTrigger: {
              trigger: ref.current,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.4,
            },
          },
        );
      });
    },
    { scope: ref, dependencies: [amp, zoom] },
  );

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
