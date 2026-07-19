import { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stock/', '/explore', '/calendar', '/pricing', '/terms', '/privacy', '/refund'],
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
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  }
}
