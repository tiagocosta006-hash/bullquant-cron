import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';

export async function Footer() {
  const t = await getTranslations('footer');

  return (
    <footer className="border-t border-border/40 py-8 md:py-12">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm text-muted-foreground">
          {t('rights', { year: new Date().getFullYear(), brand: BRAND.name })}
        </div>

        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/about" className="hover:text-foreground transition-colors">
            {t('about')}
          </Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">
            {t('pricing')}
          </Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            {t('terms')}
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            {t('privacy')}
          </Link>
          <Link href="/refund" className="hover:text-foreground transition-colors">
            {t('refund')}
          </Link>
        </div>
      </div>
    </footer>
  );
}

