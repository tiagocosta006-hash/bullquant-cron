-- Partições de receita por eixo XBRL (segmento operacional / produto / geografia).
-- revenueSegments mantém-se como partição principal em mapa plano.
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "revenueSegmentsByAxis" JSONB;
