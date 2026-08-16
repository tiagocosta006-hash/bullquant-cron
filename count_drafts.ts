import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});
async function main() {
  const count = await prisma.newsArticle.count({ where: { status: "DRAFT" } });
  console.log(`DRAFTS in prod: ${count}`);
}
main().finally(() => prisma.$disconnect());
