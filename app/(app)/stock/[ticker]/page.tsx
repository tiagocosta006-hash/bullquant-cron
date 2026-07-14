import { cache } from 'react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { getUser } from '@/lib/supabase/server'
import { StockHeader } from '@/components/stock/StockHeader'
import { StockSnapshot } from '@/components/stock/StockSnapshot'
import { StockPriceChart } from '@/components/stock/StockPriceChart'
import { SavedValuations, type SerializedDcfAnalysis } from '@/components/stock/SavedValuations'
import { FinancialsEngine } from '@/components/stock/FinancialsEngine'
import { InsiderActivity } from '@/components/stock/InsiderActivity'
import { getCurrencySymbol } from '@/lib/finance/format'

import { CompanyProfile } from '@/components/stock/CompanyProfile'
import { StockNews } from '@/components/stock/StockNews'
import { ManagementTeam } from '@/components/stock/ManagementTeam'
import { StockKPIs } from '@/components/stock/StockKPIs'
import { StockTabs } from '@/components/stock/StockTabs'
import { PremiumPdfButton } from '@/components/stock/pdf/PremiumPdfButton'
import { ValuationMultiples } from '@/components/stock/ValuationMultiples'

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
      title: 'Empresa não encontrada | BullQuant',
    }
  }

  const title = `${company.name} (${company.ticker}) - Análise e Avaliação DCF | BullQuant`
  const description = `Análise fundamental profunda, avaliação DCF e insights de IA para a ${company.name} (${company.ticker}) do setor ${company.sector || 'financeiro'}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `https://bullmetrics.thebullocracy.com/stock/${company.ticker}`,
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
    aiInsightRaw,
    latestPrice
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

    // 6. AI Insights for PDF
    prisma.aIInsightCache.findUnique({
      where: { companyId: company.id }
    }),

    // 7. Latest Price
    prisma.price.findFirst({
      where: { ticker: company.ticker },
      orderBy: { date: 'desc' }
    })
  ])

  const isPro = dbUser?.plan === 'PRO'

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

  let parsedAiInsight = null;
  if (aiInsightRaw) {
    try {
      parsedAiInsight = {
        executiveSummary: aiInsightRaw.executiveSummary,
        moat: aiInsightRaw.moat,
        catalysts: JSON.parse(aiInsightRaw.catalysts),
        risks: JSON.parse(aiInsightRaw.risks),
      }
    } catch (e) {
      console.error("Failed to parse AI Insight JSON for PDF", e);
    }
  }

  // Format data for PDF
  const pdfCompanyData = {
    name: company.name,
    ticker: company.ticker,
    exchange: company.exchange,
    sector: company.sector,
    country: company.country,
    price: latestPrice ? Number(latestPrice.close) : null,
    marketCap: latestPrice && fundamentalsToPass[0]?.sharesOutstanding
      ? Number(latestPrice.close) * Number(fundamentalsToPass[0].sharesOutstanding)
      : null,
  }

  const pdfFundamentals = fundamentalsToPass.map(f => ({
    year: f.fiscalYear,
    revenue: f.revenue ? Number(f.revenue) : null,
    netIncome: f.netIncome ? Number(f.netIncome) : null,
    eps: f.epsDiluted ? Number(f.epsDiluted) : null,
    fcf: f.freeCashFlow ? Number(f.freeCashFlow) : null,
    grossMargin: f.grossMargin ? Number(f.grossMargin) : null,
  }))

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    "name": company.name,
    "tickerSymbol": company.ticker,
    "exchange": company.exchange,
    "url": `https://bullmetrics.thebullocracy.com/stock/${company.ticker}`,
  }

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Header fixo da empresa (info + preço Finnhub ao vivo) */}
      <StockHeader company={{
        ticker: company.ticker,
        name: company.name,
        exchange: company.exchange,
        logoUrl: company.logoUrl,
        currency: company.currency
      }}
      pdfButton={
        <PremiumPdfButton
          company={pdfCompanyData}
          fundamentals={pdfFundamentals}
          aiInsight={parsedAiInsight}
          isPremiumUser={true} // Hardcoded for now as requested
        />
      }
      />

      {/* Conteúdo organizado por intenção, não por scroll infinito */}
      <StockTabs
        overview={
          <>
            <div>
              <h2 className="text-xl font-bold tracking-tight mb-4 text-foreground">{t('snapshotTitle')}</h2>
              <StockSnapshot ticker={company.ticker} fundamentals={JSON.parse(JSON.stringify(fundamentalsToPass))} currencySymbol={currencySymbol} />
            </div>
            <StockPriceChart ticker={company.ticker} currencySymbol={currencySymbol} />
            <CompanyProfile company={company} />
          </>
        }
        financials={
          <FinancialsEngine ticker={company.ticker} sector={company.sector} currencySymbol={currencySymbol} />
        }
        kpis={
          <StockKPIs fundamentals={JSON.parse(JSON.stringify(historicalAnnual))} isPro={isPro} ticker={company.ticker} />
        }
        valuation={
          <>
            <ValuationMultiples ticker={company.ticker} isPro={isPro} />
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
          <>
            <ManagementTeam ticker={company.ticker} />
            <InsiderActivity ticker={company.ticker} currencySymbol={currencySymbol} />
          </>
        }
        news={<StockNews ticker={company.ticker} />}
      />
    </div>
  )
}
