import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const tickers = ['WMT', 'TGT', 'HD', 'SBUX']
  for (const ticker of tickers) {
    const company = await prisma.company.findUnique({ where: { ticker } })
    if (company) {
      const fund = await prisma.fundamental.findFirst({
        where: { companyId: company.id },
        orderBy: { periodEnd: 'desc' }
      })
      console.log(`${ticker}: ${JSON.stringify(fund?.businessKpis)}`)
    }
  }
}
main().finally(() => prisma.$disconnect())
