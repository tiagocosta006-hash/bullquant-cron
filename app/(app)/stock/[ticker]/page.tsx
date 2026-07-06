import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
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

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const resolvedParams = await params
  const { ticker } = resolvedParams
  const t = await getTranslations('stock')

  // Fetch the company
  const company = await prisma.company.findUnique({
    where: {
      ticker: ticker.toUpperCase(),
    },
  })

  // If company doesn't exist in our DB, 404
  if (!company) {
    notFound()
  }

  // Fetch user to get their saved DCFs
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let serializedDcfs: SerializedDcfAnalysis[] = []
  if (user) {
    const rawDcfs = await prisma.dcfAnalysis.findMany({
      where: { companyId: company.id, userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    serializedDcfs = rawDcfs.map(dcf => ({
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
  }

  // Fetch the latest fundamentals for TTM calculation
  const latestFundamentals = await prisma.fundamental.findMany({
    where: {
      companyId: company.id,
      periodType: 'QUARTERLY'
    },
    orderBy: {
      periodEnd: 'desc',
    },
    take: 4,
  })

  // Fetch the historical annual fundamentals for the Business KPIs chart
  const historicalAnnual = await prisma.fundamental.findMany({
    where: {
      companyId: company.id,
      periodType: 'ANNUAL'
    },
    orderBy: {
      fiscalYear: 'desc',
    },
    take: 10,
  })

  let fundamentalsToPass = latestFundamentals

  if (fundamentalsToPass.length < 4) {
    // Fallback to the latest ANNUAL record if we don't have enough quarters
    const latestAnnual = await prisma.fundamental.findFirst({
      where: {
        companyId: company.id,
        periodType: 'ANNUAL'
      },
      orderBy: {
        periodEnd: 'desc',
      },
    })
    fundamentalsToPass = latestAnnual ? [latestAnnual] : []
  }

  const currencySymbol = getCurrencySymbol(company.currency)

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* 1. Header (Info + Live Finnhub Price) */}
      <StockHeader company={{
        ticker: company.ticker,
        name: company.name,
        exchange: company.exchange,
        logoUrl: company.logoUrl,
        currency: company.currency
      }} />



      {/* 2. Fundamentals Snapshot */}
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 text-foreground">{t('snapshotTitle')}</h2>
        <StockSnapshot ticker={company.ticker} fundamentals={JSON.parse(JSON.stringify(fundamentalsToPass))} currencySymbol={currencySymbol} />
        <StockKPIs fundamentals={JSON.parse(JSON.stringify(historicalAnnual))} />
      </div>

      {/* 3. Price History Chart */}
      <StockPriceChart ticker={company.ticker} currencySymbol={currencySymbol} />

      {/* 3.5 Saved Valuations */}
      {serializedDcfs.length > 0 && (
        <SavedValuations 
          analyses={serializedDcfs} 
          ticker={company.ticker} 
          currency={currencySymbol}
        />
      )}

      {/* 4. Financials & Decision Engine */}
      <FinancialsEngine ticker={company.ticker} sector={company.sector} currencySymbol={currencySymbol} />

      {/* 5. Insider Activity (SEC Form 4) */}
      <InsiderActivity ticker={company.ticker} currencySymbol={currencySymbol} />

      {/* 6. Company News */}
      <StockNews ticker={company.ticker} />

      {/* 7. Management Team Assessment */}
      <ManagementTeam ticker={company.ticker} />

      {/* 8. Company Profile */}
      <CompanyProfile company={company} />
    </div>
  )
}
