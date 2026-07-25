import { Link } from '@/i18n/routing';
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { MarqueeViewport } from "@/components/fx/MarqueeViewport";
import { formatPercent, formatPrice } from "@/lib/finance/format";
import type { TickerItem } from "@/lib/marketing/ticker";
import { cn } from "@/lib/utils";

/**
 * TickerMarquee — fita de terminal (ambient motion). Usada no rodapé do hero
 * da landing E no topo da dashboard da app (app/(app)/dashboard/page.tsx) —
 * não introduzir aqui dependências específicas de marketing.
 * Continua Server Component: os itens são renderizados no servidor e passam
 * como children ao MarqueeViewport (cliente), que possui a casca e trava a
 * fita SUAVEMENTE em hover interpolando o playbackRate. A animação em si é
 * CSS (`.marquee` em globals.css) e desliga com prefers-reduced-motion.
 * A lista é renderizada duas vezes (a cópia é aria-hidden) para o loop -50%.
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
        <Link
          key={`${hidden ? "b" : "a"}-${item.ticker}`}
          href={`/stock/${item.ticker}`}
          aria-hidden={hidden || undefined}
          tabIndex={hidden ? -1 : undefined}
          className="mr-12 inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
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
        </Link>
      );
    });

  return (
    <MarqueeViewport label={label} durationSec={items.length * 4}>
      {row(false)}
      {row(true)}
    </MarqueeViewport>
  );
}
