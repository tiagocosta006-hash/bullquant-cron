import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { BRAND } from '@/lib/brand'
import { routing } from '@/i18n/routing'

function createSitemapEntry(path: string, options: Partial<MetadataRoute.Sitemap[0]>): MetadataRoute.Sitemap[0] {
  const url = path === '/' ? BRAND.siteUrl : `${BRAND.siteUrl}${path}`
  
  const languages: Record<string, string> = {}
  routing.locales.forEach((l) => {
    const prefix = l === routing.defaultLocale ? '' : `/${l}`
    languages[l] = `${BRAND.siteUrl}${prefix}${path === '/' ? '' : path}`
  })

  return {
    url,
    alternates: { languages },
    ...options
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    createSitemapEntry('/', { lastModified: now, changeFrequency: 'weekly', priority: 1 }),
    createSitemapEntry('/explore', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    createSitemapEntry('/calendar', { lastModified: now, changeFrequency: 'daily', priority: 0.7 }),
    createSitemapEntry('/dcf', { lastModified: now, changeFrequency: 'weekly', priority: 0.7 }),
    createSitemapEntry('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
    createSitemapEntry('/pricing', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    createSitemapEntry('/terms', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    createSitemapEntry('/privacy', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    createSitemapEntry('/refund', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
  ]

  // Dynamic stock pages
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: { ticker: true },
    })

    const stockPages: MetadataRoute.Sitemap = companies.map(c => 
      createSitemapEntry(`/stock/${c.ticker}`, {
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    )

    return [...staticPages, ...stockPages]
  } catch {
    return staticPages
  }
}
