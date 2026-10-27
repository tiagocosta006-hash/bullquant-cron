"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { MediaFrame } from "./MediaFrame";
import { cn } from "@/lib/utils";

/**
 * "A plataforma por dentro": prints REAIS da plataforma (public/media/plataforma,
 * capturados em tema claro com a conta de testes), um por separador.
 *
 * As stories da landing são réplicas animadas; isto é o contrário — o ecrã
 * tal e qual, para quem quer ver o produto antes de subscrever. Roda sozinho
 * a cada 5 s até a pessoa escolher um separador (e nunca com
 * prefers-reduced-motion). As imagens estão todas montadas e trocam por
 * opacidade, para não haver salto de layout nem carregamento a meio.
 */
export function PlatformInside({
  items,
}: {
  items: { key: string; label: string; caption: string; src: string; alt: string }[];
}) {
  const [ativo, setAtivo] = useState(0);
  const [automatico, setAutomatico] = useState(true);

  useEffect(() => {
    if (!automatico) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setAtivo((i) => (i + 1) % items.length), 5000);
    return () => clearInterval(id);
  }, [automatico, items.length]);

  const escolher = (i: number) => {
    setAutomatico(false);
    setAtivo(i);
  };

  return (
    <div>
      <div role="tablist" className="mx-auto mb-6 flex max-w-full flex-wrap justify-center gap-2">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={i === ativo}
            data-track={`inside_${it.key}`}
            onClick={() => escolher(i)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              i === ativo
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/60 bg-card/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        ))}
      </div>

      <MediaFrame alt={items[ativo].alt}>
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/40" style={{ aspectRatio: "16 / 10" }}>
          {items.map((it, i) => (
            <Image
              key={it.key}
              src={it.src}
              alt={it.alt}
              fill
              sizes="(min-width: 1024px) 1100px, 100vw"
              className={cn(
                "object-cover object-top transition-opacity duration-500 motion-reduce:transition-none",
                i === ativo ? "opacity-100" : "opacity-0",
              )}
              aria-hidden={i !== ativo}
              priority={i === 0}
            />
          ))}
        </div>
      </MediaFrame>

      <p className="mx-auto mt-5 max-w-[60ch] text-center text-sm leading-relaxed text-muted-foreground" aria-live="polite">
        {items[ativo].caption}
      </p>
    </div>
  );
}
