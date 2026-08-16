import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.mcfscurdnrgyuqrcblvt:Bullocracy2026@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});
async function main() {
  const drafts = await prisma.newsArticle.findMany({ where: { status: "DRAFT" } });
  for (const d of drafts) console.log(d.titulo);
}
main().finally(() => prisma.$disconnect());
