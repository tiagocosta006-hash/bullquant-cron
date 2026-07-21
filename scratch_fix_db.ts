import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()
async function main() {
  await prisma.dcfAnalysis.update({
    where: { id: "cmrsiy8y4000nsx48nhi8i6sg" },
    data: { isPublic: true }
  })
  console.log("Analysis is now public!")
}
main().catch(console.error).finally(() => prisma.$disconnect())
