import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stock/', '/explore', '/directory', '/calendar', '/pricing', '/terms', '/privacy', '/refund', '/glossary', '/about', '/dcf/'],
        disallow: [
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
        ],
      },
      {
        userAgent: ['Google-Extended', 'GPTBot', 'CCBot', 'ClaudeBot', 'OAI-SearchBot'],
        disallow: ['/'],
      },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  }
}
