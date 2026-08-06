import { cache } from 'react'
import dynamic from 'next/dynamic'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { getUser } from '@/lib/supabase/server'
import { StockHeader } from '@/components/stock/StockHeader'
import { StockSnapshot } from '@/components/stock/StockSnapshot'
const StockPriceChart = dynamic(() => import('@/components/stock/StockPriceChart').then(mod => mod.StockPriceChart))
import { SavedValuations, type SerializedDcfAnalysis } from '@/components/stock/SavedValuations'
const FinancialsEngine = dynamic(() => import('@/components/stock/FinancialsEngine').then(mod => mod.FinancialsEngine))
import { InsiderActivity } from '@/components/stock/InsiderActivity'
import { getCurrencySymbol } from '@/lib/finance/format'
import { isDevUnlocked } from '@/lib/devAccess'
import { BRAND } from '@/lib/brand'

import { LatestResults } from '@/components/stock/LatestResults'
import { CompanyProfile } from '@/components/stock/CompanyProfile'
import { StockNews } from '@/components/stock/StockNews'
import { ManagementTeam } from '@/components/stock/ManagementTeam'
const StockAnalyst = dynamic(() => import('@/components/stock/StockAnalyst').then(mod => mod.StockAnalyst))
import { StockTabs } from '@/components/stock/StockTabs'
const ValuationMultiples = dynamic(() => import('@/components/stock/ValuationMultiples').then(mod => mod.ValuationMultiples))
const PriceVsEarnings = dynamic(() => import('@/components/stock/PriceVsEarnings').then(mod => mod.PriceVsEarnings))
import { ShareStockModal } from '@/components/stock/ShareStockModal'
import { SimilarCompanies } from '@/components/stock/SimilarCompanies'

