import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
async function main() {
  const analysis = await prisma.dcfAnalysis.findUnique({ where: { id: "cmrsiy8y4000nsx48nhi8i6sg" } })
  console.log("Analysis:", analysis)
}
main().catch(console.error).finally(() => prisma.$disconnect())
