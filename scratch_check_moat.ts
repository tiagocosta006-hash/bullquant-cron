import { prisma } from "./lib/prisma"

async function main() {
  const c = await prisma.aIInsightCache.findFirst()
  console.log("AIInsightCache.moat:", c?.moat)
  
  const ar = await prisma.analystReport.findFirst()
  console.log("AnalystReport.moat:", JSON.stringify((ar?.reportData as any)?.moat))
}
main().catch(console.error).finally(() => process.exit())
