import { prisma } from "../lib/prisma";
import { postArticleForReview } from "../lib/discord/client";
import { serializeArticle } from "../lib/news/serialize";
import { NewsStatus } from "@prisma/client";

async function main() {
  console.log("Fetching PUBLISHED articles...");
  const articles = await prisma.newsArticle.findMany({
    where: { status: NewsStatus.PUBLISHED },
    orderBy: { publishedAt: "desc" },
    include: { cluster: true },
  });

  console.log(`Found ${articles.length} published articles. Resending to Discord...`);

  let successCount = 0;
  for (const article of articles) {
    const dto = serializeArticle(article);
    const success = await postArticleForReview(dto, article.cluster?.relevanceScore ?? null);
    if (success) {
      successCount++;
      console.log(`✅ Sent: ${article.titulo}`);
    } else {
      console.log(`❌ Failed: ${article.titulo}`);
    }
    // Rate limit delay to avoid hitting Discord's API rate limits
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nFinished! Successfully resent ${successCount}/${articles.length} articles.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
