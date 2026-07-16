"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ScrollShowcase — o momento "a app abre-se com o scroll": um track alto
 * com o frame sticky ao centro; na aproximação o frame endireita
 * (rotateX) e cresce até à escala real. Durante o hold, as legendas
 * sucedem-se em crossfade (uma "cena" por legenda — é isto que faz o
 * scroll parar mais tempo). Pin por CSS sticky (nunca `pin:` do GSAP —
 * ver lib/marketing/gsap.ts); scrub só em transform/opacity. Sem motion
 * fica estático com a primeira legenda visível.
 */
export function ScrollShowcase({
  captions = [],
  children,
}: {
  captions?: string[];
  children: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          frameRef.current,
          { y: 110, scale: 0.9, rotateX: 10, opacity: 0.35, transformPerspective: 1200 },
          {
            y: 0,
            scale: 1,
            rotateX: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: trackRef.current,
              start: "top 90%",
              end: "top top",
              scrub: 0.5,
            },
          },
        );

        const caps = gsap.utils.toArray<HTMLElement>("[data-caption]", trackRef.current);
        if (caps.length) {
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: trackRef.current,
              start: "top top",
              end: "bottom 94%",
              scrub: 0.5,
            },
          });
          caps.forEach((cap, i) => {
            tl.fromTo(
              cap,
              { autoAlpha: 0, y: 26 },
              { autoAlpha: 1, y: 0, duration: 1, ease: "none" },
              i * 2,
            );
            if (i < caps.length - 1) {
              tl.to(cap, { autoAlpha: 0, y: -22, duration: 1, ease: "none" }, i * 2 + 1.4);
            }
          });
        }
      });
    },
    { scope: trackRef },
  );

  return (
    <div ref={trackRef} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center gap-7 px-4 sm:px-6">
        <div ref={frameRef} className="w-full max-w-5xl [transform-style:preserve-3d]">
          {children}
        </div>
        {captions.length > 0 ? (
          <div className="relative min-h-16 w-full max-w-[52ch]">
            {captions.map((caption, i) => (
              <p
                key={i}
                data-caption
                className={cn(
                  "absolute inset-x-0 top-0 text-balance text-center text-base text-muted-foreground sm:text-lg",
                  i > 0 && "opacity-0",
                )}
              >
                {caption}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
