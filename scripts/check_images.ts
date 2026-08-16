import { PrismaClient } from "@prisma/client";

const prismaProd = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});

async function main() {
  const articles = await prismaProd.newsArticle.findMany({
    select: { id: true, titulo: true, imageUrl: true }
  });
  console.log(articles);
}
main().finally(() => prismaProd.$disconnect());