// Partilhado entre generateMetadata e a página (React.cache = 1 query por pedido,
// em vez de 2 findUnique idênticos).
const getCompany = cache(async (ticker: string) =>
  prisma.company.findUnique({
    where: { ticker: ticker.toUpperCase() },
  })
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>
}): Promise<Metadata> {
  const resolvedParams = await params
  const { ticker } = resolvedParams

  const company = await getCompany(ticker)

  if (!company) {
    return {
      title: `Empresa não encontrada | ${BRAND.name}`,
    }
  }

  const title = `${company.name} (${company.ticker}): Cotação, Análise Fundamental e Valor Justo DCF | ${BRAND.name}`
  const description = `Consulte a cotação da ${company.name} (${company.ticker}), demonstrações financeiras de 10 anos, modelo de valor justo DCF e análise de IA do setor ${company.sector || 'financeiro'}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/opengraph-image'],
    },
    alternates: {
      canonical: `${BRAND.siteUrl}/stock/${company.ticker}`,
    }
  }
}


export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const resolvedParams = await params
  const { ticker } = resolvedParams
  const t = await getTranslations('stock')

  // LEVEL 1: Fetch company and auth user in parallel
  const [company, user] = await Promise.all([
    getCompany(ticker),
    getUser(),
  ])

  // If company doesn't exist in our DB, 404
  if (!company) {
    notFound()
  }

  // LEVEL 2: Fetch all dependent data in parallel
  const [
    dbUser,
    rawDcfs,
    latestFundamentals,
    historicalAnnual,
    latestAnnual,
    latestPrice,
    latestEarnings,
    similarCompanies
  ] = await Promise.all([
    // 1. User PRO plan
    user ? prisma.user.findUnique({ where: { id: user.id } }) : Promise.resolve(null),
    
    // 2. Saved DCFs
    user ? prisma.dcfAnalysis.findMany({
      where: { companyId: company.id, userId: user.id },
      orderBy: { createdAt: 'desc' },
    }) : Promise.resolve([]),
    
    // 3. Latest Quarterly Fundamentals (TTM)
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: 'QUARTERLY' },
      orderBy: { periodEnd: 'desc' },
      take: 4,
    }),
    
    // 4. Historical Annual Fundamentals
    prisma.fundamental.findMany({
      where: { companyId: company.id, periodType: 'ANNUAL' },
      orderBy: { fiscalYear: 'desc' },
      take: 10,
    }),

    // 5. Fallback Latest Annual (if quarters are missing)
    prisma.fundamental.findFirst({
      where: { companyId: company.id, periodType: 'ANNUAL' },
      orderBy: { periodEnd: 'desc' },
    }),

    // 7. Latest Price
    prisma.price.findFirst({
      where: { ticker: company.ticker },
      orderBy: { date: 'desc' }
    }),

    prisma.earningsEvent.findFirst({
      where: { companyId: company.id, epsActual: { not: null } },
      orderBy: { date: 'desc' },
    }),

    // 8. Peers — mesma INDÚSTRIA (peers reais); fallback para o setor só quando
    // a industry não está preenchida. Ordem determinística por ticker.
    prisma.company.findMany({
      where: {
        isActive: true,
        ticker: { not: { startsWith: '^' } },
        id: { not: company.id },
        ...(company.industry
          ? { industry: company.industry }
          : { sector: company.sector }),
      },
      take: 4,
      orderBy: { ticker: 'asc' },
      select: { ticker: true, name: true, logoUrl: true }
    })
  ])

  // DEV_UNLOCK_PRO no .env.local abre o conteúdo gated em desenvolvimento;
  // em produção isDevUnlocked() é sempre false (ver lib/devAccess.ts).
  const devUnlocked = isDevUnlocked()
  const isPro = dbUser?.plan === 'PRO' || devUnlocked
  const isLoggedIn = !!user || devUnlocked

  // Overlay preliminar: revenue/EPS já reportados (earnings) que ainda não estão
  // nos fundamentais oficiais (10-Q). Mostra-se como barra provisória no gráfico
  // trimestral e desaparece sozinho quando o filing chega. Só quando o report é
  // de um trimestre mais recente do que o último fundamental (>55 dias entre o
  // fim do último trimestre conhecido e a data do report = há trimestre por reportar).
  const latestQuarterly = latestFundamentals[0]
  let preliminaryQuarter:
    | { fiscalYear: number; fiscalQuarter: number; revenue: number | null; epsDiluted: number | null }
    | null = null
  if (
    latestEarnings?.revenueActual != null &&
    latestQuarterly?.periodEnd &&
    latestQuarterly.fiscalQuarter != null &&
    (latestEarnings.date.getTime() - latestQuarterly.periodEnd.getTime()) / 86_400_000 > 55
  ) {
    const q = latestQuarterly.fiscalQuarter
    preliminaryQuarter = {
      fiscalYear: q === 4 ? latestQuarterly.fiscalYear + 1 : latestQuarterly.fiscalYear,
      fiscalQuarter: q === 4 ? 1 : q + 1,
      revenue: Number(latestEarnings.revenueActual),
      epsDiluted: latestEarnings.epsActual != null ? Number(latestEarnings.epsActual) : null,
    }
  }

  const serializedDcfs: SerializedDcfAnalysis[] = rawDcfs.map(dcf => ({
    id: dcf.id,
    label: dcf.label,
    fairValue: Number(dcf.fairValue),
    priceAtSave: dcf.priceAtSave ? Number(dcf.priceAtSave) : null,
    marginOfSafety: dcf.marginOfSafety ? Number(dcf.marginOfSafety) : null,
    createdAt: dcf.createdAt.toISOString(),
    wacc: Number(dcf.wacc),
    growthStage1: Number(dcf.growthStage1),
    terminalGrowth: Number(dcf.terminalGrowth),
  }))

  let fundamentalsToPass = latestFundamentals
  if (fundamentalsToPass.length < 4) {
    fundamentalsToPass = latestAnnual ? [latestAnnual] : []
  }

  const currencySymbol = getCurrencySymbol(company.currency)

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Corporation",
        "name": company.name,
        "tickerSymbol": company.ticker,
        "exchange": company.exchange,
        "url": `${BRAND.siteUrl}/stock/${company.ticker}`,
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": BRAND.name,
            "item": BRAND.siteUrl
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Explorar Ações",
            "item": `${BRAND.siteUrl}/explore`
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": company.ticker,
            "item": `${BRAND.siteUrl}/stock/${company.ticker}`
          }
        ]
      }
    ]
  }

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header fixo da empresa (info + preço Finnhub ao vivo com fallback SSR) */}
      <StockHeader 
        company={{
          ticker: company.ticker,
          name: company.name,
          exchange: company.exchange,
          logoUrl: company.logoUrl,
          currency: company.currency
        }}
        initialPriceData={latestPrice ? {
          currentPrice: Number(latestPrice.close),
          change: 0,
          changePercent: 0,
        } : null}
        shareComponent={
          <ShareStockModal
            ticker={company.ticker}
            companyName={company.name}
          />
        }
      />

      {/* Conteúdo organizado por intenção, não por scroll infinito */}
      <StockTabs
        isEtf={company.exchange === 'MACRO'}
        overview={
          <>
            {latestEarnings && (
              <LatestResults
                fiscalYear={latestEarnings.fiscalYear}
                fiscalQuarter={latestEarnings.fiscalQuarter}
                date={latestEarnings.date.toISOString().slice(0, 10)}
                epsEstimate={latestEarnings.epsEstimate !== null ? Number(latestEarnings.epsEstimate) : null}
                epsActual={latestEarnings.epsActual !== null ? Number(latestEarnings.epsActual) : null}
                revenueEstimate={latestEarnings.revenueEstimate !== null ? Number(latestEarnings.revenueEstimate) : null}
                revenueActual={latestEarnings.revenueActual !== null ? Number(latestEarnings.revenueActual) : null}
                currencySymbol={currencySymbol}
              />
            )}
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-4 text-foreground">{t('snapshotTitle')}</h2>
              <StockSnapshot 
                ticker={company.ticker} 
                fundamentals={JSON.parse(JSON.stringify(fundamentalsToPass))} 
                currencySymbol={currencySymbol}
                initialPrice={latestPrice ? Number(latestPrice.close) : null}
              />
            </div>
            <StockPriceChart ticker={company.ticker} currencySymbol={currencySymbol} />
            <CompanyProfile company={company} />
          </>
        }
        financials={
          company.exchange !== 'MACRO' && <FinancialsEngine ticker={company.ticker} sector={company.sector} currencySymbol={currencySymbol} preliminary={preliminaryQuarter} />
        }
        analista={
          company.exchange !== 'MACRO' && <StockAnalyst
            ticker={company.ticker}
            fundamentals={JSON.parse(JSON.stringify(historicalAnnual))}
            isPro={isPro}
            isLoggedIn={isLoggedIn}
            currencySymbol={currencySymbol}
          />
        }
        valuation={
          company.exchange !== 'MACRO' && <>
            <ValuationMultiples ticker={company.ticker} isPro={isPro} isLoggedIn={isLoggedIn} />
            <PriceVsEarnings ticker={company.ticker} isPro={isPro} isLoggedIn={isLoggedIn} currencySymbol={currencySymbol} />
            {serializedDcfs.length > 0 ? (
              <SavedValuations
                analyses={serializedDcfs}
                ticker={company.ticker}
                currency={currencySymbol}
              />
            ) : (
              <div className="glass rounded-2xl p-8 text-center">
                <p className="text-sm text-muted-foreground">{t('tabs.valuationEmpty')}</p>
                <a href={`/dcf?ticker=${company.ticker}`} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                  {t('tabs.valuationCta')}
                </a>
              </div>
            )}
          </>
        }
        company={
          company.exchange !== 'MACRO' && <>
            <ManagementTeam ticker={company.ticker} />
            <InsiderActivity ticker={company.ticker} currencySymbol={currencySymbol} />
          </>
        }
        news={<StockNews ticker={company.ticker} />}
      />

      {company.exchange !== 'MACRO' && similarCompanies.length > 0 && (
        <div className="mt-8">
          <SimilarCompanies companies={similarCompanies} baseTicker={company.ticker} group={company.industry ?? company.sector ?? ''} />
        </div>
      )}
    </div>
  )
}
