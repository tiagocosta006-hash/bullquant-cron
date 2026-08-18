import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { prisma } from "@/lib/prisma"
import { BRAND } from "@/lib/brand"
import { getSectorNameBySlug, SECTORS } from "@/lib/data/sectors"
import { Building2, ArrowLeft } from "lucide-react"

export async function generateStaticParams() {
  return SECTORS.map((sector) => ({
    category: sector.slug,
  }))
}

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
    select: { ticker: true, name: true, logoUrl: true },
    orderBy: { ticker: 'asc' }
  })

  // Group by first letter of ticker
  const grouped = companies.reduce((acc, company) => {
    const letter = company.ticker.charAt(0).toUpperCase()
    if (!acc[letter]) {
      acc[letter] = []
    }
    acc[letter].push(company)
    return acc
  }, {} as Record<string, typeof companies>)

  const sortedLetters = Object.keys(grouped).sort()

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

      <div className="mb-16">
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

      {companies.length === 0 ? (
        <div className="text-center text-muted-foreground p-12 glass rounded-xl">
          Nenhuma empresa encontrada neste setor.
        </div>
      ) : (
        <div className="space-y-12">
          {/* Alphabet quick navigation */}
          {sortedLetters.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-8 border-b border-border/40">
              {sortedLetters.map(letter => (
                <a 
                  key={letter} 
                  href={`#letter-${letter}`}
                  className="w-8 h-8 flex items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground font-medium transition-colors"
                >
                  {letter}
                </a>
              ))}
            </div>
          )}

          {/* Directory Grid */}
          <div className="space-y-16">
            {sortedLetters.map(letter => (
              <div key={letter} id={`letter-${letter}`} className="scroll-mt-24">
                <h2 className="text-3xl font-bold text-primary mb-6 border-b border-border/40 pb-2">
                  {letter}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {grouped[letter].map(company => (
                    <Link 
                      key={company.ticker} 
                      href={`/stock/${company.ticker}`}
                      className="group flex items-start gap-4 p-4 rounded-xl glass hover:ring-2 hover:ring-primary/50 transition-all"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {company.logoUrl ? (
                          <img 
                            src={company.logoUrl} 
                            alt={`${company.name} logo`} 
                            className="w-10 h-10 rounded-full object-contain bg-white dark:bg-white/90 p-0.5"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                            {company.ticker.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                          {company.ticker}
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {company.name}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
