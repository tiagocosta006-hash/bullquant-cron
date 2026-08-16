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
    where: { 
      status: "DRAFT",
      OR: [
        { titulo: { contains: "Berkshire" } },
        { titulo: { contains: "Super Micro" } }
      ]
    },
    include: { cluster: true }
  });
  
  console.log(`Found ${drafts.length} drafts.`);

  for (const draft of drafts) {
    // Override siteUrl to point to prod instead of localhost!
    process.env.NEXT_PUBLIC_SITE_URL = "https://thebullvalue.com";
    const dto = serializeArticle(draft);
    await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
    console.log(`Sent to Discord: ${draft.titulo}`);
  }
}
main().finally(() => { prismaProd.$disconnect(); });
