import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import { LogOut, UserCircle, Zap, Users } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { getUser } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { logout } from '@/app/(auth)/actions';
import { getTranslations } from 'next-intl/server';

export async function Header() {
  const user = await getUser()
  const t = await getTranslations('header');

  return (
    <header className="glass-topbar sticky top-0 z-50 w-full">
      <div className="container flex h-16 max-w-screen-2xl items-center justify-between px-4 md:px-8 mx-auto">
        <div className="flex items-center gap-8">
          <div className="mr-2">
            <Logo href="/" size="md" />
          </div>
          
          <div className="hidden lg:block w-full min-w-[280px] max-w-sm">
            <SearchBar isLoggedIn={!!user} />
          </div>

          {/* Navegação Principal (Esquerda) */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link
              href="/about"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={t('about')}
            >
              <Users className="h-4 w-4" />
              <span>{t('about')}</span>
            </Link>
            <Link
              href="/pricing"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={t('pricing')}
            >
              <Zap className="h-4 w-4" />
              <span>{t('pricing')}</span>
            </Link>
          </nav>
        </div>

        {/* Lado Direito: Tema, Auth */}
        <div className="flex items-center space-x-4 ml-auto">

          <div className="flex items-center space-x-4">
            <ThemeToggle />
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
              <div className="flex items-center space-x-2">
                <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                  {t('login')}
                </Link>
                <Link
                  href="/register"
                  data-track="header_register"
                  className={cn(buttonVariants(), "pressable cta-sheen font-semibold")}
                >
                  {t('startFree')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
