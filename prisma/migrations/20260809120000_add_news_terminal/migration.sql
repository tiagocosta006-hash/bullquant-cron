-- Terminal de Notícias: pipeline RSS/Finnhub -> clustering -> triagem IA ->
-- mini-artigo em PT-PT assinado pela Bull Value.

-- CreateEnum
CREATE TYPE "news_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "news_category" AS ENUM ('MACRO', 'EARNINGS', 'MA', 'CRYPTO', 'COMMODITIES', 'POLICY', 'COMPANY');

-- CreateTable
CREATE TABLE "news_cluster" (
    "id" TEXT NOT NULL,
    "relevanceScore" INTEGER,
    "category" "news_category",
    "tickers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "triageReason" TEXT,
    "triagedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_raw_item" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clusterId" TEXT,

    CONSTRAINT "news_raw_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumoCurto" TEXT NOT NULL,
    "corpo" TEXT NOT NULL,
    "impacto" TEXT NOT NULL,
    "categoria" "news_category" NOT NULL,
    "tickers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentimento" TEXT NOT NULL,
    "status" "news_status" NOT NULL DEFAULT 'PUBLISHED',
    "sources" JSONB NOT NULL,
    "imageUrl" TEXT,
    "modelVersion" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_cluster_relevanceScore_idx" ON "news_cluster"("relevanceScore");
CREATE INDEX "news_cluster_createdAt_idx" ON "news_cluster"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "news_raw_item_dedupKey_key" ON "news_raw_item"("dedupKey");
CREATE INDEX "news_raw_item_publishedAt_idx" ON "news_raw_item"("publishedAt");
CREATE INDEX "news_raw_item_clusterId_idx" ON "news_raw_item"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "news_article_slug_key" ON "news_article"("slug");
CREATE UNIQUE INDEX "news_article_clusterId_key" ON "news_article"("clusterId");
CREATE INDEX "news_article_status_publishedAt_idx" ON "news_article"("status", "publishedAt");
CREATE INDEX "news_article_tickers_idx" ON "news_article"("tickers");

-- AddForeignKey
ALTER TABLE "news_raw_item" ADD CONSTRAINT "news_raw_item_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "news_cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_article" ADD CONSTRAINT "news_article_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "news_cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: mesma convenção das restantes tabelas (20260710000000_enable_rls) —
-- acesso apenas pela ligação de serviço do Prisma, nunca pela chave anon.
ALTER TABLE "news_raw_item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_cluster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "news_article" ENABLE ROW LEVEL SECURITY;
