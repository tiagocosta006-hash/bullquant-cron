"use client";

import { useTranslations } from "next-intl";
import { Calendar, TrendingUp, DollarSign } from "lucide-react";
import { formatLargeNumber } from "@/lib/finance/format";
import { GlossaryTooltip } from "@/components/ui/glossary-tooltip";

type LatestResultsProps = {
  fiscalYear: number;
  fiscalQuarter: number;
  date: string; // ISO (YYYY-MM-DD)
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  currencySymbol?: string;
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Verde se bateu a estimativa, vermelho se falhou — mesma convenção do
// EarningsCalendar (beat = actual >= estimate).
function ActualValue({
  estimate,
  actual,
  format,
}: {
  estimate: number | null;
  actual: number | null;
  format: (v: number) => string;
}) {
  if (actual === null) return <span className="text-muted-foreground">---</span>;
  const beat = estimate !== null ? actual >= estimate : null;
  const color = beat === null ? "text-foreground" : beat ? "text-bull" : "text-bear";
  return <span className={`font-bold ${color}`}>{format(actual)}</span>;
}

export function LatestResults({
  fiscalYear,
  fiscalQuarter,
  date,
  epsEstimate,
  epsActual,
  revenueEstimate,
  revenueActual,
  currencySymbol = "$",
}: LatestResultsProps) {
  const t = useTranslations("stock.earnings");

  return (
    <div className="glass flex flex-col gap-4 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("title")}
          </h3>
          <p className="text-lg font-bold tracking-tight">
            Q{fiscalQuarter} {fiscalYear} – {formatDate(date)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <GlossaryTooltip slug="eps-diluted">{t("eps")}</GlossaryTooltip>
          </span>
          <span className="text-sm text-muted-foreground">
            {t("estimate")}: {epsEstimate !== null ? epsEstimate.toFixed(2) : "---"}
          </span>
          <ActualValue estimate={epsEstimate} actual={epsActual} format={(v) => v.toFixed(2)} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <GlossaryTooltip slug="revenue">{t("revenue")}</GlossaryTooltip>
          </span>
          <span className="text-sm text-muted-foreground">
            {t("estimate")}: {revenueEstimate !== null ? formatLargeNumber(revenueEstimate, currencySymbol) : "---"}
          </span>
          <ActualValue
            estimate={revenueEstimate}
            actual={revenueActual}
            format={(v) => formatLargeNumber(v, currencySymbol)}
          />
        </div>
      </div>
    </div>
  );
}
