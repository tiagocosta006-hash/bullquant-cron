/**
 * Soma o software capitalizado ao capex onde a FMP o deixou de fora.
 *
 *   npx tsx scripts/ingest_capex_software.ts [--tickers=MSCI,MA] [--todas] [--dry-run]
 *
 * Corre DEPOIS de ingest_fundamentals_fmp.ts (que repõe `capitalizedSoftware` a null e o
 * `capex` ao valor da FMP). A regra e o porquê estão em lib/sec/capexSoftware.ts.
 *
 *   por omissão  só as empresas de scripts/capex_software_empresas.json (rápido)
 *   --tickers    estas empresas, estejam ou não na lista
 *   --todas      todas as ativas com CIK, para redescobrir casos novos (~10 min, 1 pedido à SEC por empresa)
 *   --dry-run    não escreve; mostra o que mudaria
 *
 * Só linhas em USD (os reporters estrangeiros ficam como vêm). O FCF da linha passa a OCF − capex novo.
 */
import * as dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { extrairSeries, valorAnual, valorTrimestral, decidir, acrescimo, type SeriesSec } from "../lib/sec/capexSoftware";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const TODAS = args.includes("--todas");
const TICKERS = args.find((a) => a.startsWith("--tickers="))?.split("=")[1]?.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
const UA = { "User-Agent": "BullValue Analyst (tiago@bullquant.com)" };
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function factsDaSec(cik: string): Promise<unknown | null> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(Number(cik)).padStart(10, "0")}.json`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    if (r.status === 404) return null;
    await new Promise((res) => setTimeout(res, 1500 * (t + 1)));
  }
  return null;
}

async function main() {
  const lista: string[] = TICKERS ?? JSON.parse(fs.readFileSync(path.resolve(__dirname, "capex_software_empresas.json"), "utf8")).tickers;
  const empresas = await prisma.company.findMany({
    where: { isActive: true, cik: { not: null }, ...(TODAS && !TICKERS ? {} : { ticker: { in: lista } }) },
    select: { id: true, ticker: true, cik: true },
    orderBy: { ticker: "asc" },
  });
  console.log(`[capex-sec] ${empresas.length} empresas${DRY ? " (dry-run)" : ""}`);
  let alteradas = 0, linhasAlteradas = 0;

  for (const e of empresas) {
    const facts = await factsDaSec(e.cik!);
    await new Promise((res) => setTimeout(res, 150)); // SEC: ≤10 pedidos/s
    if (!facts) { console.warn(`[capex-sec] ${e.ticker}: sem facts na SEC`); continue; }
    const series: SeriesSec = extrairSeries(facts);
    if (series.software.length === 0) continue;

    const linhas = await prisma.fundamental.findMany({
      where: { companyId: e.id, capex: { not: null } },
      select: { id: true, periodType: true, fiscalYear: true, periodEnd: true, capex: true, operatingCashFlow: true, revenue: true, capitalizedSoftware: true, reportedCurrency: true },
      orderBy: { periodEnd: "asc" },
    });
    if (linhas.some((l) => l.reportedCurrency && l.reportedCurrency !== "USD")) { console.log(`[capex-sec] ${e.ticker}: moeda ≠ USD, ignorada`); continue; }
    const fim = (d: Date) => d.toISOString().slice(0, 10);

    // 1) decisão por ano fiscal, com o capex da FMP (sem o software que já tenhamos somado)
    const decisaoDoAno = new Map<number, string>();
    for (const l of linhas.filter((x) => x.periodType === "ANNUAL")) {
      const capexFmp = n(l.capex)! - (n(l.capitalizedSoftware) ?? 0);
      decisaoDoAno.set(l.fiscalYear, decidir({ capexFmp, ppe: valorAnual(series.ppe, fim(l.periodEnd)), software: valorAnual(series.software, fim(l.periodEnd)), receita: n(l.revenue) }));
    }

    // 2) aplica. Anuais: pela decisão do ano. Trimestres: pela decisão do ano se ela diz "somar" ou
    //    "incluido" (o mesmo comportamento da FMP em todo o ano); senão (ano em curso sem linha anual,
    //    ou ano misto) decide-se cada trimestre pelos seus números.
    let tocou = 0;
    for (const l of linhas) {
      if (l.capitalizedSoftware !== null) continue; // já aplicado desde a última ingestão da FMP
      const valor = (fatos: typeof series.software) => (l.periodType === "ANNUAL" ? valorAnual(fatos, fim(l.periodEnd)) : valorTrimestral(fatos, fim(l.periodEnd)));
      const sw = valor(series.software);
      const ppe = valor(series.ppe);
      if (sw === null || sw <= 0) continue;
      const doAno = decisaoDoAno.get(l.fiscalYear);
      const individual = () => decidir({ capexFmp: n(l.capex)!, ppe, software: sw, receita: n(l.revenue) });
      const decisao = l.periodType === "ANNUAL" ? (doAno ?? individual()) : doAno === "somar" || doAno === "incluido" ? (doAno === "somar" ? "somar" : "incluido") : individual();
      const extra = decisao === "somar" ? sw : decisao === "completar" && ppe !== null ? acrescimo(decisao, { capexFmp: n(l.capex)!, ppe, software: sw }) : 0;
      if (extra <= 0) continue;
      const capex = n(l.capex)! + extra;
      const ocf = n(l.operatingCashFlow);
      if (DRY) console.log(`  ${e.ticker} ${l.periodType[0]} ${fim(l.periodEnd)} capex ${(n(l.capex)! / 1e6).toFixed(1)} → ${(capex / 1e6).toFixed(1)} (+${(extra / 1e6).toFixed(1)} ${decisao})`);
      else await prisma.fundamental.update({ where: { id: l.id }, data: { capex, capitalizedSoftware: extra, ...(ocf !== null ? { freeCashFlow: ocf - capex } : {}) } });
      tocou++;
    }
    if (tocou) { alteradas++; linhasAlteradas += tocou; console.log(`[capex-sec] ${e.ticker}: ${tocou} linhas`); }
  }
  console.log(`[capex-sec] ${alteradas} empresas, ${linhasAlteradas} linhas ${DRY ? "(não escritas)" : "atualizadas"}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
