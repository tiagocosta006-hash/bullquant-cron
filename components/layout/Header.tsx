import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import { LogOut, UserCircle, Calculator, CalendarDays, Zap } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { getTranslations } from 'next-intl/server';

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const t = await getTranslations('header');

  return (
    <header className="glass-topbar sticky top-0 z-50 w-full">
      <div className="container flex h-16 max-w-screen-2xl items-center px-4 md:px-8 mx-auto">
        <div className="mr-6">
          <Logo href="/" size="md" />
        </div>
        <div className="flex flex-1 items-center justify-between space-x-4">
          <div className="w-full flex-1 max-w-sm md:w-auto md:flex-none">
            <SearchBar />
          </div>

          <nav className="flex items-center space-x-2">
            <ThemeToggle />
            <Link
              href="/calendar"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mr-2"
              title={t('calendar')}
            >
              <CalendarDays className="h-5 w-5" />
              <span className="hidden md:inline-block">{t('calendar')}</span>
            </Link>
            <Link
              href="/pricing"
              className="flex items-center space-x-1.5 text-sm font-bold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors mr-3 px-3 py-1.5 rounded-full"
              title={t('pricing')}
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span className="hidden md:inline-block">{t('pricing')}</span>
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
