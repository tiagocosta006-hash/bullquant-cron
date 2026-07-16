"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { LiquidGlass } from "@/components/fx/LiquidGlass";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import type { MediaSource } from "./media";

/**
 * MediaFrame — moldura "browser" em Liquid Glass para os vídeos/fotos
 * do produto. Sem media, renderiza `children` (mock em JSX) — nunca uma
 * caixa vazia. Vídeo: muted/loop/playsInline, autoplay só em viewport;
 * com prefers-reduced-motion não há autoplay e aparecem controlos.
 */
export function MediaFrame({
  media,
  alt,
  aspect = "16 / 10",
  className,
  children,
}: {
  media?: MediaSource | null;
  alt: string;
  /** aspect-ratio CSS reservado quando há vídeo/imagem (evita CLS) */
  aspect?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.controls = true;
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.3 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [media?.video]);

  const hasMedia = Boolean(media?.video || media?.image);

  return (
    <LiquidGlass className={cn("rounded-3xl p-2 sm:p-3", className)}>
      {/* chrome do browser */}
      <div className="flex items-center gap-3 px-3 pb-2 pt-1">
        <span className="flex gap-1.5" aria-hidden>
          <i className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          <i className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
          <i className="h-2.5 w-2.5 rounded-full bg-foreground/12" />
        </span>
        <span className="mx-auto rounded-full border border-border/60 bg-card/50 px-4 py-1 text-[11px] text-muted-foreground">
          {BRAND.domain}
        </span>
        <span className="w-10" aria-hidden />
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40"
        style={hasMedia ? { aspectRatio: aspect } : undefined}
      >
        {media?.video ? (
          <video
            ref={videoRef}
            src={media.video}
            poster={media.poster}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={alt}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : media?.image ? (
          <Image
            src={media.image}
            alt={alt}
            fill
            sizes="(min-width: 1024px) 960px, 100vw"
            className="object-cover"
          />
        ) : (
          children
        )}
      </div>
    </LiquidGlass>
  );
}
