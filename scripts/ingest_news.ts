/**
 * Terminal de Notícias — ingestor horário.
 *
 *   coleta (RSS + Finnhub) → dedup → clustering → triagem IA em lote →
 *   escrita do mini-artigo em PT-PT → news_article
 *
 * Corre no GitHub Actions (.github/workflows/ingest-news.yml).
 *
 * Flags:
 *   --dry-run   não escreve na base de dados; imprime o que faria
 *   --no-llm    salta triagem e escrita (só coleta + clustering)
 *   --max=N     nº máximo de artigos a gerar nesta execução
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

// Fora do Next.js as variáveis de ambiente não são carregadas automaticamente.
// O `override` é necessário: o @prisma/client carrega o `.env` no momento do
// import (e lá as chaves de API estão vazias), pelo que sem ele o `.env.local`
// — que é onde estão os valores reais em dev — nunca ganharia.
// Em CI o `.env.local` não existe, por isso os valores do `env:` do workflow
// mantêm-se intactos.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, NewsStatus, type NewsCategory } from "@prisma/client";
import { collectAllSources } from "../lib/news/sources";
import { clusterItems, matchTickers, rankClusters } from "../lib/news/cluster";
import { triageClusters, AUTO_PUBLISH_THRESHOLD } from "../lib/news/triage";
import { generateArticle } from "../lib/news/generate";
import { slugify } from "../lib/news/normalize";
import { serializeArticle } from "../lib/news/serialize";
import { postArticleForReview } from "../lib/discord/client";
import type { RawNewsItem, StoryCluster } from "../lib/news/types";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const NO_LLM = args.includes("--no-llm");
const MAX_ARTICLES = Number(
  args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? 5
);

/** Só consideramos itens desta janela — notícia velha não está "a bombar". */
const WINDOW_HOURS = 6;
/** Itens brutos órfãos (sem cluster promovido) são purgados após isto. */
const RETENTION_DAYS = 30;

async function main() {
  console.log(
    `[news] início${DRY_RUN ? " (dry-run)" : ""}${NO_LLM ? " (sem LLM)" : ""} — máx ${MAX_ARTICLES} artigos`
  );

  // ---- 1. Coleta -----------------------------------------------------------
  const collected = await collectAllSources();
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 3600_000);
  const fresh = collected.filter((i) => i.publishedAt >= cutoff);
  console.log(`[news] ${collected.length} itens recolhidos, ${fresh.length} na janela de ${WINDOW_HOURS}h`);

  if (fresh.length === 0) {
    console.log("[news] nada a processar");
    return;
  }

  // Itens já vistos em execuções anteriores não voltam a ser processados.
  const known = DRY_RUN
    ? new Set<string>()
    : new Set(
        (
          await prisma.newsRawItem.findMany({
            where: { dedupKey: { in: fresh.map((i) => i.dedupKey) } },
            select: { dedupKey: true },
          })
        ).map((r) => r.dedupKey)
      );

  const novos = fresh.filter((i) => !known.has(i.dedupKey));
  console.log(`[news] ${novos.length} itens novos (${known.size} já conhecidos)`);

  if (!DRY_RUN && novos.length > 0) {
    await prisma.newsRawItem.createMany({
      data: novos.map((i) => ({
        dedupKey: i.dedupKey,
        source: i.source,
        sourceUrl: i.sourceUrl,
        title: i.title,
        summary: i.summary,
        imageUrl: i.imageUrl,
        publishedAt: i.publishedAt,
      })),
      skipDuplicates: true,
    });
  }

  // ---- 2. Clustering (sem LLM) --------------------------------------------
  // Agrupamos sobre TODA a janela, não só os novos: uma história só ganha
  // massa quando a segunda e a terceira fonte a publicam.
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { ticker: true, name: true },
  });

  const clusters = rankClusters(matchTickers(clusterItems(fresh), companies));
  const comCobertura = clusters.filter((c) => c.sourceCount >= 2);
  console.log(
    `[news] ${clusters.length} histórias, ${comCobertura.length} com cobertura multi-fonte`
  );

  // Só histórias com pelo menos um item novo — evita re-triar o que já saiu.
  const novosKeys = new Set(novos.map((i) => i.dedupKey));
  const candidatos = clusters.filter((c) => c.items.some((i) => novosKeys.has(i.dedupKey)));
  console.log(`[news] ${candidatos.length} histórias candidatas a triagem`);

  if (NO_LLM || DRY_RUN) printPreview(candidatos.slice(0, 15));
  if (NO_LLM) return;

  if (candidatos.length === 0) {
    console.log("[news] sem candidatos — fim");
    await purge();
    return;
  }

  // ---- 3. Triagem em lote --------------------------------------------------
  const triados = await triageClusters(candidatos);
  console.log(`[news] ${triados.length} histórias passaram o limiar de relevância`);
  for (const t of triados) {
    console.log(`  [${t.relevanceScore}] ${t.category} — ${t.cluster.lead.title}`);
    console.log(`        ${t.reason}`);
  }

  // ---- 4. Escrita ----------------------------------------------------------
  const aEscrever = triados.slice(0, MAX_ARTICLES);
  if (triados.length > aEscrever.length) {
    console.log(
      `[news] ${triados.length - aEscrever.length} histórias relevantes ficaram de fora (teto de ${MAX_ARTICLES}/execução)`
    );
  }

  let publicados = 0;
  for (const triado of aEscrever) {
    try {
      const artigo = await generateArticle(triado);

      if (DRY_RUN) {
        console.log(`\n──── ${artigo.titulo}`);
        console.log(`     ${artigo.resumoCurto}`);
        console.log(`     sentimento=${artigo.sentimento} tickers=${artigo.tickers.join(",") || "—"}`);
        console.log(`\n${artigo.corpo}\n\nIMPACTO: ${artigo.impacto}\n`);
        publicados++;
        continue;
      }

      const status =
        triado.relevanceScore >= AUTO_PUBLISH_THRESHOLD
          ? NewsStatus.PUBLISHED
          : NewsStatus.DRAFT;

      const criado = await persist(triado.cluster, triado, artigo, status);
      publicados++;
      console.log(`[news] ${status}: ${artigo.titulo}`);

      // Notificação de aprovação no telemóvel. Falhar aqui não é fatal: o
      // artigo fica em DRAFT e continua a aparecer em /admin/news.
      if (status === NewsStatus.DRAFT) {
        const enviado = await postArticleForReview(
          serializeArticle(criado),
          triado.relevanceScore
        );
        console.log(`[news] notificação Discord: ${enviado ? "enviada" : "falhou"}`);
      }
    } catch (err) {
      console.error(`[news] falha a gerar "${triado.cluster.lead.title}":`, (err as Error).message);
    }
  }

  console.log(`[news] ${publicados}/${aEscrever.length} artigos processados`);
  if (!DRY_RUN) await purge();
}

