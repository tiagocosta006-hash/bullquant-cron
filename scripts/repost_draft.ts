import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const prismaProd = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
    }
  }
});

async function main() {
  const article = await prismaProd.newsArticle.findFirst({
    where: { status: "DRAFT" },
    include: { cluster: true },
    orderBy: { publishedAt: "desc" }
  });

  if (!article) {
    console.log("No DRAFT articles found in production!");
    return;
  }

  console.log(`Found draft: ${article.titulo}`);
  const dto = serializeArticle(article);
  const success = await postArticleForReview(dto, article.cluster?.relevanceScore || 50);
  console.log(`Posted to review channel: ${success}`);
}

main().finally(() => prismaProd.$disconnect());
