"use client";

import { useRef } from "react";
import { gsap, useGSAP, MOTION_OK } from "@/lib/marketing/gsap";
import { cn } from "@/lib/utils";

/**
 * ManifestoText — scrollytelling assinatura: a frase-manifesto fica
 * sticky ao centro e cada palavra "enche" de tinta (opacity 0.12 → 1)
 * com o progresso do scroll (scrub, reversível por natureza).
 * A opacidade inicial só é aplicada dentro do gate de motion — sem JS
 * ou com reduced-motion o texto está sempre completo.
 */
export function ManifestoText({
  lines,
  accentLine,
}: {
  lines: string[];
  /** índice da linha destacada a dourado (SF, não Scotch — o Scotch é só do hero) */
  accentLine?: number;
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
            start: "top 20%",
            end: "bottom 95%",
            scrub: 0.4,
          },
        });
      });
    },
    { scope: trackRef },
  );

  return (
    <div ref={trackRef} className="relative h-[230vh]">
      <div className="sticky top-0 flex h-svh items-center justify-center px-6">
        <p className="max-w-5xl text-balance text-center text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-6xl md:text-7xl">
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn("block", i === accentLine && "text-primary")}
            >
              {line.split(" ").map((word, j) => (
                <span key={j} data-word className="inline-block will-change-[opacity]">
                  {word}
                  {j < line.split(" ").length - 1 ? " " : ""}
                </span>
              ))}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
