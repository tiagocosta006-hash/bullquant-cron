import { Mail } from "lucide-react"
import { getTranslations } from "next-intl/server"

// Remetente dos emails transacionais (lib/resend.ts) — usado na pesquisa do Gmail.
const SENDER = "no-reply@thebullvalue.com"

// Gmail suporta deep-link de pesquisa; abre a caixa já filtrada pelo remetente.
const GMAIL_URL = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${SENDER} in:anywhere`)}`
// O Outlook web não tem deep-link de pesquisa documentado/estável — abrimos a inbox.
const OUTLOOK_URL = "https://outlook.live.com/mail/0/"

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"]
const OUTLOOK_DOMAINS = ["outlook.", "hotmail.", "live.", "msn.com"]

function providerFor(email: string): "gmail" | "outlook" | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? ""
  if (GMAIL_DOMAINS.includes(domain)) return "gmail"
  if (OUTLOOK_DOMAINS.some((d) => domain.startsWith(d) || domain === d)) return "outlook"
  return null
}

/**
 * Botões "Abrir Gmail / Abrir Outlook" no ecrã de verificação de email:
 * mostra só o do fornecedor do email do utilizador; para outros domínios
 * mostra ambos como atalhos discretos.
 */
export async function OpenInboxButtons({ email }: { email: string }) {
  const t = await getTranslations("verifyEmail")
  const provider = email ? providerFor(email) : null

  const gmail = (primary: boolean) => (
    <a
      key="gmail"
      href={GMAIL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses(primary)}
    >
      <Mail className="h-4 w-4" />
      {t("openGmail")}
    </a>
  )
  const outlook = (primary: boolean) => (
    <a
      key="outlook"
      href={OUTLOOK_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses(primary)}
    >
      <Mail className="h-4 w-4" />
      {t("openOutlook")}
    </a>
  )

  return (
    <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
      {provider === "gmail" && gmail(true)}
      {provider === "outlook" && outlook(true)}
      {provider === null && (
        <>
          {gmail(false)}
          {outlook(false)}
        </>
      )}
    </div>
  )
}

function buttonClasses(primary: boolean) {
  return primary
    ? "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
    : "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/60"
}
