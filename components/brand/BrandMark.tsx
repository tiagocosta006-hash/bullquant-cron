"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * BrandMark — renders the official Bullocracy bull-rook logo image
 * (`BRAND.logoSrc` in /public/brand/). If the file is missing/broken, it
 * gracefully falls back to the inline SVG mark so the UI never shows a broken
 * image. Drop the real logo at the configured path and it appears everywhere.
 */
export function BrandMark({
  className,
}: {
  className?: string;
  title?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (errored || !BRAND.logoSrc) {
    return null; // The old fallback logo was deleted as per user request
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.logoSrc}
      alt=""
      aria-hidden="true"
      // rounded proporcional: o PNG tem fundo preto retangular — sem isto os
      // cantos aparecem a 90° enquanto a arte é arredondada
      className={cn("rounded-[22%] object-contain", className)}
      onError={() => setErrored(true)}
    />
  );
}
