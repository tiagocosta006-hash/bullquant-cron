"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ShotLightbox, type LightboxLabels } from "../showcase/ShotLightbox";
import type { GalleryItem } from "../showcase/ShowcaseGallery";

const OpenShot = createContext<(i: number) => void>(() => {});

/**
 * Lightbox partilhado pelas linhas de "três perguntas" da versão B. As linhas
 * continuam Server Components (children); só este provider e os botões que o
 * abrem vão para o cliente.
 */
export function JobsZoomProvider({
  items,
  labels,
  children,
}: {
  items: GalleryItem[];
  labels: LightboxLabels;
  children: ReactNode;
}) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <OpenShot.Provider value={setIndex}>
      {children}
      <ShotLightbox items={items} index={index} onIndexChange={setIndex} onClose={() => setIndex(null)} labels={labels} />
    </OpenShot.Provider>
  );
}

export function ZoomTrigger({
  index,
  ariaLabel,
  track,
  className,
  children,
}: {
  index: number;
  ariaLabel?: string;
  track: string;
  className?: string;
  children: ReactNode;
}) {
  const open = useContext(OpenShot);
  return (
    <button type="button" aria-label={ariaLabel} data-track={track} onClick={() => open(index)} className={className}>
      {children}
    </button>
  );
}
