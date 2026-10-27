"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Maximize2 } from "lucide-react";
import { MediaFrame } from "../MediaFrame";
import { cn } from "@/lib/utils";
import { MarkLegend, ShotMarks } from "./ShotMarks";
import { ShotLightbox, type LightboxLabels } from "./ShotLightbox";
import { useMediaQuery } from "./useVideoGate";

export type GalleryItem = {
  key: string;
  label: string;
  caption: string;
  alt: string;
  wide: string;
  square: string;
  full: string;
  marksWide: { n: number; text: string; left: string; top: string }[];
  marksSquare: { n: number; text: string; left: string; top: string }[];
  marksFull: { n: number; text: string; left: string; top: string }[];
  fade: { wide: boolean; square: boolean };
  focus: { wide: { cx: number; cy: number }; square: { cx: number; cy: number } };
  slideAria: string;
  dotAria: string;
  counter: string;
};

const FADE_MASK = "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]";

/**
 * "A plataforma por dentro" na versão C: recortes legíveis dos prints em vez
 * do print inteiro a 0,4x. Desktop (≥1024): lista de ecrãs + palco com um
 * recorte 16:10 e marcas numeradas. Abaixo de 1024: carrossel de recortes 1:1
 * para o polegar. Os dois layouts estão no DOM e alternam por CSS; as imagens
 * são lazy, por isso o layout escondido não descarrega nada. Nada roda sozinho.
 * O ecrã inteiro abre num lightbox.
 */
