"use client"

import * as React from "react"
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from "next-intl"
import { PLANOS, PLANO_IDS, precoTexto, type PlanoId } from "@/lib/planos"
import { cn } from "@/lib/utils"
import { signup } from "@/app/[locale]/(auth)/actions"
import { SubmitButton } from "@/components/auth/SubmitButton"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

const MIN_PASSWORD_LENGTH = 6

/** Bloqueia copiar/cortar/colar nos campos de password (pedido de segurança). */
const blockClipboard = (e: React.ClipboardEvent) => e.preventDefault()

export function RegisterForm({
  error,
  message,
  defaultEmail,
  defaultName,
  defaultPlano = "pro",
}: {
  error?: string
  message?: string
  defaultEmail?: string
  defaultName?: string
  defaultPlano?: PlanoId
}) {
  const t = useTranslations("register")
  const tPlanos = useTranslations("pricing.plans")
  const locale = useLocale()
  const [plano, setPlano] = React.useState<PlanoId>(defaultPlano)
  const [password, setPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [confirmTouched, setConfirmTouched] = React.useState(false)

  const longEnough = password.length >= MIN_PASSWORD_LENGTH
  const matches = password === confirmPassword
  const canSubmit = longEnough && matches && confirmPassword.length > 0
  const showMismatch = confirmTouched && confirmPassword.length > 0 && !matches

  // Erros vindos da server action: códigos conhecidos são traduzidos;
  // o resto (mensagens do translateError) é mostrado tal e qual.
  const errorText =
    error === "passwordMismatch"
      ? t("passwordMismatch")
      : error === "emailInUse"
        ? t("emailInUse")
        : error === "consentMissing"
          ? t("consentMissing")
          : error

  return (
    <form className="space-y-6" action={signup}>
      {/* O que se está a subscrever, ANTES dos dados: quem chega pela landing ainda não viu os preços. */}
      <fieldset>
        <legend className="mb-2 block text-sm font-medium leading-6 text-foreground">{t("choosePlan")}</legend>
        <div className="grid gap-2">
          {PLANO_IDS.map((id) => (
            <label
              key={id}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors",
                plano === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <span className="flex items-center gap-3">
                <input type="radio" name="plano" value={id} checked={plano === id} onChange={() => setPlano(id)} className="accent-[var(--primary)]" />
                <span>
                  <span className="block text-sm font-semibold">{tPlanos(`${id}.name`)}</span>
                  <span className="block text-xs text-muted-foreground">{tPlanos(`${id}.description`)}</span>
                </span>
              </span>
              <span className="whitespace-nowrap text-sm font-bold">{precoTexto(PLANOS[id].preco, locale)} €</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("planPrice", { preco: precoTexto(PLANOS[plano].preco, locale) })} · {t("planNote")}
        </p>
      </fieldset>

      <div>
        <label htmlFor="name" className="block text-sm font-medium leading-6 text-foreground mb-2">
          {t("nameLabel")}
        </label>
        <Input id="name" name="name" type="text" required placeholder={t("namePlaceholder")} defaultValue={defaultName} />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium leading-6 text-foreground mb-2">
          {t("emailLabel")}
        </label>
        <Input id="email" name="email" type="email" required placeholder={t("emailPlaceholder")} defaultValue={defaultEmail} />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium leading-6 text-foreground mb-2">
          {t("passwordLabel")}
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onCopy={blockClipboard}
          onCut={blockClipboard}
          onPaste={blockClipboard}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium leading-6 text-foreground mb-2">
          {t("confirmPasswordLabel")}
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          onCopy={blockClipboard}
          onCut={blockClipboard}
          onPaste={blockClipboard}
          aria-invalid={showMismatch || undefined}
        />
        {showMismatch && (
          <p className="mt-2 text-sm font-medium text-destructive">{t("passwordMismatch")}</p>
        )}
      </div>

      {errorText && (
        <div className="text-sm text-center text-destructive p-3 bg-destructive/10 rounded-md font-medium">
          {errorText}
        </div>
      )}

      {message && (
        <div className="text-sm text-center text-bull p-3 bg-bull/10 rounded-md font-medium">
          {message}
        </div>
      )}

      {/* Sem caixas: o próprio botão é a aceitação dos Termos e o pedido expresso
          de início imediato (DL 24/2014, art. 15.º), porque a frase que o diz
          está colada a ele e é lida antes do clique. O registo do pedido (data e
          versão dos Termos) segue na metadata do checkout. */}
      <input type="hidden" name="terms" value="on" />
      <input type="hidden" name="imediato" value="on" />

      <div className="space-y-3 pt-1">
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {t.rich("consentText", {
            terms: (chunks) => <Link href="/terms" className="text-foreground hover:underline font-medium" target="_blank">{chunks}</Link>,
            privacy: (chunks) => <Link href="/privacy" className="text-foreground hover:underline font-medium" target="_blank">{chunks}</Link>,
            withdrawal: (chunks) => <Link href="/refund" className="text-foreground hover:underline font-medium" target="_blank">{chunks}</Link>
          })}
        </p>
        <SubmitButton
          label={t("submitButton")}
          loadingLabel={t("submitLoading")}
          className="w-full text-md h-11 font-bold"
          disabled={!canSubmit}
        />
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-semibold leading-6 text-primary hover:text-primary/80">
          {t("loginLink")}
        </Link>
      </p>
    </form>
  )
}
