import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ciks = { 'CI': 'CIK0001739940', 'INCY': 'CIK0000877360' };
  
  for (const [ticker, cik] of Object.entries(ciks)) {
    console.log(`\n--- ${ticker} ---`);
    const url = `https://data.sec.gov/api/xbrl/companyfacts/${cik}.json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Tiago Costa tiagocosta18@gmail.com' } });
    const data = await response.json();
    const facts = data.facts['us-gaap'] || data.facts['ifrs-full'];
    
    // Procura tags de cash flow de investimentos (para achar capex)
    const possibleTags = Object.keys(facts).filter(t => t.toLowerCase().includes('property') || t.toLowerCase().includes('equipment'));
    for (const tag of possibleTags) {
      if (facts[tag].units && facts[tag].units['USD']) {
        const hasFY = facts[tag].units['USD'].some((u: any) => u.fp === 'FY' && u.val > 1000000);
        if (hasFY) console.log(tag);
      }
    }
  }
}
main().finally(() => prisma.$disconnect());