/**
 * Grava cluster + artigo numa transação e liga os itens brutos ao cluster.
 * O `dedupKey` do item líder serve de sufixo do slug: é estável e único, por
 * isso a mesma história nunca gera dois slugs diferentes.
 */
async function persist(
  cluster: StoryCluster,
  triado: { relevanceScore: number; category: string; tickers: string[]; reason: string },
  artigo: Awaited<ReturnType<typeof generateArticle>>,
  status: NewsStatus
) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.newsCluster.create({
      data: {
        relevanceScore: triado.relevanceScore,
        category: triado.category as NewsCategory,
        tickers: triado.tickers,
        triageReason: triado.reason,
        triagedAt: new Date(),
      },
    });

    await tx.newsRawItem.updateMany({
      where: { dedupKey: { in: cluster.items.map((i) => i.dedupKey) } },
      data: { clusterId: created.id },
    });

    return tx.newsArticle.create({
      data: {
        slug: slugify(artigo.titulo, cluster.lead.dedupKey.slice(0, 8)),
        clusterId: created.id,
        titulo: artigo.titulo,
        resumoCurto: artigo.resumoCurto,
        corpo: artigo.corpo,
        impacto: artigo.impacto,
        categoria: triado.category as NewsCategory,
        tickers: artigo.tickers,
        sentimento: artigo.sentimento,
        status,
        sources: artigo.sources,
        imageUrl: artigo.imageUrl,
        modelVersion: artigo.modelVersion,
        publishedAt: cluster.lead.publishedAt,
      },
    });
  });
}

/** Purga itens brutos antigos que nunca foram promovidos a história. */
async function purge() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.newsRawItem.deleteMany({
    where: { clusterId: null, fetchedAt: { lt: cutoff } },
  });
  if (count > 0) console.log(`[news] purgados ${count} itens brutos órfãos`);
}

function printPreview(clusters: StoryCluster[]) {
  console.log("\n[news] top histórias por sinais baratos:");
  for (const c of clusters) {
    const fontes = [...new Set(c.items.map((i: RawNewsItem) => i.source))].join(", ");
    console.log(`  (${c.sourceCount}x) ${c.lead.title}`);
    console.log(`        fontes: ${fontes}`);
    if (c.matchedTickers.length > 0) console.log(`        tickers: ${c.matchedTickers.join(", ")}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("[news] erro fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
