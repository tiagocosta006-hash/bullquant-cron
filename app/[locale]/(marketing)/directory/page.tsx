import { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { prisma } from "@/lib/prisma"
import { BRAND } from "@/lib/brand"
import { SECTORS } from "@/lib/data/sectors"
import { Building2 } from "lucide-react"
import { DirectorySearch } from "@/components/marketing/DirectorySearch"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("directory")
  
  return {
    title: t("title"),
    description: t("subtitle"),

    openGraph: {
      title: `${t("title")} | ${BRAND.name}`,
      description: t("subtitle"),
      url: `${BRAND.siteUrl}/directory`,
    }
  }
}

export default async function DirectoryPage() {
  const t = await getTranslations("directory")
  
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { ticker: true, name: true, sector: true, logoUrl: true },
    orderBy: { ticker: 'asc' }
  })

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-6xl">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          {t("title")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("subtitle")}
        </p>
      </div>

      {/* Categories Navigation */}
      <div className="mb-12">
        <h2 className="text-xl font-bold mb-6 flex items-center justify-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Explorar por Setor
        </h2>
        <div className="flex flex-wrap gap-3 justify-center max-w-4xl mx-auto">
          {SECTORS.map(sector => (
            <Link 
              key={sector.slug} 
              href={`/directory/${sector.slug}`}
              className="px-4 py-2 rounded-full border border-border bg-card hover:bg-primary/10 hover:border-primary/50 text-sm font-medium transition-colors"
            >
              {sector.name}
            </Link>
          ))}
        </div>
      </div>

      <DirectorySearch companies={companies} emptyMessage={t("empty")} />
    </div>
  )
}
