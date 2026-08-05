import { getTranslations } from 'next-intl/server'
import { RegisterForm } from '@/components/auth/RegisterForm'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; email?: string; name?: string }>
}) {
  const resolvedParams = await searchParams
  const t = await getTranslations('register')

  return (
    <div className="flex flex-col">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-foreground">
          {t('title')}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
        <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <p className="text-center text-xs text-amber-600/90 dark:text-amber-400/90 leading-relaxed">
            <span className="font-semibold">Nota:</span> Recomendamos o uso de contas Gmail ou Apple.<br className="hidden sm:block" />
            Emails institucionais ou universitários costumam bloquear a mensagem de confirmação.
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <RegisterForm
          error={resolvedParams.error}
          message={resolvedParams.message}
          defaultEmail={resolvedParams.email}
          defaultName={resolvedParams.name}
        />
      </div>
    </div>
  )
}
