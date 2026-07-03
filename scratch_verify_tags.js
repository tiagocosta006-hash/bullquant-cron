const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const f = await prisma.fundamental.findMany({
    where: { company: { ticker: { in: ['JPM', 'SPG'] } }, periodType: 'ANNUAL', fiscalYear: 2023 },
    include: { company: true }
  });
  
  f.forEach(row => {
    console.log(`[${row.company.ticker}] OpEx: $${(row.operatingExpenses/1e9).toFixed(2)}B | COGS: ${row.costOfRevenue ? '$'+(row.costOfRevenue/1e9).toFixed(2)+'B' : 'NULL'} | Gross Profit: ${row.grossProfit ? '$'+(row.grossProfit/1e9).toFixed(2)+'B' : 'NULL'}`);
  });
}
main().finally(() => prisma.$disconnect());
