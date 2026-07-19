"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ManifestoText — reveal "zoom-through": a frase fica sticky ao centro e
 * cada linha ATRAVESSA a câmara — entra gigante e desfocada (scale 2.3,
 * blur) e assenta no lugar, sequencialmente, presa ao scrub (reversível).
 * Quando a linha accent assenta, ganha um sweep dourado one-shot.
 * O `backdrop` (TickerWall) vive atrás do texto, dentro do sticky.
 * Sem JS / reduced-motion: linhas completas estáticas (estados iniciais
 * só dentro do gate de motion).
 */
export function ManifestoText({
  lines,
  accentLine,
  backdrop,
}: {
  lines: string[];
  /** índice da linha destacada a dourado (SF, não Scotch — o Scotch é só do hero) */
  accentLine?: number;
  /** fundo decorativo atrás do texto (renderizado aria-hidden) */
  backdrop?: React.ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const els = gsap.utils.toArray<HTMLElement>("[data-line]", trackRef.current);
        if (!els.length) return;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: trackRef.current,
            start: "top 18%",
            end: "bottom 96%",
            scrub: 0.4,
          },
        });
        els.forEach((el, i) => {
          tl.fromTo(
            el,
            { scale: 2.3, autoAlpha: 0, filter: "blur(14px)", transformOrigin: "50% 50%" },
            { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: 1, ease: "none" },
            i * 1.2,
          );
        });
        if (accentLine !== undefined && els[accentLine]) {
          // sweep dourado quando a linha accent assenta (one-shot CSS)
          tl.call(
            () => els[accentLine].classList.add("manifesto-sheen"),
            undefined,
            accentLine * 1.2 + 0.95,
          );
        }
      });
    },
    { scope: trackRef, dependencies: [accentLine] },
  );

  return (
    <div ref={trackRef} className="relative h-[260vh]">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-6">
        {backdrop ? (
          <div aria-hidden className="absolute inset-0 -z-10">
            {backdrop}
          </div>
        ) : null}
        <p className="max-w-5xl text-balance text-center text-4xl font-extrabold leading-[1.12] tracking-[-0.03em] sm:text-6xl md:text-7xl">
          {lines.map((line, i) => (
            <span
              key={i}
              data-line
              className={cn(
                "block will-change-transform",
                i === accentLine && "text-primary",
              )}
            >
              {line}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
