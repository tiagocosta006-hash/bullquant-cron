"use client";

import { useEffect, useRef, useState } from "react";
import { MediaFrame } from "./MediaFrame";
import { cn } from "@/lib/utils";

type Video = { video: string; poster: string; alt: string };

/**
 * Vídeo da plataforma no PRIMEIRO ecrã da landing (à Qualtrim: quem chega vê
 * logo o produto a ser usado, antes de ler o que quer que seja).
 *
 * Gravações reais (public/media, ver components/marketing/media.ts):
 *   - desktop: uma por separador; quando uma acaba passa à seguinte, até a
 *     pessoa escolher um separador (aí fica em loop nesse);
 *   - telemóvel: a gravação da plataforma em formato de telemóvel, numa
 *     moldura vertical — o site de desktop em miniatura não se lia, e é do
 *     telemóvel que chega quem vem do Instagram.
 * Só o vídeo visível é carregado e tocado. Com prefers-reduced-motion não há
 * autoplay e aparecem os controlos.
 */
export function HeroVideo({
  items,
  mobile,
}: {
  items: ({ key: string; label: string } & Video)[];
  mobile: Video;
}) {
  const [ativo, setAtivo] = useState(0);
  const [escolhido, setEscolhido] = useState(false);
  const desktopRef = useRef<HTMLVideoElement>(null);
  const mobileRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const ehMovel = window.matchMedia("(max-width: 767px)").matches;
    const v = ehMovel ? mobileRef.current : desktopRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.controls = true;
      return;
    }
    v.preload = "auto";
    v.play().catch(() => {});
  }, [ativo]);

  const it = items[ativo];

  return (
    <>
      {/* telemóvel */}
      <div className="mx-auto w-[min(78vw,320px)] md:hidden">
        <div className="overflow-hidden rounded-[2rem] border-[6px] border-foreground/85 bg-card shadow-[0_30px_60px_-25px_rgb(40_30_10/0.45)]" style={{ aspectRatio: "430 / 764" }}>
          <video
            ref={mobileRef}
            src={mobile.video}
            poster={mobile.poster}
            muted
            playsInline
            loop
            preload="none"
            aria-label={mobile.alt}
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>

      {/* desktop */}
      <div className="hidden md:block">
        <div role="tablist" className="mb-4 flex justify-center gap-2">
          {items.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={i === ativo}
              data-track={`hero_video_${x.key}`}
              onClick={() => {
                setEscolhido(true);
                setAtivo(i);
              }}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                i === ativo
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <MediaFrame alt={it.alt}>
          <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40" style={{ aspectRatio: "16 / 10" }}>
            <video
              key={it.key}
              ref={desktopRef}
              src={it.video}
              poster={it.poster}
              muted
              playsInline
              loop={escolhido}
              preload="none"
              aria-label={it.alt}
              onEnded={() => setAtivo((i) => (i + 1) % items.length)}
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
          </div>
        </MediaFrame>
      </div>
    </>
  );
}
