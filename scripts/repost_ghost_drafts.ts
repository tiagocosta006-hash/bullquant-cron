import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// The ghost DB where I mistakenly wrote the news earlier
const prismaGhost = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

// The real prod DB
const prismaProd = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.mcfscurdnrgyuqrcblvt:Bullocracy2026@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

async function main() {
  const drafts = await prismaGhost.newsArticle.findMany({
    where: { status: "DRAFT" },
    include: { cluster: true },
    orderBy: { publishedAt: 'desc' }
  });
  
  for (const draft of drafts) {
    let prodClusterId = null;
    if (draft.cluster) {
       const prodCluster = await prismaProd.newsCluster.create({
         data: {
           relevanceScore: draft.cluster.relevanceScore,
           category: draft.cluster.category as any,
           tickers: draft.cluster.tickers,
           triageReason: draft.cluster.triageReason,
           triagedAt: draft.cluster.triagedAt,
         }
       });
       prodClusterId = prodCluster.id;
    }

    let created;
    try {
      created = await prismaProd.newsArticle.create({
        data: {
          slug: draft.slug,
          clusterId: prodClusterId,
          titulo: draft.titulo,
          resumoCurto: draft.resumoCurto,
          corpo: draft.corpo,
          impacto: draft.impacto,
          categoria: draft.categoria as any,
          tickers: draft.tickers,
          sentimento: draft.sentimento as any,
          status: "DRAFT",
          sources: draft.sources ? (draft.sources as any) : [],
          imageUrl: draft.imageUrl,
          modelVersion: draft.modelVersion,
          publishedAt: draft.publishedAt,
        }
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        console.log(`Skipping ${draft.titulo}, already exists.`);
        continue;
      }
      throw err;
    }

    const dto = serializeArticle(created);
    await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
    console.log(`Sent to Discord: ${created.titulo}`);
  }
}
main().finally(() => { prismaGhost.$disconnect(); prismaProd.$disconnect(); });
