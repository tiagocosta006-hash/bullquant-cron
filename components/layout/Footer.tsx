import { Link } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';
import { LegalFooterLinks } from '@/components/legal/LegalFooterLinks';

export async function Footer() {
  const t = await getTranslations('footer');

  return (
    <footer className="border-t border-border/40 py-8 md:py-12">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm text-muted-foreground">
          {t('rights', { year: new Date().getFullYear(), brand: BRAND.name })}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link href="/directory" className="hover:text-foreground transition-colors font-medium text-foreground/80">
            {t('directory')}
          </Link>
          <Link href="/about" className="hover:text-foreground transition-colors">
            {t('about')}
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            {t('pricing')}
          </Link>
        </div>
      </div>
      <div className="container mx-auto mt-6 space-y-3 px-4">
        <LegalFooterLinks />
        <p className="text-xs leading-relaxed text-muted-foreground/80">{t('legalNotice')}</p>
      </div>
    </footer>
  );
}

