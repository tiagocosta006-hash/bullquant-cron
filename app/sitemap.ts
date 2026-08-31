import { MetadataRoute } from 'next'
export const revalidate = 86400 // Revalidate daily to pick up new companies
import { prisma } from '@/lib/prisma'
import { BRAND } from '@/lib/brand'
import { routing } from '@/i18n/routing'
import { SECTORS } from '@/lib/data/sectors'

function createSitemapEntries(path: string, options: Partial<MetadataRoute.Sitemap[0]>): MetadataRoute.Sitemap {
  const languages: Record<string, string> = {}
  
  routing.locales.forEach((l) => {
    // If routing prefix is as-needed, the default locale has NO prefix.
    const prefix = (l === routing.defaultLocale && routing.localePrefix === 'as-needed') ? '' : `/${l}`
    // If it's the root path and there is no prefix, it must be `/`. Otherwise, prefix + path.
    const cleanPath = path === '/' ? '' : path
    const canonicalPath = `${prefix}${cleanPath}` || '/'
    languages[l] = `${BRAND.siteUrl}${canonicalPath}`
  })

  return routing.locales.map((l) => ({
    url: languages[l],
    alternates: { languages },
    ...options
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    ...createSitemapEntries('/', { lastModified: now, changeFrequency: 'weekly', priority: 1 }),
    ...createSitemapEntries('/explore', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...createSitemapEntries('/directory', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    ...createSitemapEntries('/calendar', { lastModified: now, changeFrequency: 'daily', priority: 0.7 }),
    ...createSitemapEntries('/dcf', { lastModified: now, changeFrequency: 'weekly', priority: 0.7 }),
    ...createSitemapEntries('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
    ...createSitemapEntries('/pricing', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...createSitemapEntries('/terms', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    ...createSitemapEntries('/privacy', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    ...createSitemapEntries('/refund', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
  ]

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = SECTORS.flatMap(sector => 
    createSitemapEntries(`/directory/${sector.slug}`, {
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  )

  // Dynamic stock pages
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: { ticker: true },
    })

    const stockPages: MetadataRoute.Sitemap = companies.flatMap(c => 
      createSitemapEntries(`/stock/${c.ticker}`, {
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    )

    return [...staticPages, ...categoryPages, ...stockPages]
  } catch {
    return [...staticPages, ...categoryPages]
  }
}
