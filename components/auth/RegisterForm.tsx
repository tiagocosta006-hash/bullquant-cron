"use client"

import * as React from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { signup } from "@/app/(auth)/actions"
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
}: {
  error?: string
  message?: string
  defaultEmail?: string
  defaultName?: string
}) {
  const t = useTranslations("register")
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
        : error

  return (
    <form className="space-y-6" action={signup}>
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

      <div>
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
