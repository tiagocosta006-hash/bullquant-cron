import { ArrowUpRight, Search } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";

/**
 * TerminalMock — mock estático da app para dentro do MediaFrame enquanto
 * não há vídeo real (tickers/números são dados de exemplo, não UI).
 * Substituído automaticamente quando LANDING_MEDIA.showcaseTerminal
 * apontar para um ficheiro em public/media/.
 */
const DEMO_SPARK =
  "M0 34 L20 30 L40 31 L60 24 L80 26 L100 18 L120 20 L140 12 L160 14 L180 7 L200 4";

export function TerminalMock() {
  return (
    <div className="p-4 sm:p-6">
      {/* pill de navegação do mock */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg" />
          <div className="hidden gap-1 sm:flex">
            {["Dashboard", "Screener", "Portfólio"].map((x, i) => (
              <span
                key={x}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  i === 0 ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
              >
                {x}
              </span>
            ))}
          </div>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> AAPL{" "}
          <kbd className="rounded border border-border px-1 text-[9px]">⌘K</kbd>
        </span>
      </div>

      {/* cabeçalho da empresa + sparkline */}
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">
                Apple Inc. <span className="text-muted-foreground">· AAPL</span>
              </div>
              <div className="nums mt-2 text-4xl font-bold tracking-tight">227,34 $</div>
              <div className="nums mt-1 text-sm font-semibold text-bull">▲ +1,86 (+0,82%)</div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <svg
            viewBox="0 0 200 40"
            preserveAspectRatio="none"
            className="mt-4 h-12 w-full"
            aria-hidden="true"
          >
            <path d={`${DEMO_SPARK} L200 40 L0 40 Z`} fill="var(--primary)" opacity="0.12" />
            <path
              d={DEMO_SPARK}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* métricas */}
        <div className="grid grid-cols-2 gap-4">
          {[
            ["Revenue TTM", "394,3 B"],
            ["FCF", "108,8 B"],
            ["ROIC", "56,2%"],
            ["Margem", "46,2%"],
          ].map(([k, v]) => (
            <div key={k} className="glass rounded-2xl p-4">
              <div className="text-xs font-medium text-muted-foreground">{k}</div>
              <div className="nums mt-1.5 text-xl font-bold tracking-tight">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
