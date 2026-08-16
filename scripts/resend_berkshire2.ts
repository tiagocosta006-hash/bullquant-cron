import { PrismaClient } from "@prisma/client";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

const prismaGhost = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.gesfjjyoscikgcpfrflj:Bullocracy26.@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

const prismaProd = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres.mcfscurdnrgyuqrcblvt:Bullocracy2026@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true" } }
});

async function main() {
  const drafts = await prismaGhost.newsArticle.findMany({
    where: { 
      OR: [
        { titulo: { contains: "Berkshire" } },
        { titulo: { contains: "Super Micro" } }
      ]
    },
    include: { cluster: true }
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
          status: "DRAFT", // FORCE DRAFT!
          sources: draft.sources ? (draft.sources as any) : [],
          imageUrl: draft.imageUrl,
          modelVersion: draft.modelVersion,
          publishedAt: draft.publishedAt,
        }
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
         // If it exists, let's just get it and resend!
         created = await prismaProd.newsArticle.findUnique({ where: { slug: draft.slug }});
      } else {
         throw err;
      }
    }

    // Force NEXT_PUBLIC_SITE_URL to production so the "Ler" button is correct
    process.env.NEXT_PUBLIC_SITE_URL = "https://thebullvalue.com";
    
    if (created) {
      const dto = serializeArticle(created);
      await postArticleForReview(dto, draft.cluster?.relevanceScore || 50);
      console.log(`Sent to Discord: ${created.titulo}`);
    }
  }
}
main().finally(() => { prismaGhost.$disconnect(); prismaProd.$disconnect(); });
