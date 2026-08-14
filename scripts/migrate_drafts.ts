import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const prismaLocal = new PrismaClient({
  datasources: { db: { url: "postgresql://tiagocosta18@localhost:5432/bullquant" } }
});
const prismaProd = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

async function main() {
  const drafts = await prismaLocal.newsArticle.findMany({
    where: { status: "DRAFT" },
    include: { cluster: true },
    orderBy: { publishedAt: 'desc' },
    take: 5
  });
  
  for (const draft of drafts) {
    let prodClusterId = null;
    if (draft.cluster) {
       const prodCluster = await prismaProd.newsCluster.create({
         data: {
           relevanceScore: draft.cluster.relevanceScore,
           category: draft.cluster.category,
           tickers: draft.cluster.tickers,
           triageReason: draft.cluster.triageReason,
           triagedAt: draft.cluster.triagedAt,
         }
       });
       prodClusterId = prodCluster.id;
    }

    const created = await prismaProd.newsArticle.create({
      data: {
        slug: draft.slug,
        clusterId: prodClusterId,
        titulo: draft.titulo,
        resumoCurto: draft.resumoCurto,
        corpo: draft.corpo,
        impacto: draft.impacto,
        categoria: draft.categoria,
        tickers: draft.tickers,
        sentimento: draft.sentimento,
        status: "DRAFT",
        sources: draft.sources ? (draft.sources as any) : [],
        imageUrl: draft.imageUrl,
        modelVersion: draft.modelVersion,
        publishedAt: draft.publishedAt,
      }
    });

    const dto = serializeArticle(created);
    // the discord message is already sent via webhook url or bot token from .env.local
    await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
    console.log(`Sent to Discord: ${created.titulo}`);
  }
}
main().finally(() => { prismaLocal.$disconnect(); prismaProd.$disconnect(); });
