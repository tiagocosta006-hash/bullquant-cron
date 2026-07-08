import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

interface Anomaly {
  ticker: string
  type: string
  details: string
}

async function main() {
  console.log('A ligar à base de dados para validação...')

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, name: true }
  })

  console.log(`Foram encontradas ${companies.length} empresas ativas. A iniciar varrimento...`)

  const anomalies: Anomaly[] = []
  
  for (const company of companies) {
    const fundamentals = await prisma.fundamental.findMany({
      where: { companyId: company.id },
      orderBy: [
        { fiscalYear: 'asc' },
        { fiscalQuarter: 'asc' }
      ]
    })
    
    // Validate missing quarters (if ANNUAL exists, should have Q1-Q3 at least)
    const years = new Set(fundamentals.map(f => f.fiscalYear))
    for (const year of years) {
      const yearRows = fundamentals.filter(f => f.fiscalYear === year)
      const hasAnnual = yearRows.some(f => f.periodType === 'ANNUAL')
      const quarters = yearRows.filter(f => f.periodType === 'QUARTERLY').map(f => f.fiscalQuarter)
      
      if (hasAnnual) {
        if (!quarters.includes(1) || !quarters.includes(2) || !quarters.includes(3)) {
          anomalies.push({
            ticker: company.ticker,
            type: 'MISSING_QUARTERS',
            details: `FY${year} tem relatorio anual, mas faltam trimestres. Trimestres encontrados: [${quarters.join(', ')}]`
          })
        }
      }
    }
    
    // Validate each row
    for (const row of fundamentals) {
      const period = row.periodType === 'ANNUAL' ? `FY${row.fiscalYear}` : `Q${row.fiscalQuarter} '${row.fiscalYear}`
      
      // 1. Missing Vital Metrics
      if (row.revenue === null) anomalies.push({ ticker: company.ticker, type: 'MISSING_REVENUE', details: `${period} não tem Revenue` })
      if (row.netIncome === null) anomalies.push({ ticker: company.ticker, type: 'MISSING_NET_INCOME', details: `${period} não tem Net Income` })
      if (row.operatingCashFlow === null) anomalies.push({ ticker: company.ticker, type: 'MISSING_OCF', details: `${period} não tem Operating Cash Flow` })
      
      // 2. Cash Flow Discrepancies
      if (row.operatingCashFlow !== null && row.capex !== null && row.freeCashFlow === null) {
         anomalies.push({ ticker: company.ticker, type: 'MISSING_FCF', details: `${period} tem OCF e CapEx, mas não tem FCF calculado` })
      }
      
      // 3. Impossible Ratios / Margins
      const gm = row.grossMargin ? Number(row.grossMargin) : null
      const om = row.operatingMargin ? Number(row.operatingMargin) : null
      const nm = row.netMargin ? Number(row.netMargin) : null
      
      if (gm !== null && (gm > 1.05 || gm < -2)) anomalies.push({ ticker: company.ticker, type: 'EXTREME_MARGIN', details: `${period} Gross Margin = ${(gm*100).toFixed(1)}%` })
      if (om !== null && (om > 1.05 || om < -5)) anomalies.push({ ticker: company.ticker, type: 'EXTREME_MARGIN', details: `${period} Operating Margin = ${(om*100).toFixed(1)}%` })
      if (nm !== null && (nm > 1.50 || nm < -10)) anomalies.push({ ticker: company.ticker, type: 'EXTREME_MARGIN', details: `${period} Net Margin = ${(nm*100).toFixed(1)}%` })
      
      // 4. Accounting Integrity
      const rev = row.revenue ? Number(row.revenue) : null
      const gp = row.grossProfit ? Number(row.grossProfit) : null
      const assets = row.totalAssets ? Number(row.totalAssets) : null
      const liab = row.totalCurrentLiab ? Number(row.totalCurrentLiab) : null
      
      if (rev !== null && gp !== null && gp > rev) {
        anomalies.push({ ticker: company.ticker, type: 'GP_GREATER_THAN_REV', details: `${period} Gross Profit (${gp}) > Revenue (${rev})` })
      }
      if (assets !== null && assets < 0) {
        anomalies.push({ ticker: company.ticker, type: 'NEGATIVE_ASSETS', details: `${period} Total Assets < 0` })
      }
      if (assets !== null && liab !== null && assets < liab && row.periodType === 'ANNUAL') {
         anomalies.push({ ticker: company.ticker, type: 'LIAB_GREATER_THAN_ASSETS', details: `${period} Current Liab (${liab}) > Total Assets (${assets})` })
      }
    }
  }
  
  // Create Markdown Report
  let report = `# Database Health Report\n\nGerado em: ${new Date().toISOString()}\n\n`
  report += `Total de Empresas Analisadas: ${companies.length}\n`
  report += `Total de Anomalias Encontradas: ${anomalies.length}\n\n`
  
  // Group by Ticker
  const byTicker = anomalies.reduce((acc, a) => {
    if (!acc[a.ticker]) acc[a.ticker] = []
    acc[a.ticker].push(a)
    return acc
  }, {} as Record<string, Anomaly[]>)

  for (const [ticker, list] of Object.entries(byTicker)) {
    report += `## ${ticker} (${list.length} anomalias)\n`
    const byType = list.reduce((acc, a) => {
      if (!acc[a.type]) acc[a.type] = []
      acc[a.type].push(a.details)
      return acc
    }, {} as Record<string, string[]>)
    
    for (const [type, details] of Object.entries(byType)) {
      report += `- **${type}**: ${details.length > 5 ? details.slice(0,5).join(', ') + `... e mais ${details.length - 5}` : details.join(', ')}\n`
    }
    report += '\n'
  }
  
  fs.writeFileSync('database_health_report.md', report)
  console.log('Relatório escrito em database_health_report.md')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
