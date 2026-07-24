"use client";

import { useState, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { Info, Maximize2, Presentation } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type DataPoint = { date: string; value: number };
type TabType = "1y" | "5y" | "max";

interface MacroDashboardClientProps {
  initialData: Record<string, DataPoint[]>;
  commentaries: Record<string, { content: string; updatedAt: string }>;
}

const MacroTooltip = ({ active, payload, label, locale }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    const date = new Date(label);
    return (
      <div className="rounded-lg border border-border/50 bg-background/95 p-2 shadow-xl backdrop-blur-sm pointer-events-none">
        <p className="text-xs text-muted-foreground mb-1 capitalize">
          {isNaN(date.getTime())
            ? label
            : `${date.toLocaleString(locale, { month: 'short' })} ${date.getFullYear()}`}
        </p>
        <p className="text-sm font-bold text-foreground">{val.toFixed(2)}%</p>
      </div>
    );
  }
  return null;
};

function EconomistTake({ content, updatedAt }: { content?: string, updatedAt?: string }) {
  const t = useTranslations("macro");
  const locale = useLocale();
  if (!content) return null;
  return (
    <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Presentation className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-primary">{t("economistTake")}</span>
      </div>
      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{content}</p>
      {updatedAt && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("updated", { date: new Date(updatedAt).toLocaleDateString(locale) })}
        </p>
      )}
    </div>
  );
}

function MacroCard({
  title,
  description,
  chartId,
  data,
  colorStr = "hsl(var(--primary))",
  isWarning = false,
  commentary
}: {
  title: string;
  description: string;
  chartId: string;
  data: DataPoint[];
  colorStr?: string;
  isWarning?: boolean;
  commentary?: { content: string; updatedAt: string };
}) {
  const t = useTranslations("macro");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<TabType>("max");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];
    if (activeTab === "max") return data;

    const now = new Date();
    let yearsToSubtract = 0;
    if (activeTab === "1y") yearsToSubtract = 1;
    if (activeTab === "5y") yearsToSubtract = 5;

    const cutoffDate = new Date(now);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsToSubtract);

    return data.filter(p => new Date(p.date) >= cutoffDate);
  }, [data, activeTab]);

  const latestValue = data && data.length > 0 ? data[data.length - 1].value : 0;
  const actualColor = isWarning && latestValue < 0 ? "#ef4444" : colorStr;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.getFullYear().toString();
  };

  const renderChart = (height: string | number = "100%", showAxes = false) => (
    <div className={`w-full ${typeof height === 'string' ? height : `h-[${height}px]`}`} style={typeof height === 'number' ? { height: `${height}px` } : { height }}>
      {filteredData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
          <div className="h-full w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
            <AreaChart data={filteredData} margin={{ top: 10, right: showAxes ? 5 : 0, left: showAxes ? 0 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={actualColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={actualColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                hide={!showAxes}
                tickFormatter={formatDate}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                minTickGap={40}
              />
              <YAxis
                hide={!showAxes}
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                tickFormatter={(val) => `${val}%`}
                width={50}
                orientation="right"
              />
              <Tooltip content={<MacroTooltip locale={locale} />} />
              {isWarning && <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" opacity={0.5} />}
              <Area
                type="monotone"
                dataKey="value"
                stroke={actualColor}
                fillOpacity={1}
                fill={`url(#gradient-${chartId})`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </div>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {t("noData")}
        </div>
      )}
    </div>
  );

  const tabs: TabType[] = ["1y", "5y", "max"];

  const renderHeaderControls = () => (
    <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 w-fit">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
            activeTab === tab
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col rounded-xl border border-border/50 bg-card p-5 shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            {title}
            <div className="group relative">
              <Info className="h-4 w-4 text-muted-foreground" />
              <div className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground opacity-0 shadow-lg transition-all group-hover:opacity-100">
                {description}
              </div>
            </div>
          </h2>
          <p className="mt-2 text-4xl font-black tabular-nums tracking-tight">
            {latestValue.toFixed(2)}%
          </p>
        </div>

        <div className="flex items-center gap-2">
          {renderHeaderControls()}

          <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
            <DialogTrigger
              title={t("expand")}
              className="flex items-center justify-center h-8 w-8 ml-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all border border-transparent hover:border-border/40 shadow-sm"
            >
              <Maximize2 className="h-4 w-4" />
            </DialogTrigger>
            <DialogContent className="sm:max-w-6xl w-[95vw] h-[85vh] flex flex-col bg-card border-border/50 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-4">
                <div>
                  <DialogTitle className="text-xl">{title}</DialogTitle>
                  <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">
                    {latestValue.toFixed(2)}%
                  </p>
                </div>
                {renderHeaderControls()}
              </div>
              <div className="flex-1 mt-6 min-h-0 w-full pb-4">
                {renderChart("100%", true)}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-8 h-[220px] w-full">
        {renderChart("100%", true)}
      </div>

      {commentary && (
        <EconomistTake content={commentary.content} updatedAt={commentary.updatedAt} />
      )}
    </div>
  );
}

const CARD_CONFIG = [
  { key: "yieldCurve", ticker: "^T10Y2Y", color: "#3b82f6", isWarning: true, commentaryKey: "YIELD_CURVE" },
  { key: "fedFunds", ticker: "^FEDFUNDS", color: "#8b5cf6", isWarning: false, commentaryKey: undefined },
  { key: "cpi", ticker: "^CPI_YOY", color: "#10b981", isWarning: false, commentaryKey: "CPI" },
  { key: "gdp", ticker: "^GDP_YOY", color: "#f59e0b", isWarning: false, commentaryKey: "GDP" },
  { key: "unemployment", ticker: "^UNRATE", color: "#f43f5e", isWarning: false, commentaryKey: "UNEMPLOYMENT" },
  { key: "vix", ticker: "^VIX", color: "#0ea5e9", isWarning: false, commentaryKey: "VIX" },
] as const;

export function MacroDashboardClient({ initialData, commentaries }: MacroDashboardClientProps) {
  const t = useTranslations("macro");
  const locale = useLocale();
  const briefing = commentaries["WEEKLY_BRIEFING"];

  return (
    <div className="space-y-8">
      {/* O Púlpito do Economista */}
      {briefing?.content && (
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Presentation className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("briefingTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("briefingSubtitle")}</p>
            </div>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {briefing.content}
          </div>
          <div className="mt-6 pt-4 border-t border-border/50 text-xs text-muted-foreground">
            {t("publishedAt", {
              date: new Date(briefing.updatedAt).toLocaleDateString(locale),
              time: new Date(briefing.updatedAt).toLocaleTimeString(locale),
            })}
          </div>
        </div>
      )}

      {/* Os pilares macro + Máquina do Tempo */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {CARD_CONFIG.map((c) => (
          <MacroCard
            key={c.key}
            title={t(`cards.${c.key}.title`)}
            description={t(`cards.${c.key}.description`)}
            chartId={c.key}
            data={initialData[c.ticker] || []}
            colorStr={c.color}
            isWarning={c.isWarning}
            commentary={c.commentaryKey ? commentaries[c.commentaryKey] : undefined}
          />
        ))}
      </div>
    </div>
  );
}
