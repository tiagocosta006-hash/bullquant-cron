"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ManifestoText — scrollytelling assinatura: a frase-manifesto fica
 * sticky ao centro e cada palavra "enche" de tinta (opacity 0.12 → 1)
 * com o progresso do scroll (scrub, reversível por natureza). O
 * `backdrop` (ex.: TickerWall) vive atrás do texto, dentro do sticky.
 * A opacidade inicial só é aplicada dentro do gate de motion — sem JS
 * ou com reduced-motion o texto está sempre completo.
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
        const words = trackRef.current?.querySelectorAll<HTMLElement>("[data-word]");
        if (!words?.length) return;
        gsap.set(words, { opacity: 0.12 });
        gsap.to(words, {
          opacity: 1,
          duration: 1,
          stagger: 0.35,
          ease: "none",
          scrollTrigger: {
            trigger: trackRef.current,
            start: "top 22%",
            end: "bottom 96%",
            scrub: 0.4,
          },
        });
      });
    },
    { scope: trackRef },
  );

  return (
    <div ref={trackRef} className="relative h-[300vh]">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-6">
        {backdrop ? (
          <div aria-hidden className="absolute inset-0 -z-10">
            {backdrop}
          </div>
        ) : null}
        <p className="max-w-5xl text-balance text-center text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-6xl md:text-7xl">
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn("block", i === accentLine && "text-primary")}
            >
              {line.split(" ").map((word, j) => (
                <span key={j} data-word className="inline-block will-change-[opacity]">
                  {word}
                  {j < line.split(" ").length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
