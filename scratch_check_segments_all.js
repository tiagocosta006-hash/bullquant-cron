const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const tickers = ['MSFT', 'GOOGL', 'META', 'TSLA', 'NVDA'];
  for (const t of tickers) {
    const f = await prisma.fundamental.findMany({
      where: { company: { ticker: t }, revenueSegments: { not: null } },
      orderBy: { periodEnd: 'desc' },
      take: 2
    })
    console.log(`\n--- ${t} ---`);
    if (f.length === 0) {
      console.log("No segments found!");
    } else {
      f.forEach(row => {
        console.log(`Date: ${row.periodEnd.toISOString().slice(0,10)}, Type: ${row.periodType}, Segments: ${JSON.stringify(row.revenueSegments)}`)
      })
    }
  }
}
main().then(() => prisma.$disconnect())
