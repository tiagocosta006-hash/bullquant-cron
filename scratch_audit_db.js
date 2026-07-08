const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const metrics = [
    'revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'ebitda', 
    'operatingCashFlow', 'capex', 'freeCashFlow', 'epsDiluted', 
    'operatingExpenses', 'researchAndDevelopment', 'sellingGeneralAndAdmin',
    'cash', 'totalDebt', 'sharesOutstanding'
  ];

  const companies = await prisma.company.findMany({
    select: { id: true, ticker: true, sector: true }
  });

  console.log(`Auditing ${companies.length} companies...`);

  const results = {};
  for (const comp of companies) {
    const fundamentals = await prisma.fundamental.findMany({
      where: { companyId: comp.id, periodType: 'ANNUAL' },
      orderBy: { fiscalYear: 'desc' },
      take: 3 // check last 3 years to see if they consistently lack data
    });

    if (fundamentals.length === 0) continue;

    if (!results[comp.sector]) {
      results[comp.sector] = { total: 0, missing: {} };
      metrics.forEach(m => results[comp.sector].missing[m] = []);
    }
    
    results[comp.sector].total++;

    // For each metric, if it is null in all of the last 3 years, we consider it missing
    metrics.forEach(m => {
      const isMissing = fundamentals.every(f => f[m] === null);
      if (isMissing) {
        results[comp.sector].missing[m].push(comp.ticker);
      }
    });
  }

  for (const [sector, data] of Object.entries(results)) {
    console.log(`\n=== SECTOR: ${sector} (${data.total} companies) ===`);
    for (const [metric, missingList] of Object.entries(data.missing)) {
      if (missingList.length > 0) {
        console.log(`- ${metric} is missing in ${missingList.length} companies: ${missingList.slice(0, 10).join(', ')}${missingList.length > 10 ? '...' : ''}`);
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
