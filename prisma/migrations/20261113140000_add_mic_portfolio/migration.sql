BEGIN;

DO $$ BEGIN
  CREATE TYPE "mic_trade_side" AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "mic_portfolio" (
  "id" TEXT PRIMARY KEY CHECK ("id" = 'MIC'),
  "initialCapital" DECIMAL(20,4) NOT NULL CHECK ("initialCapital" > 0),
  "cash" DECIMAL(20,4) NOT NULL CHECK ("cash" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "mic_positions" (
  "portfolioId" TEXT NOT NULL REFERENCES "mic_portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ticker" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL CHECK ("quantity" > 0),
  "costBasis" DECIMAL(20,4) NOT NULL CHECK ("costBasis" >= 0),
  PRIMARY KEY ("portfolioId", "ticker")
);

CREATE TABLE IF NOT EXISTS "mic_trades" (
  "id" UUID PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL,
  "portfolioId" TEXT NOT NULL REFERENCES "mic_portfolio"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "analystId" TEXT NOT NULL,
  "ticker" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "side" "mic_trade_side" NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL CHECK ("quantity" > 0),
  "price" DECIMAL(18,6) NOT NULL CHECK ("price" > 0),
  "total" DECIMAL(20,4) NOT NULL CHECK ("total" > 0),
  "quotedAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "mic_trades_sequence_key" ON "mic_trades"("sequence");
CREATE INDEX IF NOT EXISTS "mic_trades_portfolioId_sequence_idx" ON "mic_trades"("portfolioId", "sequence");

ALTER TABLE "mic_portfolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mic_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mic_trades" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mic_trades" ADD COLUMN IF NOT EXISTS "analystName" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "mic_activity" (
  "id" BIGSERIAL PRIMARY KEY,
  "analystId" TEXT NOT NULL,
  "analystName" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "mic_activity_analystId_createdAt_idx" ON "mic_activity"("analystId", "createdAt");
ALTER TABLE "mic_activity" ENABLE ROW LEVEL SECURITY;

COMMIT;
