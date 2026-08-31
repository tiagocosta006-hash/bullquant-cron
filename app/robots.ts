import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { routing } from '@/i18n/routing'

export default function robots(): MetadataRoute.Robots {
  const allowBase = ['/', '/stock/', '/explore', '/directory', '/calendar', '/pricing', '/terms', '/privacy', '/refund', '/glossary', '/about', '/dcf/']
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
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  }
}
