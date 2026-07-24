import { PrismaClient } from '@prisma/client'

async function main() {
  const local = new PrismaClient({ datasources: { db: { url: "postgresql://tiagocosta18@localhost:5432/bullquant" } } })
  const remote = new PrismaClient({ datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } } })
  
  console.log("Fetching local segments...")
  const localRows = await local.fundamental.findMany({
    where: { OR: [ { revenueSegments: { not: null } }, { businessKpis: { not: null } } ] },
    select: { companyId: true, periodType: true, periodEnd: true, revenueSegments: true, businessKpis: true }
  })
  
  console.log(`Found ${localRows.length} true rows to migrate to production.`)
  
  let count = 0;
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < localRows.length; i += BATCH_SIZE) {
    const batch = localRows.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(row => 
      remote.fundamental.updateMany({
        where: { 
          companyId: row.companyId,
          periodType: row.periodType,
          periodEnd: row.periodEnd
        },
        data: { 
          revenueSegments: row.revenueSegments ? row.revenueSegments : undefined,
          businessKpis: row.businessKpis ? row.businessKpis : undefined
        }
      }).catch((e) => { console.error("Error updating:", e) })
    ))
    count += batch.length;
    console.log(`Migrated ${count}/${localRows.length}...`)
  }
  console.log("Migration complete!")
}
main()
