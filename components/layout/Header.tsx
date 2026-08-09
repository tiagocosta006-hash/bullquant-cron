import { Link } from '@/i18n/routing';
import { LogOut, UserCircle, Zap, Users, BookOpen } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Button, buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { HeaderMobileMenu } from '@/components/layout/HeaderMobileMenu';
import { getUser } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';
import { logout } from '@/app/[locale]/(auth)/actions';
import { getTranslations } from 'next-intl/server';

export async function Header() {
  const user = await getUser()
  const t = await getTranslations('header');

  return (
    // Arquipélago flutuante: bolhas independentes em vez de uma ilha única.
    // Fica dentro de #marketing-wrap (sticky funciona lá; fixed partiria o
    // rubber-band do InertiaScroll). Em cada bolha o vidro é uma camada
    // absoluta atrás do conteúdo — .glass tem overflow:hidden, que clipava
    // o dropdown do SearchBar; o conteúdo vive por cima.
    <header className="sticky top-3 z-50 px-4">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3 lg:gap-4">
        {/* Logo: sem bolha, só uma hairline dourada por baixo — destaca-se
            do vidro das restantes */}
        <div className="relative flex h-14 shrink-0 items-center px-1">
          <Logo href="/" size="md" />
          <span className="gold-rule absolute inset-x-0 -bottom-0.5 h-px" aria-hidden />
        </div>

        {/* Bolha da navegação */}
        <nav className="relative hidden h-12 shrink-0 items-center px-5 md:flex">
          <div className="glass glass-frost absolute inset-0 rounded-full" aria-hidden />
          <div className="relative z-10 flex items-center gap-6">
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
            <Link
              href="/glossary"
              className="flex items-center space-x-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              title={t('glossary')}
            >
              <BookOpen className="h-4 w-4" />
              <span>{t('glossary')}</span>
            </Link>
          </div>
        </nav>

        {/* Bolha da direita: menu mobile, tema, auth */}
        <div className="relative ml-auto flex h-12 shrink-0 items-center px-2.5 sm:px-4">
          <div className="glass glass-frost absolute inset-0 rounded-full" aria-hidden />
          <div className="relative z-10 flex items-center space-x-2">
            <HeaderMobileMenu
              isLoggedIn={!!user}
              labels={{
                menuTitle: t('menuTitle'),
                openMenu: t('openMenu'),
                about: t('about'),
                pricing: t('pricing'),
                glossary: t('glossary'),
                login: t('login'),
                peek: t('peek'),
                createAccount: t('createAccount'),
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
                {/* Login some abaixo de sm — Logo + hamburger + tema + Espreitar +
                    Login + Criar conta não cabem todos numa linha em ecrãs
                    pequenos (ficava cortado); Login e Espreitar passam para o
                    menu mobile. Criar conta é o único CTA sempre visível. */}
                <Link
                  href="/stock/AAPL"
                  data-track="header_peek"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "hidden h-11 rounded-full md:inline-flex md:h-8",
                  )}
                >
                  {t('peek')}
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "ghost" }),
                    "hidden h-11 rounded-full md:inline-flex md:h-8",
                  )}
                >
                  {t('login')}
                </Link>
                <Link
                  href="/register"
                  data-track="header_register"
                  className={cn(
                    buttonVariants(),
                    // sem cta-sheen: o header é permanente, logo o brilho corria
                    // durante toda a visita e competia com o CTA do herói.
                    "pressable h-11 rounded-full font-semibold md:h-8",
                  )}
                >
                  {t('createAccount')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
