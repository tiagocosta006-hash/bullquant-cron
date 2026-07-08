const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany({
    where: { ticker: { in: ['TSLA', 'AMZN', 'JPM'] } },
    include: {
      fundamentals: {
        orderBy: { periodEnd: 'desc' },
        take: 1,
        select: { fiscalYear: true, revenue: true, netIncome: true, epsDiluted: true, freeCashFlow: true }
      }
    }
  });
  
  console.log("=== VERIFICAÇÃO MANUAL DE EXATIDÃO ===");
  companies.forEach(c => {
    const f = c.fundamentals[0];
    const b = (n) => n ? `$${(n / 1e9).toFixed(2)}B` : 'NULL';
    console.log(`\n[${c.ticker}] - ${c.name} (FY${f.fiscalYear})`);
    console.log(`Receita (Revenue): ${b(f.revenue)}`);
    console.log(`Lucro Líquido (Net Income): ${b(f.netIncome)}`);
    console.log(`EPS: $${f.epsDiluted?.toFixed(2)}`);
    console.log(`Free Cash Flow: ${b(f.freeCashFlow)}`);
  });
}
main().finally(() => prisma.$disconnect());
