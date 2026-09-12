import { Metadata } from "next"
import { notFound } from "next/navigation"
import { Link } from "@/i18n/routing"
import { prisma } from "@/lib/prisma"
import { BRAND } from "@/lib/brand"
import { getSectorNameBySlug, getLocalizedSectorName } from "@/lib/data/sectors"
import { Building2, ArrowLeft } from "lucide-react"
import { DirectorySearch } from "@/components/marketing/DirectorySearch"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>
}): Promise<Metadata> {
  const resolvedParams = await params
  const { category, locale } = resolvedParams
  
  // We need the raw sector name for internal logic if needed, but for SEO we use the localized one
  const localizedSectorName = getLocalizedSectorName(category, locale)

  if (localizedSectorName === category) {
    // If it returned the raw slug, it means it wasn't found in SECTORS
    return { title: locale === "pt" ? "Categoria não encontrada" : "Category not found" }
  }

  const title = locale === "pt" 
    ? `Ações de ${localizedSectorName} | ${BRAND.name}`
    : `${localizedSectorName} Stocks | ${BRAND.name}`
    
  const description = locale === "pt"
    ? `Descubra as melhores empresas e ações do setor de ${localizedSectorName} para investir. Análise fundamental completa na ${BRAND.name}.`
    : `Discover the best companies and stocks in the ${localizedSectorName} sector to invest in. Complete fundamental analysis on ${BRAND.name}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BRAND.siteUrl}/directory/${category}`,
    }
  }
}

export default async function CategoryDirectoryPage({
  params,
}: {
  params: Promise<{ locale: string; category: string }>
}) {
  const resolvedParams = await params
  const { category, locale } = resolvedParams
  const sectorName = getSectorNameBySlug(category) // We still need the English DB name to query Prisma
  const localizedSectorName = getLocalizedSectorName(category, locale)

  if (!sectorName) {
    notFound()
  }

  const companies = await prisma.company.findMany({
    where: { 
      isActive: true,
      sector: sectorName
    },
    select: { ticker: true, name: true, logoUrl: true, sector: true },
    orderBy: { ticker: 'asc' }
  })

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-6xl">
      
      {/* Back link */}
      <div className="mb-8">
        <Link 
          href="/directory"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === "pt" ? "Voltar ao Diretório" : "Back to Directory"}
        </Link>
      </div>

      <div className="mb-12">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary mb-6">
          <Building2 className="h-8 w-8" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          {locale === "pt" ? `Ações de ${localizedSectorName}` : `${localizedSectorName} Stocks`}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          {locale === "pt" 
            ? `Lista completa de empresas do setor de ${localizedSectorName} disponíveis para análise na ${BRAND.name}.`
            : `Complete list of companies in the ${localizedSectorName} sector available for analysis on ${BRAND.name}.`
          }
        </p>
      </div>

      <DirectorySearch 
        companies={companies} 
        emptyMessage={locale === "pt" ? "Nenhuma empresa encontrada neste setor." : "No companies found in this sector."} 
      />
    </div>
  )
}

