import { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { prisma } from "@/lib/prisma"
import { BRAND } from "@/lib/brand"

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
    select: { ticker: true, name: true },
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
  }, {} as Record<string, { ticker: string; name: string }[]>)

  const sortedLetters = Object.keys(grouped).sort()

  return (
    <div className="container mx-auto px-4 py-16 md:py-24 max-w-5xl">
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
          {t("title")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {t("subtitle")}
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="text-center text-muted-foreground p-12 glass rounded-xl">
          {t("empty")}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Alphabet quick navigation */}
          <div className="flex flex-wrap gap-2 justify-center pb-8 border-b border-border/40">
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
                      className="group flex flex-col p-4 rounded-xl glass hover:ring-2 hover:ring-primary/50 transition-all"
                    >
                      <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {company.ticker}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">
                        {company.name}
                      </span>
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
