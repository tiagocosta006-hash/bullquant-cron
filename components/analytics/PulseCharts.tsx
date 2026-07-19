"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";

/**
 * PulseCharts — visualizações do dashboard Pulse. Cores por token
 * (par dourado/azul validado para CVD em light e dark); texto sempre em
 * tokens de tinta; grelha recessiva; tooltips nativos do Recharts.
 */

type PulseData = {
  daily: { day: string; pageviews: number; visitors: number }[];
  topPaths: { path: string; count: number }[];
  topReferrers: { referrer: string; count: number }[];
  events: { type: string; count: number }[];
  funnel: { landing: number; signups: number };
};

type Labels = {
  visitors: string;
  pageviews: string;
  traffic: string;
  topPages: string;
  referrers: string;
  conversions: string;
  funnel: string;
  funnelDesc: string;
  funnelLanding: string;
  funnelSignups: string;
  funnelRate: string;
  empty: string;
  events: Record<string, string>;
};

const GOLD = "var(--chart-1)";
const BLUE = "var(--chart-5)";

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--popover-foreground)",
  fontSize: 12,
};

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function PulseCharts({ data, labels }: { data: PulseData; labels: Labels }) {
  const conversionRate =
    data.funnel.landing > 0 ? (data.funnel.signups / data.funnel.landing) * 100 : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Tráfego diário — pageviews + visitors */}
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold">{labels.traffic}</h2>
        <div className="mt-1 flex items-center gap-5 text-xs font-medium text-foreground/70">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: GOLD }} aria-hidden />
            {labels.pageviews}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BLUE }} aria-hidden />
            {labels.visitors}
          </span>
        </div>
        {data.daily.length === 0 ? (
          <EmptyState label={labels.empty} />
        ) : (
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 6" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "var(--border)" }} />
                <Area
                  name={labels.pageviews}
                  dataKey="pageviews"
                  stroke={GOLD}
                  strokeWidth={2}
                  fill={GOLD}
                  fillOpacity={0.12}
                />
                <Area
                  name={labels.visitors}
                  dataKey="visitors"
                  stroke={BLUE}
                  strokeWidth={2}
                  fill={BLUE}
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Top páginas */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{labels.topPages}</h2>
        {data.topPaths.length === 0 ? (
          <EmptyState label={labels.empty} />
        ) : (
          <div className="mt-4" style={{ height: Math.max(160, data.topPaths.length * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.topPaths}
                layout="vertical"
                margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="path"
                  width={140}
                  tick={{ fill: "var(--foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                <Bar
                  name={labels.pageviews}
                  dataKey="count"
                  fill={GOLD}
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Referrers */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{labels.referrers}</h2>
        {data.topReferrers.length === 0 ? (
          <EmptyState label={labels.empty} />
        ) : (
          <ul className="mt-4 space-y-2">
            {data.topReferrers.map(({ referrer, count }) => (
              <li
                key={referrer}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-sm"
              >
                <span className="truncate text-foreground">{referrer}</span>
                <span className="nums ml-3 shrink-0 font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Conversões (eventos-chave) */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{labels.conversions}</h2>
        {data.events.length === 0 ? (
          <EmptyState label={labels.empty} />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {data.events.map(({ type, count }) => (
              <div key={type} className="rounded-xl border border-border/50 bg-card/40 p-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {labels.events[type] ?? type}
                </div>
                <div className="nums mt-1 text-2xl font-bold tracking-tight">{count}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Funil landing → signup */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">{labels.funnel}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{labels.funnelDesc}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: labels.funnelLanding, value: String(data.funnel.landing), accent: false },
            { label: labels.funnelSignups, value: String(data.funnel.signups), accent: false },
            {
              label: labels.funnelRate,
              value: conversionRate === null ? "N/A" : `${conversionRate.toFixed(1)}%`,
              accent: true,
            },
          ].map(({ label, value, accent }) => (
            <div key={label} className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <div
                className={`nums mt-1 text-2xl font-bold tracking-tight ${accent ? "text-primary" : ""}`}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
