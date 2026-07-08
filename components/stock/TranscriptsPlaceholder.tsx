"use client";

import { MessageSquareText, HardHat } from "lucide-react";
import { useTranslations } from "next-intl";

export function TranscriptsPlaceholder() {
  const t = useTranslations("transcripts");

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm overflow-hidden relative">
      {/* "In Development" badge */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
        <HardHat className="h-3.5 w-3.5" />
        {t("inDevelopment")}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border/60 bg-muted/30">
        <MessageSquareText className="h-10 w-10 text-muted-foreground/30 mb-3" />
        <h3 className="text-sm font-semibold text-foreground mb-1">
          {t("placeholderTitle")}
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm">
          {t("placeholderDesc")}
        </p>
      </div>
    </div>
  );
}
