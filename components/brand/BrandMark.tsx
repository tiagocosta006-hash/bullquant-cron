"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { BullMark } from "./BullMark";

/**
 * BrandMark — renders the official Bullocracy bull-rook logo image
 * (`BRAND.logoSrc` in /public/brand/). If the file is missing/broken, it
 * gracefully falls back to the inline SVG mark so the UI never shows a broken
 * image. Drop the real logo at the configured path and it appears everywhere.
 */
export function BrandMark({
  className,
  title = BRAND.name,
}: {
  className?: string;
  title?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (errored || !BRAND.logoSrc) {
    return <BullMark className={className} title={title} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.logoSrc}
      alt={title}
      className={cn("object-contain", className)}
      onError={() => setErrored(true)}
    />
  );
}
