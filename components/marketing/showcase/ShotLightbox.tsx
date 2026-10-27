"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkLegend, ShotMarks } from "./ShotMarks";
import type { GalleryItem } from "./ShowcaseGallery";
import { useMediaQuery } from "./useVideoGate";

export type LightboxLabels = {
  titles: string[];
  counters: string[];
  close: string;
  prev: string;
  next: string;
  fit: string;
  actual: string;
  hintTouch: string;
};

/**
 * Ecrã inteiro de um print (versão C). Só monta, e só descarrega o
 * `{k}-full.webp`, quando abre. Rato: ajustado ao ecrã, com "Ver a 100%".
 * Toque: o print a ~0,4x num contentor com scroll e pinch nativo, que abre
 * centrado no recorte que se estava a ver. Sem swipe para navegar (o swipe é
 * o pan da imagem): ‹ › nos botões e nas setas do teclado.
 */
export function ShotLightbox({
  items,
  index,
  onIndexChange,
  onClose,
  labels,
}: {
  items: GalleryItem[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  labels: LightboxLabels;
}) {
  const open = index !== null;
  const coarse = useMediaQuery("(pointer: coarse)");
  const [actual, setActual] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  const hint = !hintGone;
  const setHint = (v: boolean) => setHintGone(!v);

  // A dica some no primeiro toque ou ao fim de 4 s; volta na próxima abertura.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => setHintGone(true), 4000);
    return () => clearTimeout(id);
  }, [open]);

  const zoomed = coarse || actual;
  const it = index !== null ? items[index] : null;

  // Scroll inicial centrado no recorte que se estava a ver. Ref de callback
  // porque o popup monta depois de `open` mudar; a key remonta-o por ecrã.
  const centerOnShot = (el: HTMLDivElement | null) => {
    const img = el?.firstElementChild as HTMLElement | null;
    if (!el || !img || !it) return;
    const f = coarse ? it.focus.square : it.focus.wide;
    el.scrollLeft = f.cx * img.offsetWidth - el.clientWidth / 2;
    el.scrollTop = f.cy * img.offsetHeight - el.clientHeight / 2;
  };

  // Prefetch do seguinte.
  useEffect(() => {
    if (index === null) return;
    const img = new window.Image();
    img.src = items[(index + 1) % items.length].full;
  }, [index, items]);

  const go = (d: number) => {
    if (index === null) return;
    onIndexChange((index + d + items.length) % items.length);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => {
        if (o) return;
        setHintGone(false);
        setActual(false);
        onClose();
      }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          data-lenis-prevent
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            else if (e.key === "ArrowLeft") go(-1);
          }}
          className="fixed inset-0 z-[60] flex flex-col bg-background/95 outline-none backdrop-blur-sm"
        >
          {it && index !== null && (
            <>
              <div className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
                <DialogPrimitive.Title className="text-sm font-semibold">{labels.titles[index]}</DialogPrimitive.Title>
                <span className="nums text-sm text-muted-foreground">{labels.counters[index]}</span>
                {!coarse && (
                  <button
                    type="button"
                    onClick={() => setActual((a) => !a)}
                    className="ml-auto rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium hover:bg-card"
                  >
                    {actual ? labels.fit : labels.actual}
                  </button>
                )}
                <DialogPrimitive.Close
                  aria-label={labels.close}
                  className={cn("grid h-11 w-11 place-items-center rounded-full hover:bg-card", coarse && "ml-auto")}
                >
                  <X className="h-5 w-5" aria-hidden />
                </DialogPrimitive.Close>
              </div>

              <div className="relative min-h-0 flex-1">
                {zoomed ? (
                  <div
                    key={it.key}
                    ref={centerOnShot}
                    onPointerDown={() => setHint(false)}
                    className="absolute inset-0 overflow-auto overscroll-contain [touch-action:pan-x_pan-y_pinch-zoom]"
                  >
                    <div className="relative" style={{ width: coarse ? "max(200vw, 760px)" : 1920, aspectRatio: "16 / 10" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- WebP do print inteiro, sem otimização do Next */}
                      <img src={it.full} alt={it.alt} className="absolute inset-0 h-full w-full" />
                      <ShotMarks marks={it.marksFull} size="md" />
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 grid place-items-center p-4">
                    <div className="relative" style={{ width: "min(92vw, calc((100dvh - 15rem) * 1.6))", aspectRatio: "16 / 10" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- WebP do print inteiro, sem otimização do Next */}
                      <img src={it.full} alt={it.alt} className="absolute inset-0 h-full w-full rounded-lg border border-border/50 bg-card object-contain" />
                      <ShotMarks marks={it.marksFull} size="md" />
                    </div>
                  </div>
                )}
                {coarse && hint && (
                  <p className="glass-frost pointer-events-none absolute inset-x-4 top-3 mx-auto w-fit rounded-full px-3 py-1.5 text-center text-xs text-muted-foreground">
                    {labels.hintTouch}
                  </p>
                )}
              </div>

              <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                <p className="line-clamp-2 text-sm text-muted-foreground">{it.caption}</p>
                <MarkLegend marks={it.marksFull} className="mt-2 text-[13px]" />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={labels.prev}
                    onClick={() => go(-1)}
                    className="grid h-12 w-12 place-items-center rounded-xl border border-border/70 hover:bg-card"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden />
                  </button>
                  <DialogPrimitive.Close className="h-12 flex-1 rounded-xl border border-border/70 text-sm font-medium hover:bg-card">
                    {labels.close}
                  </DialogPrimitive.Close>
                  <button
                    type="button"
                    aria-label={labels.next}
                    onClick={() => go(1)}
                    className="grid h-12 w-12 place-items-center rounded-xl border border-border/70 hover:bg-card"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
