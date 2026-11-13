"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ArrowDownUp, Loader2 } from "lucide-react"
import { useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { reviewMicOrder, startMicPortfolio, submitMicOrder } from "@/app/[locale]/(app)/mic/actions"

type Ticket = NonNullable<Awaited<ReturnType<typeof reviewMicOrder>>["order"]>

export function MicDesk({ started }: { started: boolean }) {
  const t = useTranslations("mic")
  const locale = useLocale()
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const usd = (value: string) => new Intl.NumberFormat(locale, {
    style: "currency", currency: "USD", maximumFractionDigits: 6,
  }).format(Number(value))
  const numbers = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 })
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
  const inputClass = "mt-1.5 min-h-10 w-full"

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setSuccess("")
    try {
      await task()
    } catch {
      setError(t("errors.unavailable"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="analista" className="scroll-mt-24 rounded-2xl border border-primary/25 bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ArrowDownUp className="size-4 text-primary" aria-hidden="true" />{t("analyst")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{started ? t("orderDescription") : t("setupDescription")}</p>
      {started ? (
        <>
          <form
            className="mt-5"
            hidden={!!ticket}
            onSubmit={(event) => {
              event.preventDefault()
              const data = new FormData(event.currentTarget)
              void run(async () => {
                const result = await reviewMicOrder(Object.fromEntries(data))
                if (result.order) setTicket(result.order)
                else if (result.error) setError(t(`errors.${result.error}`))
              })
            }}
          >
            <fieldset disabled={busy} className="grid gap-3 grid-cols-2 sm:grid-cols-[minmax(105px,1fr)_1fr_1fr] lg:grid-cols-2">
              <div>
                <Label htmlFor="mic-side">{t("side")}</Label>
                <select id="mic-side" name="side" className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm">
                  <option value="BUY">{t("BUY")}</option>
                  <option value="SELL">{t("SELL")}</option>
                </select>
              </div>
              <div>
                <Label htmlFor="mic-ticker">{t("ticker")}</Label>
                <Input id="mic-ticker" name="ticker" placeholder="AAPL" className={inputClass + " uppercase"} maxLength={20} required />
              </div>
              <div className="col-span-2 sm:col-span-1 lg:col-span-2">
                <Label htmlFor="mic-quantity">{t("quantity")}</Label>
                <Input id="mic-quantity" name="quantity" className={inputClass} inputMode="decimal" maxLength={14} required />
              </div>
            </fieldset>
            <Button type="submit" className="mt-4 w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}{t("review")}
            </Button>
          </form>
          {ticket && (
            <div className="mt-5 space-y-3">
              <div className="rounded-lg border border-border bg-muted/25 p-3 text-sm">
                <p className="font-semibold">{t(ticket.side)} · {ticket.ticker}</p>
                <p className="text-muted-foreground">{ticket.name}</p>
                <dl className="mt-3 space-y-1.5 tabular-nums">
                  <div className="flex justify-between gap-2"><dt>{t("quantity")}</dt><dd>{numbers.format(Number(ticket.quantity))}</dd></div>
                  <div className="flex justify-between gap-2"><dt>{t("unitPrice")}</dt><dd>{usd(ticket.reviewedPrice)}</dd></div>
                  <div className="flex justify-between gap-2 font-semibold"><dt>{t("estimatedTotal")}</dt><dd>{usd(ticket.total)}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-muted-foreground">{t("quotedAt", { date: date.format(new Date(ticket.quotedAt)) })}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy} onClick={() => { setTicket(undefined); setError("") }}>{t("back")}</Button>
                <Button className="flex-1" disabled={busy} onClick={() => run(async () => {
                  const result = await submitMicOrder(ticket)
                  if (result.executed) {
                    setSuccess(t("executed", { ticker: result.executed.ticker, price: usd(result.executed.price), total: usd(result.executed.total) }))
                    setTicket(undefined)
                    router.refresh()
                  } else if (result.error) {
                    setError(t(`errors.${result.error}`))
                    if (result.error === "priceChanged") setTicket(undefined)
                  }
                })}>
                  {busy && <Loader2 className="animate-spin" />}{t("confirm")}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <form className="mt-5" action={async (data) => run(async () => {
          const result = await startMicPortfolio(String(data.get("capital") ?? ""))
          if (result.error) setError(t(`errors.${result.error}`))
          else router.refresh()
        })}>
          <Label htmlFor="mic-capital">{t("initialUsd")}</Label>
          <Input id="mic-capital" name="capital" inputMode="decimal" maxLength={13} className={inputClass} required disabled={busy} />
          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}{t("start")}
          </Button>
        </form>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-bull">{success}</p>}
    </section>
  )
}
