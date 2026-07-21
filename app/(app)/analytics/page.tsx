import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { isPulseAdmin } from "@/lib/pulse/server";
import { getUser } from "@/lib/supabase/server";
import { PulseCharts } from "@/components/analytics/PulseCharts";

/**
 * Pulse — dashboard interno de analytics first-party (últimos 30 dias).
 * Acesso restrito à allowlist ANALYTICS_ADMIN_EMAILS; fora dela → 404
 * (não revela a rota). Dados de pulse_events, agregados no servidor.
 */

export const dynamic = "force-dynamic";

type DailyRow = { day: Date; pageviews: bigint; visitors: bigint };

export default async function AnalyticsPage() {
  const user = await getUser();
  if (!user || !isPulseAdmin(user.email)) notFound();

  const t = await getTranslations("analytics");
  // Server Component dinâmico (force-dynamic): "agora" é por-pedido, por definição.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [daily, topPaths, topReferrers, eventCounts, landingSessions, signupSessions] =
    await Promise.all([
      prisma.$queryRaw<DailyRow[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               count(*) FILTER (WHERE type = 'pageview') AS pageviews,
               count(DISTINCT "sessionId") AS visitors
        FROM pulse_events
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 1`,
      prisma.pulseEvent.groupBy({
        by: ["path"],
        where: { type: "pageview", createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 10,
      }),
      prisma.pulseEvent.groupBy({
        by: ["referrer"],
        where: { referrer: { not: null }, createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { referrer: "desc" } },
        take: 10,
      }),
      prisma.pulseEvent.groupBy({
        by: ["type"],
        where: { createdAt: { gte: since }, type: { not: "pageview" } },
        _count: { _all: true },
      }),
      prisma.$queryRaw<[{ n: bigint }]>`
        SELECT count(DISTINCT "sessionId") AS n FROM pulse_events
        WHERE type = 'pageview' AND path = '/' AND "createdAt" >= ${since}`,
      prisma.$queryRaw<[{ n: bigint }]>`
        SELECT count(DISTINCT "sessionId") AS n FROM pulse_events
        WHERE type = 'signup' AND "createdAt" >= ${since}`,
    ]);

  const data = {
    daily: daily.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      pageviews: Number(r.pageviews),
      visitors: Number(r.visitors),
    })),
    topPaths: topPaths.map((r) => ({ path: r.path, count: r._count._all })),
    topReferrers: topReferrers.map((r) => ({
      referrer: r.referrer as string,
      count: r._count._all,
    })),
    events: eventCounts.map((r) => ({ type: r.type, count: r._count._all })),
    funnel: {
      landing: Number(landingSessions[0]?.n ?? 0),
      signups: Number(signupSessions[0]?.n ?? 0),
    },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <PulseCharts
        data={data}
        labels={{
          visitors: t("visitors"),
          pageviews: t("pageviews"),
          traffic: t("traffic"),
          topPages: t("topPages"),
          referrers: t("referrers"),
          conversions: t("conversions"),
          funnel: t("funnel"),
          funnelDesc: t("funnelDesc"),
          funnelLanding: t("funnelLanding"),
          funnelSignups: t("funnelSignups"),
          funnelRate: t("funnelRate"),
          empty: t("empty"),
          events: {
            cta_click: t("events.cta_click"),
            signup: t("events.signup"),
            dcf_saved: t("events.dcf_saved"),
            watchlist_add: t("events.watchlist_add"),
          },
        }}
      />
    </div>
  );
}
