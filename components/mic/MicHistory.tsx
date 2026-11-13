"use client"

import { useEffect, useId, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type Point = { date: string; value: number }

export function MicHistory({ version }: { version: string }) {
  const t = useTranslations("mic")
  const locale = useLocale()
  const gradient = useId()
  const [result, setResult] = useState<{ points: Point[]; version: string; error?: boolean }>()
  const [visible, setVisible] = useState(false)
  const value = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 })
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 })
  const day = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" })
  const dateLabel = (date: string) => day.format(new Date(date))

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch("/api/mic/history", { signal: controller.signal })
        if (!response.ok) throw new Error("History unavailable")
        const points: Point[] = await response.json()
        if (!controller.signal.aborted) setResult({ points, version })
      } catch {
        if (!controller.signal.aborted) setResult({ points: [], version, error: true })
      }
    }
    void load()
    return () => controller.abort()
  }, [version, visible])

  const active = result?.version === version ? result : undefined
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        <button type="button" aria-expanded={visible} onClick={() => setVisible(!visible)}
          className="rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
          {visible ? t("hideHistory") : t("showHistory")}
        </button>
      </div>
      {visible && <>
        <p className="mt-1 text-sm text-muted-foreground">{t("historyDescription")}</p>
        {active && !active.error && active.points.length > 1 ? (
          <div className="mt-4 h-52 w-full">
            <ResponsiveContainer>
              <AreaChart data={active.points} margin={{ top: 5, left: 0, right: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="4 5" />
                <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(n) => compact.format(n)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                <Tooltip labelFormatter={(label) => dateLabel(String(label))}
                  formatter={(n) => [value.format(Number(n)), t("value")]}
                  contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)", borderRadius: 10, color: "var(--foreground)" }} />
                <Area type="linear" dataKey="value" stroke="var(--primary)" strokeWidth={2} fill={`url(#${gradient})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">
            {t(active ? (active.error ? "historyError" : "historyEmpty") : "loadingHistory")}
          </p>
        )}
      </>}
    </section>
  )
}
