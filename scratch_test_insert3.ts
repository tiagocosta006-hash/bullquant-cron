import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  try {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error("No user found")

    const company = await prisma.company.findFirst({ where: { ticker: 'META' } })
    if (!company) throw new Error("No company found")

    console.log("Found user and company, attempting insert...")

    const inputs = {
      fcfMode: 'FCFF',
      fcf0: 46861150000,
      growthStage1: 0.168,
      growthStage2: 0.084,
      wacc: 0.094,
      terminalGrowth: 0.02,
      shares: 2574000000,
      netDebt: -22848000000
    }

    const created = await prisma.dcfAnalysis.create({
      data: {
        userId: user.id,
        companyId: company.id,
        label: "Teste",
        notes: "apenas um teste",
        fcfMode: inputs.fcfMode,
        fcf0: inputs.fcf0,
        growthStage1: inputs.growthStage1,
        growthStage2: inputs.growthStage2,
        wacc: inputs.wacc,
        terminalGrowth: inputs.terminalGrowth,
        shares: inputs.shares,
        netDebt: inputs.netDebt,
        fairValue: 573.96,
        priceAtSave: 593.32,
        marginOfSafety: -0.034,
      },
    })
    console.log("Success:", created.id)
  } catch (e) {
    console.error("Prisma error:")
    console.error(e)
  } finally {
    await prisma.$disconnect()
  }
}

main()
