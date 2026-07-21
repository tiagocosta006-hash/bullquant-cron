import Link from 'next/link';
import { SearchBar } from '@/components/search/SearchBar';
import { LogOut, UserCircle, Zap, Users } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { HeaderMobileMenu } from '@/components/layout/HeaderMobileMenu';
import { getUser } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { logout } from '@/app/(auth)/actions';
import { getTranslations } from 'next-intl/server';

export async function Header() {
  const user = await getUser()
  const t = await getTranslations('header');

  return (
    // Ilha flutuante: fica dentro de #marketing-wrap (sticky funciona lá;
    // fixed partiria o rubber-band do InertiaScroll). Camada de vidro
    // separada da de conteúdo — .glass tem overflow:hidden, que clipava o
    // dropdown do SearchBar; a ilha vive por trás, o conteúdo por cima.
    <header className="sticky top-3 z-50 px-4">
      <div className="relative mx-auto max-w-screen-2xl">
        <div
          className="glass glass-frost absolute inset-0 rounded-[1.75rem]"
          aria-hidden
        >
          {/* hairline dourada que esbate nas pontas, em vez do border-bottom reto */}
          <span className="gold-rule absolute inset-x-8 bottom-0 h-px" aria-hidden />
        </div>

        <div className="relative z-10 flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-8">
            <div className="mr-2">
              <Logo href="/" size="md" />
            </div>

            <div className="hidden lg:block w-full min-w-[280px] max-w-sm">
              <SearchBar isLoggedIn={!!user} />
            </div>

            {/* Navegação Principal (Esquerda) */}
            <nav className="hidden lg:flex items-center space-x-8">
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

          {/* Lado Direito: menu mobile, Tema, Auth */}
          <div className="flex items-center space-x-2 ml-auto">
            <HeaderMobileMenu
              isLoggedIn={!!user}
              labels={{
                menuTitle: t('menuTitle'),
                openMenu: t('openMenu'),
                about: t('about'),
                pricing: t('pricing'),
                login: t('login'),
              }}
            />
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
                {/* Login some abaixo de sm — Logo + hamburger + tema + Login +
                    Começar grátis não cabem todos numa linha em ecrãs pequenos
                    (ficava cortado); Login passa para o menu mobile. */}
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "ghost" }), "hidden h-11 md:inline-flex md:h-8")}
                >
                  {t('login')}
                </Link>
                <Link
                  href="/register"
                  data-track="header_register"
                  className={cn(buttonVariants(), "pressable cta-sheen h-11 font-semibold md:h-8")}
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
