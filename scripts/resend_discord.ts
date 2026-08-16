import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const prismaProd = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.mcfscurdnrgyuqrcblvt:Bullocracy2026@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

async function main() {
  const drafts = await prismaProd.newsArticle.findMany({
    where: { status: "DRAFT" },
    include: { cluster: true },
    orderBy: { publishedAt: 'desc' },
  });
  
  for (const draft of drafts) {
    const dto = serializeArticle(draft);
    await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
    console.log(`Sent to Discord: ${draft.titulo}`);
  }
}
main().finally(() => { prismaProd.$disconnect(); });
