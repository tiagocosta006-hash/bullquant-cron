"use client";

import { BrainCircuit } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import styles from "./AiAnalysisLoading.module.css";

type Props = {
  kind?: "analyst" | "management";
  checking?: boolean;
  ticker?: string;
  className?: string;
};

/** Indeterminate activity: no invented percentages or server-side stages. */
export function AiAnalysisLoading({ kind = "analyst", checking = false, ticker, className }: Props) {
  const t = useTranslations("aiLoading");
  const topics = t.raw(`${kind}.topics`) as string[];

  return (
    <section
      aria-busy="true"
      aria-label={t(`${kind}.label`)}
      className={cn("overflow-hidden rounded-xl border border-border bg-card text-card-foreground", className)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <span className="text-sm font-medium">{t(`${kind}.label`)}</span>
        {ticker && <span className="font-mono text-xs text-muted-foreground">{ticker}</span>}
      </div>

      <div className="px-5 py-7 sm:px-6 sm:py-8">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary", styles.signal)}>
            <BrainCircuit className="size-5" />
          </div>
          <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 space-y-2">
            <h3 className="flex flex-wrap items-center gap-x-2 text-base font-semibold sm:text-lg">
              {checking ? t("checkingTitle") : t("title")}
              <span aria-hidden="true" className={styles.dots}><i /><i /><i /></span>
            </h3>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              {checking ? t("checkingDescription") : t(`${kind}.description`)}
            </p>
          </div>
        </div>

        <div aria-hidden="true" className={cn("relative my-6 h-0.5 overflow-hidden rounded-full bg-muted", styles.track)}>
          <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary" />
        </div>

        <div aria-hidden="true" className="grid gap-6 sm:grid-cols-3">
          {topics.map((topic) => (
            <div key={topic} className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">{topic}</p>
              <div className={cn("space-y-2", styles.skeleton)}>
                <div className="h-2 rounded-full bg-muted" />
                <div className="h-2 w-4/5 rounded-full bg-muted" />
                <div className="h-2 w-3/5 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
          {checking ? t("checkingNote") : t("note")}
        </p>
      </div>
    </section>
  );
}
