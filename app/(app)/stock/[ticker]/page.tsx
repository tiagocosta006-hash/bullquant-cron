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

import { CompanyProfile } from '@/components/stock/CompanyProfile'
import { StockNews } from '@/components/stock/StockNews'
import { ManagementTeam } from '@/components/stock/ManagementTeam'
import { PremiumPdfButton } from '@/components/stock/pdf/PremiumPdfButton'

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

  let fundamentalsToPass = latestFundamentals

  if (latestFundamentals.length < 4) {
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

  // Fetch AI Insights safely for PDF
  const aiInsightRaw = await prisma.aIInsightCache.findUnique({
    where: { companyId: company.id }
  })
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

  const latestPrice = await prisma.price.findFirst({
    where: { ticker: company.ticker },
    orderBy: { date: 'desc' }
  })

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

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
      {/* 1. Header (Info + Live Finnhub Price) */}
      <StockHeader company={{
        ticker: company.ticker,
        name: company.name,
        exchange: company.exchange,
        logoUrl: company.logoUrl
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



      {/* 2. Fundamentals Snapshot */}
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4 text-foreground">{t('snapshotTitle')}</h2>
        <StockSnapshot ticker={company.ticker} fundamentals={JSON.parse(JSON.stringify(fundamentalsToPass))} />
      </div>

      {/* 3. Price History Chart */}
      <StockPriceChart ticker={company.ticker} />

      {/* 3.5 Saved Valuations */}
      {serializedDcfs.length > 0 && (
        <SavedValuations 
          analyses={serializedDcfs} 
          ticker={company.ticker} 
          currency={company.currency === 'EUR' ? '€' : '$'}
        />
      )}

      {/* 4. Financials & Decision Engine */}
      <FinancialsEngine ticker={company.ticker} sector={company.sector} />

      {/* 5. Insider Activity (SEC Form 4) */}
      <InsiderActivity ticker={company.ticker} />

      {/* 6. Company News */}
      <StockNews ticker={company.ticker} />

      {/* 7. Management Team Assessment */}
      <ManagementTeam ticker={company.ticker} />

      {/* 8. Company Profile */}
      <CompanyProfile company={company} />
    </div>
  )
}
