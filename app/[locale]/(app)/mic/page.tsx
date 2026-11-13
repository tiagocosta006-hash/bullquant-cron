import { getLocale, getTranslations } from "next-intl/server"
import { Briefcase, ChartNoAxesCombined, Wallet } from "lucide-react"
import { redirect } from "@/i18n/routing"
import { getUser } from "@/lib/supabase/server"
import { isMicAnalyst, micConfigured, micDisplayName } from "@/lib/mic/access"
import { prisma } from "@/lib/prisma"
import { MicAccess } from "@/components/mic/MicAccess"
import { readMicPortfolio } from "@/lib/mic/portfolio"
import { MicDesk } from "@/components/mic/MicDesk"
import { MicHistory } from "@/components/mic/MicHistory"
import { MicRefresh } from "@/components/mic/MicRefresh"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export async function generateMetadata() {
  const t = await getTranslations("mic")
  return { title: t("title"), robots: { index: false, follow: false } }
}

export default async function MicPage() {
  const [user, locale, t] = await Promise.all([getUser(), getLocale(), getTranslations("mic")])
  if (!user) {
    return redirect({ href: { pathname: "/login", query: { redirect: locale === "en" ? "/en/mic" : "/mic" } }, locale })
  }

  const analyst = await isMicAnalyst(user.id)
  const configured = micConfigured()
  const accountName = micDisplayName(user)
  const activity = analyst ? await prisma.micActivity.findMany({
    take: 25,
    orderBy: { id: "desc" },
    select: { id: true, analystName: true, event: true, createdAt: true },
  }).catch(() => null) : null
  let account: Awaited<ReturnType<typeof readMicPortfolio>> = null
  let failed = false
  try {
    account = await readMicPortfolio(analyst)
  } catch (error) {
    console.error("[MIC] Portfolio unavailable", error instanceof Error ? error.name : "Unknown error")
    failed = true
  }

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 })
  const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" })
  const unit = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 6 })
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" })
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
  const stats = account ? [
    { label: t("value"), value: account.value ? currency.format(account.value.toNumber()) : "—", icon: Briefcase, tone: "" },
    { label: t("cash"), value: currency.format(account.cash.toNumber()), icon: Wallet, tone: "" },
    { label: t("performance"), value: account.returnPct ? pct.format(account.returnPct.toNumber()) : "—", icon: ChartNoAxesCombined,
      tone: account.returnPct?.gt(0) ? "text-bull" : account.returnPct?.lt(0) ? "text-bear" : "" },
  ] : []

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            <Briefcase className="size-3.5" aria-hidden="true" />{t("simulation")}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {account && <MicRefresh />}
          {configured && !failed && <a className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85 focus-visible:outline-2 focus-visible:outline-ring" href="#analista">{t("analyst")}</a>}
        </div>
      </header>

      {failed && <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm">{t("errors.unavailable")}</p>}
      {!failed && !account && (
        <section className="rounded-2xl border border-dashed border-border bg-card p-6">
          <h2 className="text-lg font-semibold">{t("awaitingStart")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("awaitingDescription")}</p>
        </section>
      )}

      {account && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-border bg-card px-4 py-3.5 sm:px-5 sm:py-4">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Icon className="size-4" aria-hidden="true" />{label}</p>
              <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`grid items-start gap-6 ${configured && account ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
        {configured && !failed && (
          <div className={account ? "space-y-3 lg:order-last" : "max-w-xl space-y-3"}>
            {analyst && <MicDesk started={!!account} />}
            <MicAccess unlocked={analyst} name={accountName} />
          </div>
        )}
        {account && (
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-border bg-card">
              <div className="px-5 pt-5 pb-3">
                <h2 className="text-lg font-semibold">{t("positions")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("startedCapital", { value: currency.format(account.initialCapital.toNumber()) })}</p>
                {account.value === null && <p className="mt-2 text-sm text-muted-foreground">{t("missingPrices")}</p>}
              </div>
              {account.positions.length ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="pl-5">{t("ticker")}</TableHead>
                    <TableHead className="text-right">{t("quantity")}</TableHead>
                    <TableHead className="text-right">{t("averageCost")}</TableHead>
                    <TableHead className="text-right">{t("marketPrice")}</TableHead>
                    <TableHead className="text-right">{t("value")}</TableHead>
                    <TableHead className="pr-5 text-right">{t("performance")}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {account.positions.map((p) => <TableRow key={p.ticker}>
                      <TableCell className="pl-5"><span className="font-semibold">{p.ticker}</span><span className="block max-w-36 truncate text-xs text-muted-foreground" title={p.name}>{p.name}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{number.format(p.quantity.toNumber())}</TableCell>
                      <TableCell className="text-right tabular-nums">{unit.format(p.averageCost.toNumber())}</TableCell>
                      <TableCell className="text-right tabular-nums" title={p.quotedAt ? t("quotedAt", { date: date.format(p.quotedAt) }) : undefined}>{p.price ? unit.format(p.price.toNumber()) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.value ? currency.format(p.value.toNumber()) : "—"}</TableCell>
                      <TableCell className={`pr-5 text-right tabular-nums ${p.returnPct?.gt(0) ? "text-bull" : p.returnPct?.lt(0) ? "text-bear" : ""}`}>{p.returnPct ? pct.format(p.returnPct.toNumber()) : "—"}</TableCell>
                    </TableRow>)}
                  </TableBody>
                </Table>
              ) : <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">{t("noPositions")}</p>}
            </section>

            <MicHistory version={account.trades[0]?.id ?? account.createdAt.toISOString()} />

            <section className="rounded-2xl border border-border bg-card">
              <h2 className="p-5 pb-3 text-lg font-semibold">{t("recentTrades")}</h2>
              {account.trades.length ? <Table>
                <TableHeader><TableRow>
                  <TableHead className="pl-5">{t("date")}</TableHead>
                  <TableHead>{t("side")}</TableHead>
                  <TableHead>{t("ticker")}</TableHead>
                  {analyst && <TableHead>{t("operator")}</TableHead>}
                  <TableHead className="text-right">{t("quantity")}</TableHead>
                  <TableHead className="text-right">{t("unitPrice")}</TableHead>
                  <TableHead className="pr-5 text-right">{t("total")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>{account.trades.map((trade) => <TableRow key={trade.id}>
                  <TableCell className="pl-5 text-muted-foreground">{date.format(trade.executedAt)} UTC</TableCell>
                  <TableCell className={trade.side === "BUY" ? "font-medium text-bull" : "font-medium text-primary"}>{t(trade.side)}</TableCell>
                  <TableCell className="font-semibold">{trade.ticker}</TableCell>
                  {analyst && <TableCell>{trade.analystName || "—"}</TableCell>}
                  <TableCell className="text-right tabular-nums">{number.format(trade.quantity.toNumber())}</TableCell>
                  <TableCell className="text-right tabular-nums">{unit.format(trade.price.toNumber())}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">{currency.format(trade.total.toNumber())}</TableCell>
                </TableRow>)}</TableBody>
              </Table> : <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">{t("noTrades")}</p>}
            </section>
          </div>
        )}
      </div>
      {analyst && activity && (
        <section className="rounded-2xl border border-border bg-card">
          <h2 className="p-5 pb-3 text-lg font-semibold">{t("activity")}</h2>
          <Table>
            <TableHeader><TableRow>
              <TableHead className="pl-5">{t("activityTime")}</TableHead>
              <TableHead>{t("operator")}</TableHead>
              <TableHead>{t("side")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{activity.map((event) => (
              <TableRow key={event.id.toString()}>
                <TableCell className="pl-5">{date.format(event.createdAt)} UTC</TableCell>
                <TableCell>{event.analystName}</TableCell>
                <TableCell>{t(`events.${event.event}`)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}
