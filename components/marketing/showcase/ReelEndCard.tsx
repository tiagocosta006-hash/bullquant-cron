import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cartão final do vídeo do hero (versão C): no momento de maior intenção,
 * em vez de voltar a correr, oferece outra empresa sem conta ou o registo.
 * Renderizado no servidor e passado ao leitor como slot.
 */
export function ReelEndCard({
  title,
  lead,
  tickers,
  cta,
}: {
  title: string;
  lead: string;
  tickers: { ticker: string; aria: string }[];
  cta: string;
}) {
  return (
    <div>
      <h3 data-end-title tabIndex={-1} className="text-lg font-extrabold tracking-tight outline-none">
        {title}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{lead}</p>
      <div className="mt-3 flex justify-center gap-2">
        {tickers.map(({ ticker, aria }) => (
          <Link
            key={ticker}
            href={`/stock/${ticker}`}
            aria-label={aria}
            data-track={`hero_reel_end_${ticker}`}
            className="nums inline-flex min-h-11 items-center rounded-full border border-border/70 bg-card/70 px-3.5 font-mono text-sm font-semibold hover:border-primary/60"
          >
            {ticker}
          </Link>
        ))}
      </div>
      <Link
        href="/register"
        data-track="hero_reel_end_register"
        className={cn(buttonVariants({ size: "lg" }), "pressable cta-sheen mt-4 min-h-12 w-full px-6 font-semibold md:w-auto")}
      >
        {cta}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Link>
    </div>
  );
}
