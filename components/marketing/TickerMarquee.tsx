import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { formatPercent, formatPrice } from "@/lib/finance/format";
import type { TickerItem } from "@/lib/marketing/ticker";
import { cn } from "@/lib/utils";

/**
 * TickerMarquee — fita de terminal no rodapé do hero (ambient motion).
 * Server Component: a animação é 100% CSS (`.marquee` em globals.css),
 * pausa em hover e desliga com prefers-reduced-motion. A lista é
 * renderizada duas vezes (a cópia é aria-hidden) para o loop -50%.
 * Cada ticker leva uma mini-sparkline determinística (SSR estável,
 * igual nas duas cópias) — verde/vermelho é a semântica real do dia.
 */
function sparkPts(seed: string, up: boolean): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 997;
  return Array.from({ length: 9 }, (_, i) => {
    h = (h * 137 + 71) % 997;
    const jitter = (h / 997) * 6 - 3;
    return (up ? 13 - i * 0.9 : 5 + i * 0.9) + jitter;
  });
}

export function TickerMarquee({ items, label }: { items: TickerItem[]; label: string }) {
  if (items.length === 0) return null;

  const row = (hidden: boolean) =>
    items.map((item) => {
      const up = (item.changePct ?? 0) >= 0;
      return (
        <span
          key={`${hidden ? "b" : "a"}-${item.ticker}`}
          aria-hidden={hidden || undefined}
          className="mr-12 inline-flex items-center gap-2.5"
        >
          <CompanyLogo src={item.logoUrl} alt="" fallback={item.ticker} size={22} className="rounded-md" />
          <span className="text-sm font-semibold">{item.ticker}</span>
          <svg
            viewBox="0 0 40 16"
            className={cn("h-4 w-10", up ? "text-bull" : "text-bear")}
            aria-hidden
          >
            <polyline
              points={sparkPts(item.ticker, up)
                .map((y, i) => `${i * 5},${y.toFixed(1)}`)
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity="0.85"
            />
          </svg>
          <span className="nums text-sm text-muted-foreground">{formatPrice(item.close)}</span>
          {item.changePct !== null && (
            <span className={cn("nums text-xs font-semibold", up ? "text-bull" : "text-bear")}>
              {up ? "▲" : "▼"} {formatPercent(Math.abs(item.changePct), 2)}
            </span>
          )}
        </span>
      );
    });

  return (
    <div aria-label={label} className="marquee marquee-band w-full py-4">
      <div
        className="marquee-track flex items-center"
        style={{ "--marquee-duration": `${items.length * 4}s` } as React.CSSProperties}
      >
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
