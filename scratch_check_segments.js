const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const f = await prisma.fundamental.findMany({
    where: { company: { ticker: 'AAPL' }, revenueSegments: { not: null } },
    orderBy: { periodEnd: 'desc' },
    take: 3
  })
  
  console.log("AAPL Fundamentals with Segments:")
  f.forEach(row => {
    console.log(`Date: ${row.periodEnd.toISOString().slice(0,10)}, Segments: ${JSON.stringify(row.revenueSegments)}`)
  })
}
main().then(() => prisma.$disconnect())
