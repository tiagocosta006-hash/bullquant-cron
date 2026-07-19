import { ArrowUpRight, Search } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { LiveSpark } from "@/components/marketing/LiveSpark";
import { cn } from "@/lib/utils";

/**
 * TerminalMock — mock da app para dentro do MediaFrame enquanto não há
 * vídeo real (tickers/números são dados de exemplo, não UI). O preço e
 * a sparkline ganham vida via LiveSpark (client); o resto é estático.
 * Substituído automaticamente quando LANDING_MEDIA.showcaseTerminal
 * apontar para um ficheiro em public/media/.
 */

export function TerminalMock({
  liveLabel,
  aiChipLabel,
}: {
  /** pill "Em direto" junto ao nome (i18n via page) */
  liveLabel?: string;
  /** chip AI Brief da cena 3 do showcase (i18n via page) */
  aiChipLabel?: string;
}) {
  return (
    <div className="relative p-4 sm:p-6">
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
            <div className="flex items-center text-sm font-semibold">
              Apple Inc. <span className="ml-1 text-muted-foreground">· AAPL</span>
              {liveLabel ? (
                <span className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <i className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
                  {liveLabel}
                </span>
              ) : null}
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <LiveSpark />
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
              {/* cena 2 do showcase: histograma cresce preso ao scroll */}
              <div aria-hidden className="mt-2 flex h-6 items-end gap-1">
                {[40, 55, 48, 72, 100].map((h, i) => (
                  <span
                    key={i}
                    data-scene-bar
                    style={{ height: `${h}%` }}
                    className="w-1.5 origin-bottom rounded-sm bg-primary/60"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* cena 3 do showcase: chip AI Brief sobe do fundo do mock */}
      {aiChipLabel ? (
        <div data-scene="3" className="glass absolute inset-x-6 bottom-4 hidden rounded-2xl p-4 sm:block">
          <span className="flex items-center gap-2 text-xs font-semibold text-primary">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            {aiChipLabel}
          </span>
          <div className="mt-2 h-2 w-3/4 rounded bg-foreground/10" />
          <div className="mt-1.5 h-2 w-1/2 rounded bg-foreground/10" />
        </div>
      ) : null}
    </div>
  );
}
