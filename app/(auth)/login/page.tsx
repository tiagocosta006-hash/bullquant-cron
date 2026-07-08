import Link from 'next/link'
import { login } from '../actions'
import { SubmitButton } from '@/components/auth/SubmitButton'
import { Input } from '@/components/ui/input'
import { getTranslations } from 'next-intl/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const resolvedParams = await searchParams
  const t = await getTranslations('login')

  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-20 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h2 className="mt-10 text-center text-3xl font-extrabold tracking-tight text-foreground">
          {t('title')}
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-sm">
        <form className="space-y-6" action={login}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium leading-6 text-foreground mb-2">
              {t('emailLabel')}
            </label>
            <div className="mt-2">
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder={t('emailPlaceholder')}
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium leading-6 text-foreground">
                  {t('passwordLabel')}
                </label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                  {t('forgotPasswordLink')}
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
              />
            </div>
          </div>

          {resolvedParams.error && (
            <div className="text-sm text-center text-destructive p-3 bg-destructive/10 rounded-md font-medium">
              {resolvedParams.error}
            </div>
          )}

          {resolvedParams.message && (
            <div className="text-sm text-center text-bull p-3 bg-bull/10 rounded-md font-medium">
              {resolvedParams.message}
            </div>
          )}

          <div>
            <SubmitButton 
              label={t('submitButton')} 
              loadingLabel={t('submitLoading')} 
              className="w-full text-md h-11 font-bold" 
            />
          </div>
        </form>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          {t('noAccount')}{' '}
          <Link href="/register" className="font-semibold leading-6 text-primary hover:text-primary/80">
            {t('registerLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
