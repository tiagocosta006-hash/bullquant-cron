import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { prisma } from "@/lib/prisma"
import { BRAND } from "@/lib/brand"
import { getSectorNameBySlug, SECTORS } from "@/lib/data/sectors"
import { Building2, ArrowLeft } from "lucide-react"
import { DirectorySearch } from "@/components/marketing/DirectorySearch"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; category: string }>
}): Promise<Metadata> {
  const resolvedParams = await params
  const { category, locale } = resolvedParams
  const sectorName = getSectorNameBySlug(category)

  if (!sectorName) {
    return { title: "Categoria não encontrada" }
  }

  // Assuming we might want to translate "Sector: {name}" in the future, 
  // but for now we use the direct name for simplicity in SEO.
  const title = `Ações de ${sectorName} | ${BRAND.name}`
  const description = `Descubra as melhores empresas e ações do setor de ${sectorName} para investir. Análise fundamental completa na ${BRAND.name}.`

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
  const { category } = resolvedParams
  const sectorName = getSectorNameBySlug(category)

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
          Voltar ao Diretório
        </Link>
      </div>

      <div className="mb-12">
        <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary mb-6">
          <Building2 className="h-8 w-8" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          Ações de {sectorName}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl">
          Lista completa de empresas do setor de {sectorName} disponíveis para análise na {BRAND.name}.
        </p>
      </div>

      <DirectorySearch companies={companies} emptyMessage="Nenhuma empresa encontrada neste setor." />
    </div>
  )
}

