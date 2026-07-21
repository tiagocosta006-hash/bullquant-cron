"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * SectionBackdrop — o fundo da landing é UM palco fixo full-screen que
 * muda de ambiente por cross-fade conforme a secção ativa (em vez de
 * cada secção transportar a sua banda no scroll). As secções marcam-se
 * com data-backdrop="<key>"; um IntersectionObserver com rootMargin ao
 * centro do viewport decide o ambiente ativo.
 *
 * TEM de viver FORA do #marketing-wrap (o rubber-band do InertiaScroll
 * aplica transform ao wrap e partiria o position:fixed — mesma razão do
 * ContourCanvas). Sem JS/reduced-motion fica o ambiente neutro estático.
 */
export type BackdropKey =
  | "paper"
  | "stage"
  | "sunken"
  | "grid"
  | "rings"
  | "dots"
  | "paper-grid"
  | "gold"
  | "closing";

const LAYERS: Record<BackdropKey, string> = {
  paper: "",
  stage: "bg-card/40 motif-stage",
  sunken: "bg-secondary/50",
  grid: "bg-card/40 motif-grid",
  rings: "bg-card/40 motif-rings",
  dots: "bg-card/40 motif-dots",
  "paper-grid": "motif-grid",
  gold: "bg-primary/[0.04] motif-grid",
  closing: "bg-secondary/50 motif-stage",
};

export function SectionBackdrop() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname !== "/") return;
    const root = rootRef.current;
    if (!root) return;

    const layers = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>("[data-layer]").forEach((el) => {
      layers.set(el.dataset.layer!, el);
    });

    let active = "paper";
    const setActive = (key: string) => {
      if (key === active || !layers.has(key)) return;
      layers.get(active)?.removeAttribute("data-active");
      layers.get(key)?.setAttribute("data-active", "");
      active = key;
    };
    layers.get("paper")?.setAttribute("data-active", "");

    // a secção que cruza a faixa central do viewport ganha o palco
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const key = (e.target as HTMLElement).dataset.backdrop;
            if (key) setActive(key);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    const sections = document.querySelectorAll<HTMLElement>("[data-backdrop]");
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {(Object.keys(LAYERS) as BackdropKey[]).map((key) => (
        <div
          key={key}
          data-layer={key}
          className={cn("backdrop-layer absolute inset-0", LAYERS[key])}
        />
      ))}
    </div>
  );
}
