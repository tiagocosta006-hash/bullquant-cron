import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import { LogOut, UserCircle, Calculator, CalendarDays } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { getTranslations } from 'next-intl/server';

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('header');

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8 mx-auto">
        <div className="mr-6">
          <Logo href="/" size="md" />
        </div>
        <div className="flex flex-1 items-center justify-between space-x-4 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <SearchBar />
          </div>

          <nav className="flex items-center space-x-2">
            <Link
              href="/calendar"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-2"
              title={t('calendar')}
            >
              <CalendarDays className="h-5 w-5" />
              <span className="hidden md:inline-block">{t('calendar')}</span>
            </Link>
            <Link
              href="/dcf"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-2"
              title={t('dcf')}
            >
              <Calculator className="h-5 w-5" />
              <span className="hidden md:inline-block">{t('dcf')}</span>
            </Link>
            {user ? (
              <div className="flex items-center space-x-4">
                <Link 
                  href="/settings" 
                  className="flex items-center space-x-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  title={t('settingsTitle')}
                >
                  <UserCircle className="h-5 w-5" />
                  <span className="hidden md:inline-block">
                    {user.user_metadata?.name || user.email?.split('@')[0]}
                  </span>
                </Link>
                <form action={logout}>
                  <Button type="submit" variant="ghost" size="icon" title={t('logoutTitle')}>
                    <LogOut className="h-5 w-5" />
                  </Button>
                </form>
              </div>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                  {t('login')}
                </Link>
                <Link href="/register" className={buttonVariants()}>
                  {t('register')}
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
