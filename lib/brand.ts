/**
 * BullVision — brand single source of truth.
 *
 * Product: BullVision · Parent studio: Bullocracy.
 * Changing the product name = edit `name` + `nameParts` here only.
 */
export const BRAND = {
  name: "BullVision",
  /** Wordmark split: [neutral part, gold-accent part]. */
  nameParts: ["Bull", "Vision"] as const,
  /** Parent studio shown in footers / "by Bullocracy". */
  parent: "Bullocracy",
  /** Signature gold (matches the bull mark). */
  gold: "#E4AA33",
  domain: "thebullvision.com",
  siteUrl: "https://thebullvision.com",
  /**
   * Official Bullocracy bull-rook logo (raster/vector in /public/brand/).
   * Drop the real file here and it renders everywhere via <BrandMark/>.
   * Until the file exists, <BrandMark/> falls back to the inline SVG mark.
   */
  logoSrc: "/brand/logo.svg",
} as const;
