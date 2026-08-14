import { PrismaClient } from "@prisma/client";
const prismaProd = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});
async function main() {
  const result = await prismaProd.newsArticle.deleteMany({
    where: { titulo: { contains: "Petróleo" } }
  });
  console.log(`Deleted ${result.count} articles.`);
}
main().finally(() => prismaProd.$disconnect());
