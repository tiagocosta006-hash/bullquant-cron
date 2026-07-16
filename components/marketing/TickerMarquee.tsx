import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { formatPercent, formatPrice } from "@/lib/finance/format";
import type { TickerItem } from "@/lib/marketing/ticker";
import { cn } from "@/lib/utils";

/**
 * TickerMarquee — fita de fechos EOD no rodapé do hero (ambient motion).
 * Server Component: a animação é 100% CSS (`.marquee` em globals.css),
 * pausa em hover e desliga com prefers-reduced-motion. A lista é
 * renderizada duas vezes (a cópia é aria-hidden) para o loop -50%.
 */
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
    <div aria-label={label} className="marquee w-full py-4">
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
