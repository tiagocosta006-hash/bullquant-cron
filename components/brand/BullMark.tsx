import { cn } from "@/lib/utils";

/**
 * BullMark — the Bullocracy / BullVision app mark.
 *
 * A simplified, single-colour reinterpretation of the master Bullocracy logo:
 * a bull head (horns + face) resting on a chess-piece / rook pedestal, evoking
 * the union of "bull market" + "rook = fortress = margin of safety".
 *
 * Single `currentColor` fill so it themes anywhere (gold on near-black, or any
 * foreground). Eyes are punched through with `evenodd` so the background shows
 * through — keeping the mark legible on any surface.
 */
export function BullMark({
  className,
  title = "Bullocracy",
  ...props
}: React.SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      fill="currentColor"
      className={cn("h-6 w-6", className)}
      {...props}
    >
      <title>{title}</title>

      {/* Circle outline */}
      <circle cx="26" cy="26" r="22" fill="none" stroke="currentColor" strokeWidth="2.5" />

      {/* Bull head (scaled and positioned inside the circle) */}
      <g transform="translate(1, -5) scale(0.75)">
        {/* Left horn */}
        <path d="M23 19C16 17 9 15 4 9C7 14 12 18 26 24Z" />
        {/* Right horn */}
        <path d="M41 19C48 17 55 15 60 9C57 14 52 18 38 24Z" />
        {/* Ears */}
        <path d="M20 28 14 29 19 33Z" />
        <path d="M44 28 50 29 45 33Z" />
        {/* Head + eyes */}
        <path fillRule="evenodd" clipRule="evenodd" d="M24 21C18 23 17 29 20 34C22 39 26 43 30 44.5C31.5 45.2 32.5 45.2 34 44.5C38 43 42 39 44 34C47 29 46 23 40 21C35 19 29 19 24 21ZM24.3 30.6a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0ZM36.1 30.6a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0Z" />
        {/* Neck rings */}
        <rect x="25" y="47" width="14" height="2" rx="1" />
        <rect x="22" y="51" width="20" height="2.5" rx="1.2" />
        <rect x="18" y="56" width="28" height="3" rx="1.5" />
      </g>

      {/* Background mask to cut the circle where the arrow and bars are */}
      <path d="M 22 52 L 32 40 L 40 48 L 56 22 L 64 22 L 64 64 L 22 64 Z" fill="var(--background, #000)" opacity="0.8" className="bull-mask" />

      {/* The three vertical bars (bottom right) */}
      <rect x="42" y="42" width="5" height="14" fill="currentColor" rx="1" />
      <rect x="49" y="34" width="5" height="22" fill="currentColor" rx="1" />
      <rect x="56" y="24" width="5" height="32" fill="currentColor" rx="1" />

      {/* The rising arrow (starts bottom left of circle, zig-zags up-right) */}
      <path d="M 20 48 L 32 36 L 40 44 L 54 22" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="48,22 58,16 54,28" fill="currentColor" />
    </svg>
  );
}
