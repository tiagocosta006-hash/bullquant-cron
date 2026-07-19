"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ScrollShowcase — o momento "a app abre-se com o scroll": um track alto
 * com o frame sticky ao centro; na aproximação o frame endireita
 * (rotateX) e cresce até à escala real. Durante o hold, as legendas
 * sucedem-se em crossfade e comandam "cenas" dentro do mock (histograma
 * nas métricas, chip AI) com um leve zoom/pan de câmara. Com `peek`
 * (≥md), o frame espreita acima da dobra dentro do hero e assenta ao
 * primeiro scroll — padrão Revolut/Linear. Pin por CSS sticky (nunca
 * `pin:` do GSAP — ver lib/marketing/gsap.ts); scrub só em
 * transform/opacity. Sem motion fica estático com a 1.ª legenda.
 */
export function ScrollShowcase({
  captions = [],
  peek = false,
  children,
}: {
  captions?: string[];
  /** o frame espreita ~22vh dentro do hero em desktop */
  peek?: boolean;
  children: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      const entry = (from: gsap.TweenVars, start: string) =>
        gsap.fromTo(frameRef.current, from, {
          y: 0,
          scale: 1,
          rotateX: 0,
          opacity: 1,
          ease: "none",
          scrollTrigger: { trigger: trackRef.current, start, end: "top top", scrub: 0.5 },
        });

      if (peek) {
        // desktop: o frame começa puxado para DENTRO do hero (peek) e
        // assenta mais devagar que a página — peso cinematográfico
        mm.add(`${MOTION_OK} and (min-width: 768px)`, () => {
          entry(
            { y: "-22vh", scale: 0.94, rotateX: 7, opacity: 1, transformPerspective: 1200 },
            "top bottom",
          );
        });
        mm.add(`${MOTION_OK} and (max-width: 767.98px)`, () => {
          entry({ y: 110, scale: 0.9, rotateX: 10, opacity: 0.35, transformPerspective: 1200 }, "top 90%");
        });
      } else {
        mm.add(MOTION_OK, () => {
          entry({ y: 110, scale: 0.9, rotateX: 10, opacity: 0.35, transformPerspective: 1200 }, "top 90%");
        });
      }

      mm.add(MOTION_OK, () => {
        const caps = gsap.utils.toArray<HTMLElement>("[data-caption]", trackRef.current);
        if (!caps.length) return;
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

        // cenas dentro do mock, sincronizadas com as legendas
        const bars = gsap.utils.toArray<HTMLElement>("[data-scene-bar]", trackRef.current);
        if (bars.length) {
          tl.fromTo(
            bars,
            { scaleY: 0, transformOrigin: "50% 100%" },
            { scaleY: 1, stagger: 0.05, duration: 0.9, ease: "none" },
            2,
          );
        }
        const chip = trackRef.current?.querySelector<HTMLElement>("[data-scene='3']");
        if (chip) {
          tl.fromTo(chip, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1, ease: "none" }, 4);
        }
        // câmara: aproxima ao quadrante das métricas na cena 2, recua na 3
        if (sceneRef.current) {
          tl.to(
            sceneRef.current,
            { scale: 1.05, xPercent: -3, yPercent: 3, transformOrigin: "72% 30%", duration: 1.6, ease: "none" },
            1.8,
          ).to(sceneRef.current, { scale: 1, xPercent: 0, yPercent: 0, duration: 1.6, ease: "none" }, 3.6);
        }
        // saída: o frame afasta-se enquanto o manifesto toma o palco
        if (frameRef.current) {
          tl.to(frameRef.current, { scale: 0.94, opacity: 0.6, duration: 0.8, ease: "none" }, 5.2);
        }
      });
    },
    { scope: trackRef, dependencies: [peek] },
  );

  return (
    <div ref={trackRef} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center gap-7 px-4 sm:px-6">
        <div ref={frameRef} className="w-full max-w-5xl [transform-style:preserve-3d]">
          <div ref={sceneRef} className="will-change-transform">
            {children}
          </div>
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
