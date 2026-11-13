"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Estado = "idle" | "sending" | "ok" | "errorEmail" | "errorRate" | "errorGeneric"

/**
 * Captação de e-mail para "A empresa da semana" (POST /api/newsletter).
 *
 * O botão é o consentimento: o texto que o diz está colado a ele e é lido
 * antes do clique (como no registo). A inscrição só fica ativa depois do
 * clique no e-mail de confirmação.
 *
 * `origem` identifica a página ("stock-aapl", "pricing", "newsletter"…), para
 * se saber que superfície capta mais.
 */
export function EmpresaDaSemanaForm({ origem, className }: { origem: string; className?: string }) {
  const t = useTranslations("newsletter")
  const locale = useLocale()
  const [email, setEmail] = useState("")
  const [website, setWebsite] = useState("")
  const [estado, setEstado] = useState<Estado>("idle")

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado("sending")
    try {
      const r = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, origem, locale, consent: true, website }),
      })
      if (r.ok) return setEstado("ok")
      if (r.status === 429) return setEstado("errorRate")
      const d = (await r.json().catch(() => ({}))) as { error?: string }
      setEstado(d.error === "email" ? "errorEmail" : "errorGeneric")
    } catch {
      setEstado("errorGeneric")
    }
  }

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-6 text-center", className)}>
      <p className="text-lg font-bold tracking-tight">{t("title")}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t("subtitle")}</p>

      {estado === "ok" ? (
        <p role="status" className="mt-4 rounded-md bg-bull/10 p-3 text-sm font-medium text-bull">
          {t("success")}
        </p>
      ) : (
        <form onSubmit={enviar} className="mx-auto mt-4 flex max-w-md flex-col gap-2 sm:flex-row">
          {/* Armadilha para bots: escondida de pessoas e de leitores de ecrã. */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <label htmlFor={`nl-${origem}`} className="sr-only">
            Email
          </label>
          <Input
            id={`nl-${origem}`}
            type="email"
            required
            autoComplete="email"
            placeholder={t("placeholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={estado === "sending"} className="font-semibold">
            {estado === "sending" ? t("sending") : t("button")}
          </Button>
        </form>
      )}

      {(estado === "errorEmail" || estado === "errorRate" || estado === "errorGeneric") && (
        <p role="alert" className="mt-2 text-sm font-medium text-destructive">
          {t(estado)}
        </p>
      )}

      {estado !== "ok" && (
        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
          {t.rich("consent", {
            privacy: (chunks) => (
              <Link href="/privacy" target="_blank" className="font-medium text-foreground hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  )
}
