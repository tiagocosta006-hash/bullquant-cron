/**
 * Terminal de Notícias — purga de rascunhos não aprovados.
 *
 *   news_article (DRAFT, publishedAt < hoje - N dias) → ARCHIVED
 *
 * Um rascunho que ninguém aprovou durante dias deixou de ser notícia. Sem isto
 * a fila de revisão cresce sem fim (chegou a 500 artigos em Setembro de 2026) e
 * o canal do Discord fica inutilizável.
 *
 * Por omissão **arquiva**, não apaga. ARCHIVED é exactamente o estado em que
 * fica um artigo quando se carrega em "Rejeitar" no Discord
 * (app/api/news/review/route.ts) — portanto isto não inventa semântica nova, só
 * automatiza o que farias à mão, e o admin continua a poder republicar.
 * O `--hard` apaga a linha de vez, e aí não há retorno.
 *
 * O cluster e os itens brutos ficam sempre: o `dedupKey` de cada NewsRawItem é
 * o que impede a mesma história de voltar a ser ingerida na execução seguinte.
 * Apagar o cluster faria o artigo renascer. Os órfãos são limpos pelo `purge()`
 * do ingest_news.ts ao fim de 30 dias.
 *
 * Corre no GitHub Actions (.github/workflows/purge-stale-drafts.yml).
 *
 * Flags:
 *   --dry-run   não escreve nada; imprime o que faria
 *   --days=N    idade a partir da qual um rascunho é purgado (por omissão 2)
 *   --hard      apaga a linha em vez de a arquivar (irreversível)
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

// Mesma razão que em ingest_news.ts: fora do Next.js o .env não é automático e
// o @prisma/client lê-o no import, por isso o .env.local tem de ganhar.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, NewsStatus } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HARD = args.includes("--hard");
const DAYS = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 2);

/**
 * Host da base a que vamos ligar, sem credenciais.
 *
 * O `dotenv` acima corre com `override: true`, por isso o `.env.local` ganha a
 * qualquer variável exportada na shell — em dev isso aponta para o localhost.
 * Num script que mexe em massa em linhas, saber contra que base se está a
 * correr não é um detalhe: é a diferença entre limpar a fila e mexer na base
 * errada.
 */
function dbAlvo(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) return "<sem DATABASE_URL/DIRECT_URL>";
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "<connection string ilegível>";
  }
}

async function main() {
  if (!Number.isFinite(DAYS) || DAYS < 1) {
    throw new Error(`--days tem de ser >= 1 (recebido: ${DAYS})`);
  }

  const modo = HARD ? "APAGAR" : "arquivar";
  console.log(`[purga] base: ${dbAlvo()}`);
  console.log(
    `[purga] início${DRY_RUN ? " (dry-run)" : ""} — ${modo} rascunhos com mais de ${DAYS} dias`
  );

  const cutoff = new Date(Date.now() - DAYS * 86_400_000);

  const stale = await prisma.newsArticle.findMany({
    where: { status: NewsStatus.DRAFT, publishedAt: { lt: cutoff } },
    select: { id: true, titulo: true, publishedAt: true },
    orderBy: { publishedAt: "asc" },
  });

  if (stale.length === 0) {
    console.log("[purga] nada a purgar");
    return;
  }

  console.log(`[purga] ${stale.length} rascunhos anteriores a ${cutoff.toISOString()}`);
  for (const a of stale.slice(0, 10)) {
    console.log(`  ${a.publishedAt.toISOString().slice(0, 16)} — ${a.titulo.slice(0, 70)}`);
  }
  if (stale.length > 10) console.log(`  … e mais ${stale.length - 10}`);

  if (DRY_RUN) {
    console.log("[purga] dry-run — nada foi escrito");
    return;
  }

  const ids = stale.map((a) => a.id);
  if (HARD) {
    const { count } = await prisma.newsArticle.deleteMany({ where: { id: { in: ids } } });
    console.log(`[purga] ${count} rascunhos apagados`);
  } else {
    const { count } = await prisma.newsArticle.updateMany({
      where: { id: { in: ids } },
      data: { status: NewsStatus.ARCHIVED },
    });
    console.log(`[purga] ${count} rascunhos arquivados`);
  }

  const restantes = await prisma.newsArticle.count({ where: { status: NewsStatus.DRAFT } });
  console.log(`[purga] ficam ${restantes} rascunhos por aprovar`);
}

main()
  .catch((err) => {
    console.error("[purga] erro fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
