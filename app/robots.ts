import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/stock/', '/explore', '/calendar'],
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
        ],
      },
    ],
    sitemap: 'https://bullmetrics.thebullocracy.com/sitemap.xml',
  }
}
