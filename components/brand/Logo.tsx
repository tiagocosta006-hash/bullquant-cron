import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import { BrandMark } from "./BrandMark";

const SIZES = {
  sm: { mark: "h-6 w-6", text: "text-base", gap: "gap-1.5" },
  md: { mark: "h-7 w-7", text: "text-lg", gap: "gap-2" },
  lg: { mark: "h-9 w-9", text: "text-2xl", gap: "gap-2.5" },
} as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  /** Render mark only (no wordmark). */
  iconOnly?: boolean;
  /** Show "by Bullocracy" under the wordmark. */
  showParent?: boolean;
  /** Wrap in a link to `href` (omit for a static logo). */
  href?: string;
  className?: string;
}

/**
 * BullVision logo lockup — gold bull mark + wordmark ("Bull" neutral, "Vision"
 * gold). Single source of truth in `lib/brand.ts`.
 */
export function Logo({
  size = "md",
  iconOnly = false,
  showParent = false,
  href,
  className,
}: LogoProps) {
  const s = SIZES[size];
  const [head, accent] = BRAND.nameParts;

  const inner = (
    <span className={cn("flex items-center", s.gap, className)}>
      <BrandMark className={cn(s.mark, "text-primary shrink-0")} title={BRAND.name} />
      {!iconOnly && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-heading font-extrabold tracking-tight text-foreground",
              s.text,
            )}
          >
            {head}
            <span className="text-primary">{accent}</span>
          </span>
          {showParent && (
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              by {BRAND.parent}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center" aria-label={BRAND.name}>
        {inner}
      </Link>
    );
  }
  return inner;
}
