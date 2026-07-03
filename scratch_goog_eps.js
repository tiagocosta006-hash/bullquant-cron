const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const f = await prisma.fundamental.findMany({
    where: { company: { ticker: { in: ['GOOGL', 'GOOG'] } } },
    orderBy: [{ fiscalYear: 'desc' }, { fiscalQuarter: 'desc' }],
    take: 6
  })
  console.log("GOOGL/GOOG Fundamentals:")
  f.forEach(row => {
    console.log(`FY: ${row.fiscalYear}, Q: ${row.fiscalQuarter}, Type: ${row.periodType}, EPS Diluted: ${row.epsDiluted}`)
  })
  
  const cal = await prisma.earningsEvent.findMany({
    where: { company: { ticker: { in: ['GOOGL', 'GOOG'] } } },
    orderBy: { date: 'desc' },
    take: 6
  })
  console.log("\nGOOGL/GOOG Earnings Calendar:")
  cal.forEach(row => {
    console.log(`Date: ${row.date.toISOString().slice(0,10)}, FY: ${row.fiscalYear}, Q: ${row.fiscalQuarter}, EPS Actual: ${row.epsActual}, EPS Est: ${row.epsEstimate}`)
  })
}
main().then(() => prisma.$disconnect())
