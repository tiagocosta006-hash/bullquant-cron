"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

/**
 * CalendarReplica — mock fiel de components/calendar/EarningsCalendar.tsx:
 * toolbar (segmenteds Dia/Semana/Mês + Todas/Watchlist/Portefólio) + grelha
 * mensal 7-col + HourGroup + EventChip (beat/miss). Sem fetch, hardcoded.
 */

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

// 2 semanas (14 dias) em vez do mês inteiro — o cartão do bento tem de ficar
// compacto e alinhado em altura com as outras 3 réplicas.
const DAYS = 14;

type MockEvent = { day: number; ticker: string; beat: boolean | null };
const EVENTS: MockEvent[] = [
  { day: 3, ticker: "AAPL", beat: true },
  { day: 8, ticker: "MSFT", beat: true },
  { day: 8, ticker: "GOOGL", beat: false },
  { day: 11, ticker: "AMZN", beat: null },
  { day: 14, ticker: "NVDA", beat: null },
];

export function CalendarReplica({
  labels,
}: {
  labels: {
    day: string;
    week: string;
    month: string;
    scopeAll: string;
    scopeWatchlist: string;
    scopePortfolio: string;
    others: string;
  };
}) {
  const byDay = new Map<number, MockEvent[]>();
  EVENTS.forEach((e) => byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]));

  return (
    <div className="mt-5 space-y-3">
      {/* toolbar — cópia fiel de EarningsCalendar.tsx */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
            {labels.day}
          </span>
          <span className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">{labels.week}</span>
          <span className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">{labels.month}</span>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
            {labels.scopeAll}
          </span>
          <span className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {labels.scopeWatchlist}
          </span>
          <span className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {labels.scopePortfolio}
          </span>
        </div>
      </div>

      {/* grelha de 2 semanas — mesmo chrome da vista de calendário real */}
      <div className="glass overflow-hidden rounded-xl">
        <div className="grid grid-cols-7 bg-muted/50">
          {WEEKDAYS.map((w) => (
            <div key={w} className="p-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: DAYS }, (_, i) => i + 1).map((day) => {
            const events = byDay.get(day) ?? [];
            return (
              <div key={day} className="min-h-[3.25rem] border-t border-l border-border p-1">
                <div className="mb-1 text-[11px] text-muted-foreground">{day}</div>
                <div className="space-y-0.5">
                  {events.map((e) => (
                    <div key={e.ticker} className="flex items-center gap-1 truncate text-[10px] font-semibold">
                      <CompanyLogo src={null} alt={e.ticker} fallback={e.ticker} size={12} className="rounded-[2px]" />
                      <span className="truncate">{e.ticker}</span>
                      {e.beat !== null &&
                        (e.beat ? (
                          <TrendingUp className="h-2.5 w-2.5 shrink-0 text-bull" />
                        ) : (
                          <TrendingDown className="h-2.5 w-2.5 shrink-0 text-bear" />
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* HourGroup — badge de contagem, label "Outros" */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        {labels.others}
        <span className={cn("ml-auto rounded-sm bg-muted px-1.5 py-0.5")}>{EVENTS.length}</span>
      </div>
    </div>
  );
}
