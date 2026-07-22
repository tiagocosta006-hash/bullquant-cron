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
