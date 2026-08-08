import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const user = await prisma.user.findFirst()
    const company = await prisma.company.findFirst({ where: { ticker: 'META' } })
    if (!user || !company) throw new Error("Missing data")

    const fairValue = 573.96
    const currentPrice = 593.32
    const marginOfSafety = (fairValue - currentPrice) / fairValue // -0.033730573559133036

    const created = await prisma.dcfAnalysis.create({
      data: {
        userId: user.id,
        companyId: company.id,
        label: "Teste Precisao",
        fcfMode: 'FCFF',
        fcf0: 46861150000.123456, // Let's also test precision on fcf0
        growthStage1: 0.168123456, // And growthStage1
        growthStage2: 0.084123,
        wacc: 0.094123,
        terminalGrowth: 0.021234,
        shares: 2574000000.123,
        netDebt: -22848000000.123,
        fairValue: fairValue,
        priceAtSave: currentPrice,
        marginOfSafety: marginOfSafety,
      },
    })
    console.log("Success with high precision floats:", created.id)
  } catch (e) {
    console.error("Prisma error:", e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
