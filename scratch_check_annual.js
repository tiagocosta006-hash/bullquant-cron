const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const f = await prisma.fundamental.findMany({
    where: { company: { ticker: 'AAPL' }, periodType: 'ANNUAL' },
    orderBy: { periodEnd: 'desc' },
    take: 3
  })
  
  console.log("AAPL ANNUAL Fundamentals:")
  f.forEach(row => {
    console.log(`FY: ${row.fiscalYear}, Segments: ${JSON.stringify(row.revenueSegments)}`)
  })
}
main().then(() => prisma.$disconnect())
