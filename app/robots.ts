import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { routing } from '@/i18n/routing'

export default function robots(): MetadataRoute.Robots {
  const allowBase = ['/', '/stock/', '/explore', '/directory', '/calendar', '/pricing', '/terms', '/privacy', '/refund', '/cookies', '/legal', '/withdrawal', '/glossary', '/about', '/dcf/']
  const disallowBase = [
    '/api/',
    '/auth/',
    '/settings',
    '/portfolio',
    '/dashboard',
    '/dcf',
    '/screener',
    '/reset-password',
    '/forgot-password',
    '/login',
    '/register',
    '/watchlist',
    '/compare',
    '/transcripts',
    '/preview',
  ]

  const allow = Array.from(new Set(allowBase.flatMap(path => [
    path,
    ...routing.locales.map(l => `/${l}${path === '/' ? '' : path}`)
  ])))

  const disallow = Array.from(new Set(disallowBase.flatMap(path => [
    path, 
    ...routing.locales.map(l => `/${l}${path === '/' ? '' : path}`)
  ])))

  return {
    rules: [
      {
        userAgent: '*',
        allow,
        disallow,
      },
      {
        userAgent: ['Google-Extended', 'GPTBot', 'CCBot'],
        disallow: ['/'],
      },
      // Raspadores de ferramentas de SEO e afins: não trazem utilizadores e
      // percorrem as ~1100 páginas de ações, cada uma renderizada no servidor.
      {
        userAgent: ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'Bytespider', 'PetalBot', 'BLEXBot', 'DataForSeoBot'],
        disallow: ['/'],
      },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  }
}
