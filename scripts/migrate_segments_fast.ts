import { PrismaClient } from '@prisma/client'

async function main() {
  const local = new PrismaClient({ datasources: { db: { url: "postgresql://tiagocosta18@localhost:5432/bullquant" } } })
  const remote = new PrismaClient({ datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } } })
  
  console.log("Fetching local segments...")
  const localRows = await local.fundamental.findMany({
    where: { OR: [ { revenueSegments: { not: null } }, { businessKpis: { not: null } } ] },
    select: { id: true, revenueSegments: true, businessKpis: true }
  })
  
  // Fazer skip dos primeiros 6500 para não repetir trabalho
  const toMigrate = localRows.slice(6500)
  console.log(`Found ${toMigrate.length} remaining rows to migrate to production.`)
  
  let count = 6500;
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = toMigrate.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(row => 
      remote.fundamental.update({
        where: { id: row.id },
        data: { 
          revenueSegments: row.revenueSegments ? row.revenueSegments : undefined,
          businessKpis: row.businessKpis ? row.businessKpis : undefined
        }
      }).catch(() => {})
    ))
    count += batch.length;
    console.log(`Migrated ${count}/${localRows.length}...`)
  }
  console.log("Migration complete!")
}
main()
