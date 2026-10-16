/**
 * Retenção do Pulse (analytics próprio): apaga eventos com mais de N dias (por omissão 180).
 * A Política de Privacidade promete esta retenção; corre todos os dias (workflow purge-pulse.yml).
 *
 *   npx tsx scripts/purge_pulse.ts [--dias=180] [--dry-run]
 */
import * as dotenv from "dotenv";
import * as path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dias = Number(process.argv.find((a) => a.startsWith("--dias="))?.split("=")[1] ?? 180);
const DRY = process.argv.includes("--dry-run");

async function main() {
  if (!Number.isFinite(dias) || dias < 30) throw new Error(`--dias inválido (${dias}): mínimo 30`);
  const limite = new Date(Date.now() - dias * 86_400_000);
  const n = await prisma.pulseEvent.count({ where: { createdAt: { lt: limite } } });
  console.log(`[pulse] ${n} eventos com mais de ${dias} dias (antes de ${limite.toISOString().slice(0, 10)})${DRY ? " — dry-run" : ""}`);
  if (!DRY && n > 0) {
    const r = await prisma.pulseEvent.deleteMany({ where: { createdAt: { lt: limite } } });
    console.log(`[pulse] ${r.count} apagados`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
