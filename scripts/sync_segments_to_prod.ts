import { PrismaClient, Prisma, PeriodType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Sincroniza revenueSegments/businessKpis da BD LOCAL (fonte da verdade,
// trabalho de extração do Tiago) para a produção Supabase. Local é dono
// destes dois campos; tudo o resto (revenue, netIncome, etc.) NÃO é tocado —
// a produção continua dona dos valores financeiros normais. Um campo só é
// escrito se o LOCAL o tiver — nunca apaga um valor de produção que o local
// não tenha (ex: businessKpis, raro — só 21 linhas locais).
//
// Casamento por (ticker, periodType, fiscalYear, fiscalQuarter) — os
// companyId são cuids independentes entre as duas BDs, não são comparáveis.
//
// Uso: npx tsx scripts/sync_segments_to_prod.ts             (dry-run)
//      npx tsx scripts/sync_segments_to_prod.ts --apply

const envLocal = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.dev')));
const envProd = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env')));

const LOCAL_URL = envLocal.DIRECT_URL;
const PROD_URL = envProd.DIRECT_URL;

if (!LOCAL_URL || !PROD_URL) {
  console.error('DIRECT_URL em falta em .env.dev ou .env');
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(LOCAL_URL)) {
  console.error(`ERRO: .env.dev DIRECT_URL não é localhost (${LOCAL_URL}) — abortado por segurança.`);
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(PROD_URL)) {
  console.error('ERRO: .env DIRECT_URL aponta para localhost — não é produção. Abortado.');
  process.exit(1);
}

const localPrisma = new PrismaClient({ datasources: { db: { url: LOCAL_URL } } });
const prodPrisma = new PrismaClient({ datasources: { db: { url: PROD_URL } } });

const APPLY = process.argv.includes('--apply');

type Key = string;
const keyOf = (ticker: string, periodType: string, fy: number, fq: number | null) =>
  `${ticker}|${periodType}|${fy}|${fq ?? 'null'}`;

async function main() {
  console.log(`Modo: ${APPLY ? 'APLICAR (escreve em produção)' : 'DRY-RUN (só relatório, nada é escrito)'}`);

  const localRows = await localPrisma.fundamental.findMany({
    where: { OR: [{ revenueSegments: { not: Prisma.DbNull } }, { businessKpis: { not: Prisma.DbNull } }] },
    select: {
      periodType: true, fiscalYear: true, fiscalQuarter: true,
      revenueSegments: true, businessKpis: true,
      company: { select: { ticker: true } },
    },
  });
  console.log(`Local: ${localRows.length} linhas com revenueSegments e/ou businessKpis.`);

  const byKey = new Map<Key, (typeof localRows)[number]>();
  for (const r of localRows) byKey.set(keyOf(r.company.ticker, r.periodType, r.fiscalYear, r.fiscalQuarter), r);

  const tickers = [...new Set(localRows.map((r) => r.company.ticker))];
  const prodCompanies = await prodPrisma.company.findMany({
    where: { ticker: { in: tickers } },
    select: { id: true, ticker: true },
  });
  const prodCompanyIdByTicker = new Map(prodCompanies.map((c) => [c.ticker, c.id]));

  const missingInProd = tickers.filter((t) => !prodCompanyIdByTicker.has(t));
  if (missingInProd.length > 0) {
    console.log(`Aviso: ${missingInProd.length} tickers não existem em produção (ignorados): ${missingInProd.slice(0, 20).join(', ')}${missingInProd.length > 20 ? '…' : ''}`);
  }

  let alreadySame = 0;
  let toInsertNew = 0;
  let toChange = 0;
  const prodKeysSeen = new Set<Key>();
  const updates: {
    prodCompanyId: string; periodType: PeriodType; fiscalYear: number; fiscalQuarter: number | null;
    data: Prisma.FundamentalUpdateInput;
  }[] = [];

  for (const [ticker, prodCompanyId] of prodCompanyIdByTicker) {
    const prodRows = await prodPrisma.fundamental.findMany({
      where: { companyId: prodCompanyId },
      select: { periodType: true, fiscalYear: true, fiscalQuarter: true, revenueSegments: true, businessKpis: true },
    });
    for (const pr of prodRows) {
      const k = keyOf(ticker, pr.periodType, pr.fiscalYear, pr.fiscalQuarter);
      prodKeysSeen.add(k);
      const local = byKey.get(k);
      if (!local) continue; // esta linha de prod não tem segmentos locais para sincronizar

      const data: Prisma.FundamentalUpdateInput = {};
      let changed = false;
      if (local.revenueSegments != null) {
        if (JSON.stringify(local.revenueSegments) !== JSON.stringify(pr.revenueSegments ?? null)) {
          data.revenueSegments = local.revenueSegments as Prisma.InputJsonValue;
          changed = true;
        }
      }
      if (local.businessKpis != null) {
        if (JSON.stringify(local.businessKpis) !== JSON.stringify(pr.businessKpis ?? null)) {
          data.businessKpis = local.businessKpis as Prisma.InputJsonValue;
          changed = true;
        }
      }
      if (!changed) { alreadySame++; continue; }

      if (pr.revenueSegments == null && pr.businessKpis == null) toInsertNew++;
      else toChange++;
      if (process.argv.includes('--sample') && toChange + toInsertNew <= 10) {
        console.log(`\n[${ticker} ${pr.fiscalYear}${pr.fiscalQuarter ? 'Q' + pr.fiscalQuarter : ''}]`);
        console.log('  prod atual :', JSON.stringify(pr.revenueSegments));
        console.log('  local (novo):', JSON.stringify(local.revenueSegments));
      }
      updates.push({ prodCompanyId, periodType: pr.periodType, fiscalYear: pr.fiscalYear, fiscalQuarter: pr.fiscalQuarter, data });
    }
  }

  const noMatchingRow = [...byKey.keys()].filter((k) => !prodKeysSeen.has(k)).length;

  console.log(`\n=== Diagnóstico ===`);
  console.log(`Já idênticos em produção:      ${alreadySame}`);
  console.log(`Novos (prod não tinha nada):    ${toInsertNew}`);
  console.log(`Diferentes (prod tinha outro):  ${toChange}`);
  console.log(`Sem período correspondente:     ${noMatchingRow} (local tem a linha, prod não tem esse fiscalYear/Quarter)`);
  console.log(`Total a atualizar:              ${updates.length}`);

  if (!APPLY) {
    console.log('\nDry-run — nada foi escrito. Corre com --apply para aplicar.');
    return;
  }

  console.log(`\nA aplicar ${updates.length} atualizações em produção...`);
  const CONCURRENCY = 8;
  let done = 0;
  for (let i = 0; i < updates.length; i += CONCURRENCY) {
    const batch = updates.slice(i, i + CONCURRENCY);
    // updateMany (não update com a chave composta): fiscalQuarter NULL nas
    // linhas ANNUAL não é aceite pelo tipo gerado da chave composta — como
    // filtro simples de updateMany não há esse problema, e o @@unique garante
    // que isto afeta no máximo 1 linha (equivalente a um update singular).
    await Promise.all(batch.map((u) =>
      prodPrisma.fundamental.updateMany({
        where: {
          companyId: u.prodCompanyId,
          periodType: u.periodType,
          fiscalYear: u.fiscalYear,
          fiscalQuarter: u.fiscalQuarter,
        },
        data: u.data,
      })
    ));
    done += batch.length;
    if (done % 500 < CONCURRENCY) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`Concluído: ${updates.length} linhas atualizadas em produção.`);
}

main()
  .catch((e) => { console.error('ERRO FATAL:', e); process.exitCode = 1; })
  .finally(async () => {
    await localPrisma.$disconnect();
    await prodPrisma.$disconnect();
  });
