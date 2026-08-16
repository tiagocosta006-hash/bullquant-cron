import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});
async function main() {
  const all = await prisma.newsArticle.findMany({ where: { titulo: { contains: "Berkshire" } } });
  console.log(`Berkshire in ghost DB: ${all.map(a => a.status).join(', ')}`);
  
  const superMicro = await prisma.newsArticle.findMany({ where: { titulo: { contains: "Super Micro" } } });
  console.log(`Super Micro in ghost DB: ${superMicro.map(a => a.status).join(', ')}`);
}
main().finally(() => prisma.$disconnect());
