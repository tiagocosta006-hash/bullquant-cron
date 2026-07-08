const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const fundamentals = await prisma.fundamental.findMany({
    where: { company: { ticker: 'SYF' }, periodType: 'ANNUAL' },
    orderBy: { fiscalYear: 'asc' },
    select: { fiscalYear: true, freeCashFlow: true, operatingCashFlow: true, capex: true }
  });
  console.log(fundamentals);
}
main().finally(() => prisma.$disconnect());
