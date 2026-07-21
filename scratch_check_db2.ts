import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
async function main() {
  const analysis = await prisma.dcfAnalysis.findUnique({ where: { id: "cmrsjgmz1000psx48sfnhy8zw" } })
  console.log("Analysis:", analysis)
}
main().catch(console.error).finally(() => prisma.$disconnect())
