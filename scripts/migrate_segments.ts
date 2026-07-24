import { PrismaClient } from '@prisma/client'

async function main() {
  const local = new PrismaClient({ datasources: { db: { url: "postgresql://tiagocosta18@localhost:5432/bullquant" } } })
  const remote = new PrismaClient({ datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } } })
  
  console.log("Fetching local segments...")
  const localRows = await local.fundamental.findMany({
    where: { OR: [ { revenueSegments: { not: null } }, { businessKpis: { not: null } } ] },
    select: { id: true, revenueSegments: true, businessKpis: true }
  })
  
  console.log(`Found ${localRows.length} rows to migrate to production.`)
  
  let count = 0;
  for (const row of localRows) {
    await remote.fundamental.update({
      where: { id: row.id },
      data: { 
        revenueSegments: row.revenueSegments ? row.revenueSegments : undefined,
        businessKpis: row.businessKpis ? row.businessKpis : undefined
      }
    }).catch(() => {})
    
    count++;
    if (count % 500 === 0) {
      console.log(`Migrated ${count}/${localRows.length}...`)
    }
  }
  console.log("Migration complete!")
}
main()
