-- Interesses não-controlados: sem este campo Ativo = Passivo + Capital Próprio
-- falha em 534 linhas anuais, porque totalEquity é só a parte do grupo.
ALTER TABLE "fundamentals" ADD COLUMN IF NOT EXISTS "minorityInterest" DECIMAL(20,4);
