import { ArrowRight, CalendarX, ReceiptText, RotateCcw } from "lucide-react";
import { Link } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICONS = { cancel: CalendarX, withdrawal: RotateCcw, vat: ReceiptText };

/**
 * Condições da subscrição por baixo dos planos (versão B) e a caixa "ainda a
 * decidir?" com a única página que abre sem conta (a Apple), dizendo ao certo
 * o que se vê lá e o que fica para o PRO.
 */
export function BuyingFacts({
  label,
  facts,
  peekTitle,
  peekBody,
  peekCta,
}: {
  label: string;
  facts: { icon: keyof typeof ICONS; text: string }[];
  peekTitle: string;
  peekBody: string;
  peekCta: string;
}) {
  return (
    <>
      <ul aria-label={label} className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {facts.map(({ icon, text }) => {
          const Icon = ICONS[icon];
          return (
            <li key={icon} className="flex gap-3 text-sm text-muted-foreground">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/60" aria-hidden />
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border/60 bg-card/50 p-5 md:flex md:items-center md:justify-between md:gap-6 md:p-6">
        <div>
          <p className="font-semibold">{peekTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{peekBody}</p>
        </div>
        <Link
          href="/stock/AAPL"
          data-track="b_pricing_peek"
          className={cn(buttonVariants({ variant: "outline" }), "pressable mt-4 min-h-11 w-full shrink-0 md:mt-0 md:w-auto")}
        >
          {peekCta}
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
