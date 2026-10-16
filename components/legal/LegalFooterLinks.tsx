import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { LEGAL } from "@/lib/legal/config"
import { CookieSettingsButton } from "./CookieSettingsButton"

/** Ligações legais + identificação do prestador. Usado no rodapé público e na área da aplicação. */
export async function LegalFooterLinks({ compacto = false }: { compacto?: boolean }) {
  const t = await getTranslations("footer")
  const cls = "transition-colors hover:text-foreground"
  const { entidade } = LEGAL
  const ident = [entidade.nome, entidade.nipc && `NIPC ${entidade.nipc}`, entidade.sede].filter(Boolean).join(" · ")
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <nav aria-label={t("legalNav")} className="flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/terms" className={cls}>{t("terms")}</Link>
        <Link href="/privacy" className={cls}>{t("privacy")}</Link>
        <Link href="/cookies" className={cls}>{t("cookies")}</Link>
        <CookieSettingsButton label={t("cookieSettings")} className={cls} />
        <Link href="/refund" className={cls}>{t("refund")}</Link>
        <Link href="/withdrawal" className={cls}>{t("withdrawal")}</Link>
        <Link href="/legal" className={cls}>{t("legal")}</Link>
        {LEGAL.livroReclamacoes && (
          <a href={LEGAL.livroReclamacoes} target="_blank" rel="noopener noreferrer" className={cls}>{t("complaintsBook")}</a>
        )}
      </nav>
      {!compacto && ident && <p>{ident} · {LEGAL.email}</p>}
    </div>
  )
}
