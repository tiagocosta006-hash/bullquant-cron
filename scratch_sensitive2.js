const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { ticker: { startsWith: 'A' } },
        { ticker: { startsWith: 'B' } },
        { ticker: { startsWith: 'C' } }
      ],
      sector: {
        in: ['Financials', 'Real Estate', 'Utilities', 'Energy']
      }
    },
    select: { ticker: true, name: true, sector: true },
    orderBy: { ticker: 'asc' }
  });
  
  const bySector = {};
  companies.forEach(c => {
    if (!bySector[c.sector]) bySector[c.sector] = [];
    bySector[c.sector].push(`${c.ticker} (${c.name})`);
  });
  
  for (const [sector, list] of Object.entries(bySector)) {
    console.log(`\n--- ${sector} ---`);
    console.log(list.slice(0, 15).join(', '));
  }
}
main().finally(() => prisma.$disconnect());
