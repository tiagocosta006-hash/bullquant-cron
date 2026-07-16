"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";

/**
 * ScrollShowcase — o momento "a app abre-se com o scroll": um track alto
 * com o frame sticky ao centro; na aproximação o frame endireita
 * (rotateX) e cresce até à escala real, e durante o hold a legenda sobe.
 * Pin por CSS sticky (nunca `pin:` do GSAP — ver lib/marketing/gsap.ts);
 * scrub só em transform/opacity. Sem motion, tudo fica estático visível.
 */
export function ScrollShowcase({
  caption,
  children,
}: {
  caption?: string;
  children: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);

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
        if (captionRef.current) {
          gsap.fromTo(
            captionRef.current,
            { opacity: 0, y: 26 },
            {
              opacity: 1,
              y: 0,
              ease: "none",
              scrollTrigger: {
                trigger: trackRef.current,
                start: "top top",
                end: "35% top",
                scrub: 0.5,
              },
            },
          );
        }
      });
    },
    { scope: trackRef },
  );

  return (
    <div ref={trackRef} className="relative h-[170vh]">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center gap-7 px-4 sm:px-6">
        <div ref={frameRef} className="w-full max-w-5xl [transform-style:preserve-3d]">
          {children}
        </div>
        {caption ? (
          <p
            ref={captionRef}
            className="max-w-[48ch] text-balance text-center text-base text-muted-foreground sm:text-lg"
          >
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
