import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";

// Localhost where the drafts were mistakenly created
const prismaLocal = new PrismaClient({
  datasources: { db: { url: "postgresql://tiagocosta18@localhost:5432/bullquant" } }
});

// The TRUE production DB (Supabase New)
const prismaProd = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

async function main() {
  const drafts = await prismaLocal.newsArticle.findMany({
    where: { 
      status: "DRAFT",
      OR: [
        { titulo: { contains: "Berkshire" } },
        { titulo: { contains: "Super Micro" } }
      ]
    },
    include: { cluster: true }
  });
  
  console.log(`Found ${drafts.length} drafts in local DB.`);

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
          status: "DRAFT", // FORCE DRAFT
          sources: draft.sources ? (draft.sources as any) : [],
          imageUrl: draft.imageUrl,
          modelVersion: draft.modelVersion,
          publishedAt: draft.publishedAt,
        }
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
         // Already exists, just update it to DRAFT in case it was published
         created = await prismaProd.newsArticle.update({ 
           where: { slug: draft.slug },
           data: { status: "DRAFT" }
         });
      } else {
         throw err;
      }
    }

    process.env.NEXT_PUBLIC_SITE_URL = "https://thebullvalue.com";
    process.env.DISCORD_BOT_TOKEN = "MTUzNjA2Mjk5MjAzNzQ0OTcyOA.GTzYLn.XE1-rshQstoAfpHcu7PAz6Ertk950BDNkzgdNw";
    process.env.DISCORD_REVIEW_CHANNEL_ID = "1536133105096724552";
    
    if (created) {
      const dto = serializeArticle(created);
      await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
      console.log(`Sent to Discord: ${created.titulo}`);
    }
  }
}
main().finally(() => { prismaLocal.$disconnect(); prismaProd.$disconnect(); });
