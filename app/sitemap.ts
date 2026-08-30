import { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { BRAND } from '@/lib/brand'
import { routing } from '@/i18n/routing'
import { SECTORS } from '@/lib/data/sectors'

function createSitemapEntry(path: string, options: Partial<MetadataRoute.Sitemap[0]>): MetadataRoute.Sitemap[0] {
  // Root path must have a trailing slash to match Next.js canonical generation for `/`
  const url = path === '/' ? `${BRAND.siteUrl}/` : `${BRAND.siteUrl}${path}`
  
  const languages: Record<string, string> = {}
  routing.locales.forEach((l) => {
    // If routing prefix is as-needed, the default locale has NO prefix.
    const prefix = (l === routing.defaultLocale && routing.localePrefix === 'as-needed') ? '' : `/${l}`
    // If it's the root path and there is no prefix, it must be `/`. Otherwise, prefix + path.
    const cleanPath = path === '/' ? '' : path
    const canonicalPath = `${prefix}${cleanPath}` || '/'
    languages[l] = `${BRAND.siteUrl}${canonicalPath}`
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
    createSitemapEntry('/directory', { lastModified: now, changeFrequency: 'daily', priority: 0.8 }),
    createSitemapEntry('/calendar', { lastModified: now, changeFrequency: 'daily', priority: 0.7 }),
    createSitemapEntry('/dcf', { lastModified: now, changeFrequency: 'weekly', priority: 0.7 }),
    createSitemapEntry('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.7 }),
    createSitemapEntry('/pricing', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    createSitemapEntry('/terms', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    createSitemapEntry('/privacy', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
    createSitemapEntry('/refund', { lastModified: now, changeFrequency: 'yearly', priority: 0.3 }),
  ]

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = SECTORS.map(sector => 
    createSitemapEntry(`/directory/${sector.slug}`, {
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

    const stockPages: MetadataRoute.Sitemap = companies.map(c => 
      createSitemapEntry(`/stock/${c.ticker}`, {
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
