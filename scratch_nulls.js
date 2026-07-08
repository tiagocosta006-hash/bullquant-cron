const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fields = [
    'revenue', 'costOfRevenue', 'grossProfit', 'operatingExpenses', 'operatingIncome',
    'interestExpense', 'taxExpense', 'netIncome', 'epsDiluted', 'sharesOutstanding',
    'operatingCashFlow', 'capex', 'freeCashFlow', 'totalAssets', 'totalCurrentLiab',
    'longTermDebt', 'totalDebt', 'cash', 'totalEquity',
    'grossMargin', 'operatingMargin', 'netMargin', 'returnOnEquity', 'roic', 'dividendPerShare'
  ];

  const companies = await prisma.company.findMany({
    select: { id: true, sector: true }
  });
  
  const sectorMap = {};
  companies.forEach(c => { sectorMap[c.id] = c.sector; });

  const fundamentals = await prisma.fundamental.findMany({
    select: { companyId: true, ...fields.reduce((acc, f) => ({ ...acc, [f]: true }), {}) }
  });

  const nullsBySector = {};
  const totalBySector = {};
  
  fundamentals.forEach(f => {
    const sector = sectorMap[f.companyId] || 'Unknown';
    if (!totalBySector[sector]) totalBySector[sector] = 0;
    totalBySector[sector]++;
    
    if (!nullsBySector[sector]) {
      nullsBySector[sector] = {};
      fields.forEach(field => nullsBySector[sector][field] = 0);
    }
    
    fields.forEach(field => {
      if (f[field] === null) {
        nullsBySector[sector][field]++;
      }
    });
  });

  console.log("=== ANÁLISE DE BURACOS (NULLs) POR SETOR ===");
  for (const sector in nullsBySector) {
    console.log(`\n-- ${sector} (Total Registos: ${totalBySector[sector]}) --`);
    const missing = [];
    for (const field in nullsBySector[sector]) {
      const count = nullsBySector[sector][field];
      const perc = ((count / totalBySector[sector]) * 100).toFixed(1);
      if (count > 0) {
        missing.push(`${field}: ${count} (${perc}%)`);
      }
    }
    
    // Sort descending by percentage
    missing.sort((a, b) => {
      const pA = parseFloat(a.split('(')[1]);
      const pB = parseFloat(b.split('(')[1]);
      return pB - pA;
    });
    
    console.log(missing.join('\n'));
  }
}

main().finally(() => prisma.$disconnect());
