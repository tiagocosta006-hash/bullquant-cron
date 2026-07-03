const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany({
    where: {
      ticker: {
        startsWith: 'A',
      },
      OR: [
        { ticker: { startsWith: 'A' } },
        { ticker: { startsWith: 'B' } },
        { ticker: { startsWith: 'C' } }
      ],
      sector: {
        in: ['Financials', 'Real Estate', 'Utilities', 'Energy']
      }
    },
    select: {
      ticker: true,
      name: true,
      sector: true
    },
    orderBy: { ticker: 'asc' }
  });
  
  // Re-filter locally since OR combined with startsWith 'A' might be bugged in the query above
  const filtered = companies.filter(c => ['A', 'B', 'C'].includes(c.ticker[0]));
  
  const bySector = {};
  filtered.forEach(c => {
    if (!bySector[c.sector]) bySector[c.sector] = [];
    bySector[c.sector].push(`${c.ticker} (${c.name})`);
  });
  
  for (const [sector, list] of Object.entries(bySector)) {
    console.log(`\n--- ${sector} ---`);
    console.log(list.slice(0, 10).join(', '));
  }
}
main().finally(() => prisma.$disconnect());
