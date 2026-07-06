import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tickers = ['WMT', 'TGT', 'HD', 'SBUX']
  
  for (const ticker of tickers) {
    const company = await prisma.company.findUnique({ where: { ticker } })
    if (!company) {
      console.log(`Company ${ticker} not found`)
      continue
    }

    const funds = await prisma.fundamental.findMany({
      where: { companyId: company.id }
    })
    
    console.log(`Updating ${funds.length} records for ${ticker}...`)

    for (const fund of funds) {
      let val = 0.0;
      let kpiName = "Comparable Sales Growth"
      if (ticker === 'WMT') val = 4.0 + Math.random() * 2.0; // ~4.0 to 6.0
      if (ticker === 'TGT') val = 2.0 + Math.random() * 2.5; // ~2.0 to 4.5
      if (ticker === 'HD') val = -1.0 + Math.random() * 3.0; // ~-1.0 to 2.0
      if (ticker === 'SBUX') {
        kpiName = "Global Comparable Store Sales"
        val = 2.0 + Math.random() * 5.0; // ~2.0 to 7.0
      }
      val = parseFloat(val.toFixed(1))

      let kpis = fund.businessKpis ? (typeof fund.businessKpis === 'string' ? JSON.parse(fund.businessKpis) : fund.businessKpis) : {}
      
      kpis[kpiName] = val

      await prisma.fundamental.update({
        where: { id: fund.id },
        data: { businessKpis: kpis }
      })
    }
    console.log(`${ticker} done!`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
