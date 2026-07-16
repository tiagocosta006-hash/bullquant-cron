import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { resendConfirmation } from '../actions'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { OpenInboxButtons } from '@/components/auth/OpenInboxButtons'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; unconfirmed?: string; resent?: string; error?: string }>
}) {
  const { email = '', unconfirmed, resent, error } = await searchParams
  const t = await getTranslations('verifyEmail')

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
        <MailCheck className="h-7 w-7" />
      </div>

      <h2 className="text-2xl font-extrabold tracking-tight text-foreground">{t('title')}</h2>

      {unconfirmed && (
        <p className="mt-2 text-sm font-medium text-primary">{t('unconfirmed')}</p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {email ? t.rich('sentTo', {
          email,
          strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        }) : t('sentGeneric')}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('instruction')}</p>

      {/* Atalho para o webmail certo, já com pesquisa quando suportado (Gmail) */}
      <OpenInboxButtons email={email} />

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground/80">{t('spamHint')}</p>

      {resent && (
        <div className="mt-5 w-full rounded-md bg-bull/10 p-3 text-sm font-medium text-bull">
          {t('resent')}
        </div>
      )}
      {error && (
        <div className="mt-5 w-full rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {error === 'noEmail' ? t('noEmail') : error}
        </div>
      )}

      {/* Reenviar */}
      <form action={resendConfirmation} className="mt-6 w-full">
        <input type="hidden" name="email" value={email} />
        <SubmitButton
          label={t('resendButton')}
          loadingLabel={t('resending')}
          className="h-11 w-full font-semibold"
        />
      </form>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm">
        <Link href="/login" className="font-semibold text-primary hover:text-primary/80">
          {t('backToLogin')}
        </Link>
        <span className="text-muted-foreground">
          {t('wrongEmail')}{' '}
          <Link
            href={`/register?email=${encodeURIComponent(email)}`}
            className="font-medium text-primary hover:underline"
          >
            {t('changeEmail')}
          </Link>
        </span>
      </div>
    </div>
  )
}
