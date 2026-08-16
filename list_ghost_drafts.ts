import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});
async function main() {
  const drafts = await prisma.newsArticle.findMany({ where: { status: "DRAFT" } });
  for (const d of drafts) console.log(d.titulo);
}
main().finally(() => prisma.$disconnect());
