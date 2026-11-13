"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { LockKeyhole } from "lucide-react"
import { useRouter } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/auth/SubmitButton"
import { PasswordInput } from "@/components/ui/password-input"
import { Label } from "@/components/ui/label"
import { lockMic, unlockMic } from "@/app/[locale]/(app)/mic/actions"

export function MicAccess({ unlocked, name }: { unlocked: boolean; name: string }) {
  const t = useTranslations("mic")
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState("")

  if (unlocked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <p className="text-sm">{t("signedAs", { name })}</p>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          await lockMic()
          router.refresh()
        })}>{t("lock")}</Button>
      </div>
    )
  }

  return (
    <section id="analista" className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <LockKeyhole className="size-4 text-primary" aria-hidden="true" />{t("analyst")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("signedAs", { name })}</p>
      <form className="mt-4 space-y-3" action={async (data) => {
        setError("")
        try {
          const result = await unlockMic(data.get("password"))
          if (result.error) setError(t(`errors.${result.error}`))
          else router.refresh()
        } catch {
          setError(t("errors.unavailable"))
        }
      }}>
        <div>
          <Label htmlFor="mic-password">{t("sharedPassword")}</Label>
          <PasswordInput id="mic-password" name="password" autoComplete="off" maxLength={512} className="mt-1.5 w-full" required />
        </div>
        <UnlockButton />
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}

function UnlockButton() {
  const t = useTranslations("mic")
  return <SubmitButton label={t("unlock")} loadingLabel={t("unlock")} className="w-full" />
}
