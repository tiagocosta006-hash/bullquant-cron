import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
async function main() {
  await prisma.dcfAnalysis.update({
    where: { id: "cmrsjgmz1000psx48sfnhy8zw" },
    data: { isPublic: true }
  })
  console.log("New Analysis is now public!")
}
main().catch(console.error).finally(() => prisma.$disconnect())
