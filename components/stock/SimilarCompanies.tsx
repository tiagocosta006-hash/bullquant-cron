import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, GitCompareArrows } from 'lucide-react'

interface SimilarCompany {
  ticker: string
  name: string
  logoUrl: string | null
}

export async function SimilarCompanies({ companies, baseTicker, group }: { companies: SimilarCompany[]; baseTicker: string; group: string }) {
  const t = await getTranslations('stock')

  if (!companies || companies.length === 0) return null

  return (
    <div className="glass rounded-3xl p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {group ? t('peersTitle', { group }) : t('peersTitleGeneric')}
        </h2>
        <Link
          href="/explore"
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
        >
          {t('similarCompaniesExploreAll')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {companies.map((c) => (
          <Link
            key={c.ticker}
            href={`/stock/${c.ticker}`}
            className="group flex items-center gap-4 rounded-2xl border border-border/50 bg-card/40 p-4 transition-all hover:bg-card/80 hover:shadow-sm"
          >
            {c.logoUrl ? (
              <Image
                src={c.logoUrl}
                alt={c.name}
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                {c.ticker.slice(0, 1)}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <div className="font-semibold truncate">{c.ticker}</div>
              <div className="text-xs text-muted-foreground truncate">{c.name}</div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-6 flex justify-center">
        <Link
          href={`/compare?ticker=${baseTicker}`}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-card hover:shadow-sm"
        >
          <GitCompareArrows className="h-4 w-4" />
          {t('similarCompaniesCompare')}
        </Link>
      </div>
    </div>
  )
}