export function ShowcaseGallery({
  items,
  labels,
}: {
  items: GalleryItem[];
  labels: {
    seeFull: string;
    carousel: string;
    carouselRole: string;
    slideRole: string;
    swipeHint: string;
    marksTitle: string;
    lightbox: LightboxLabels;
  };
}) {
  const [active, setActive] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  // Cartão ativo do carrossel: IO com root = faixa (sem listeners de scroll).
  useEffect(() => {
    const root = trackRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setSlide(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    cardRefs.current.forEach((el) => el && io.observe(el));
    const onScroll = () => setSwiped(true);
    root.addEventListener("scroll", onScroll, { once: true, passive: true });
    return () => {
      io.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, []);

  const choose = (i: number) => {
    if (i === active) return;
    setPrev(active);
    setActive(i);
    setHighlight(null);
  };

  const prefetch = (i: number) => {
    const img = new window.Image();
    img.src = items[i].wide;
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = items.length - 1;
    const to =
      e.key === "ArrowDown" ? Math.min(i + 1, last)
      : e.key === "ArrowUp" ? Math.max(i - 1, 0)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (to === null) return;
    e.preventDefault();
    tabRefs.current[to]?.focus();
  };

  const goToSlide = (i: number) => {
    const track = trackRef.current;
    const card = cardRefs.current[i];
    if (!track || !card) return;
    setSwiped(true);
    track.scrollTo({ left: card.offsetLeft - 24, behavior: reduced ? "auto" : "smooth" });
  };

  const onTrackKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowRight") goToSlide(Math.min(slide + 1, items.length - 1));
    else if (e.key === "ArrowLeft") goToSlide(Math.max(slide - 1, 0));
    else return;
    e.preventDefault();
  };

  const it = items[active];

  return (
    <>
      {/* ── Desktop ≥1024: lista + palco ─────────────────────────────── */}
      <div className="hidden grid-cols-12 items-start gap-10 lg:grid">
        <div role="tablist" aria-orientation="vertical" className="col-span-4 space-y-1.5">
          {items.map((x, i) => (
            <div key={x.key}>
              <button
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`shot-tab-${x.key}`}
                aria-selected={i === active}
                aria-controls="shot-panel"
                tabIndex={i === active ? 0 : -1}
                data-track={`inside_tab_${x.key}`}
                onClick={() => choose(i)}
                onKeyDown={(e) => onTabKey(e, i)}
                onMouseEnter={() => prefetch(i)}
                onFocus={() => prefetch(i)}
                className={cn(
                  "relative flex w-full items-baseline gap-3 rounded-xl border px-4 py-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary",
                  i === active
                    ? "border-primary/40 bg-card before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="nums text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-base font-semibold">{x.label}</span>
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
                  i === active ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
                aria-hidden={i !== active}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pb-3 pt-2 text-sm">
                    <p className="text-muted-foreground">{x.caption}</p>
                    <MarkLegend marks={x.marksWide} title={labels.marksTitle} onHover={setHighlight} className="mt-3" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div role="tabpanel" id="shot-panel" aria-labelledby={`shot-tab-${it.key}`} className="col-span-8 lg:sticky lg:top-24">
          <MediaFrame alt={it.alt}>
            <button
              type="button"
              aria-label={`${labels.seeFull}: ${it.label}`}
              data-track={`inside_full_${it.key}`}
              onClick={() => setLightbox(active)}
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-border/50 bg-card/40"
              style={{ aspectRatio: "16 / 10" }}
            >
              {items.map((x, i) =>
                i === active || i === prev ? (
                  // eslint-disable-next-line @next/next/no-img-element -- WebP já pré-dimensionado pelo script
                  <img
                    key={x.key}
                    src={x.wide}
                    alt={i === active ? x.alt : ""}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "absolute inset-0 h-full w-full object-cover transition-opacity duration-250 ease-out motion-reduce:transition-none",
                      i === active ? "opacity-100" : "opacity-0",
                      x.fade.wide && FADE_MASK,
                    )}
                  />
                ) : null,
              )}
              <ShotMarks marks={it.marksWide} size="md" highlight={highlight} />
              <span className="glass-frost absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                {labels.seeFull}
              </span>
            </button>
          </MediaFrame>
        </div>
      </div>

      {/* ── Abaixo de 1024: carrossel para o polegar ─────────────────── */}
      <div className="lg:hidden">
        <div
          ref={trackRef}
          role="region"
          aria-roledescription={labels.carouselRole}
          aria-label={labels.carousel}
          tabIndex={0}
          data-lenis-prevent
          onKeyDown={onTrackKey}
          className="-mx-6 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-px-6 px-6 pb-2 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-scrollbar]:hidden"
        >
          {items.map((x, i) => (
            <article
              key={x.key}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              data-index={i}
              role="group"
              aria-roledescription={labels.slideRole}
              aria-label={x.slideAria}
              onFocus={(e) => {
                if (e.target !== e.currentTarget) (e.target as HTMLElement).closest("article")?.scrollIntoView({ inline: "start", block: "nearest" });
              }}
              className="flex w-[86vw] max-w-[380px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/60 bg-card md:w-[min(46vw,400px)]"
            >
              <button
                type="button"
                aria-label={`${labels.seeFull}: ${x.label}`}
                data-track={`inside_full_${x.key}`}
                onClick={() => setLightbox(i)}
                className="relative block aspect-square w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- WebP já pré-dimensionado pelo script */}
                <img
                  src={x.square}
                  alt={x.alt}
                  loading="lazy"
                  decoding="async"
                  className={cn("absolute inset-0 h-full w-full object-cover", x.fade.square && FADE_MASK)}
                />
                <ShotMarks marks={x.marksSquare} size="sm" />
              </button>
              <div className="p-4">
                <p className="nums text-xs text-muted-foreground">
                  {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </p>
                <h3 className="text-[15px] font-semibold">{x.label}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{x.caption}</p>
                <MarkLegend marks={x.marksSquare} title={labels.marksTitle} className="mt-3 text-[13px]" />
              </div>
              <button
                type="button"
                onClick={() => setLightbox(i)}
                data-track={`inside_full_${x.key}`}
                className="mx-4 mb-4 mt-auto flex min-h-11 w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-xl border border-border/70 text-sm font-medium"
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
                {labels.seeFull}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="nums w-16 text-[13px]" aria-live={swiped ? "polite" : "off"}>
            {items[slide].counter}
          </span>
          <div className="flex">
            {items.map((x, i) => (
              <button
                key={x.key}
                type="button"
                aria-label={x.dotAria}
                aria-current={i === slide ? "true" : undefined}
                data-track={`inside_dot_${i + 1}`}
                onClick={() => goToSlide(i)}
                className="grid h-11 w-6 place-items-center"
              >
                <span
                  className={cn(
                    "h-2 rounded-full transition-[width] duration-200 motion-reduce:transition-none",
                    i === slide ? "w-5 bg-primary" : "w-2 bg-foreground/20",
                  )}
                />
              </button>
            ))}
          </div>
          <span className={cn("w-16 text-right text-xs text-muted-foreground", swiped && "invisible")} aria-hidden>
            {labels.swipeHint} →
          </span>
        </div>
      </div>

      <ShotLightbox items={items} index={lightbox} onIndexChange={setLightbox} onClose={() => setLightbox(null)} labels={labels.lightbox} />
    </>
  );
}
