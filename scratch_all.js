const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const f = await prisma.fundamental.findMany({
    where: { company: { ticker: 'ALL' }, periodType: 'ANNUAL' },
    orderBy: { fiscalYear: 'asc' }
  });
  console.log("ALL Fundamentals:");
  f.forEach(row => {
    console.log(`Year: ${row.fiscalYear}, OpEx: ${row.operatingExpenses}, SG&A: ${row.sellingGeneralAndAdmin}, Revenue: ${row.revenue}`);
  });
}
main().finally(() => prisma.$disconnect());
