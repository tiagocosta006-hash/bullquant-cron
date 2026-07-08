import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stock/', '/screener', '/dashboard', '/dcf', '/calendar'],
        disallow: [
          '/api/',
          '/auth/',
          '/settings',
          '/portfolio',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: 'https://bullvision.app/sitemap.xml',
  }
}
