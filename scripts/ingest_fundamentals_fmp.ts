/**
 * Fundamentais via Financial Modeling Prep.
 *
 *   FMP (income + balance + cash-flow + ratios + key-metrics) → fundamentals
 *
 * Substitui o `scripts/ingest_fundamentals.py` (3 044 linhas de extração de
 * tags XBRL). A razão está em `lib/fmp/cliente.ts`: o motor antigo tinha de
 * escolher qual tag era o lucro e, quando escolhia mal, ninguém dava por isso.
 *
 * Flags:
 *   --tickers=A,B    só estas empresas (por omissão: todas as ativas)
 *   --comparar       não escreve; mostra FMP vs o que está na base
 *   --dry-run        não escreve; mostra o que escreveria
 *   --reconstruir    APAGA os fundamentais de cada empresa e reescreve-os
 *                    a partir da FMP. É o modo de raiz: nada do que o motor
 *                    antigo extraiu sobrevive.
 *   --anos=N         anos de histórico a pedir (por omissão 12)
 *   --so-anuais      salta os trimestres (backfill mais rápido)
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

// Fora do Next.js o .env não é automático, e o @prisma/client lê-o no import.
// Ver a nota longa em scripts/ingest_news.ts.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, PeriodType } from "@prisma/client";
import { fmpGet, emParalelo, FmpError } from "../lib/fmp/cliente";
import { construirLinha, chavePeriodo, coerenciaEps } from "../lib/fmp/mapear";
import { taxaParaUsd, converterLinha } from "../lib/fmp/cambio";
import type {
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpRatios,
  FmpKeyMetrics,
} from "../lib/fmp/tipos";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const COMPARAR = args.includes("--comparar");
const DRY_RUN = args.includes("--dry-run") || COMPARAR;
const SO_ANUAIS = args.includes("--so-anuais");
const RECONSTRUIR = args.includes("--reconstruir");
const ANOS = Number(args.find((a) => a.startsWith("--anos="))?.split("=")[1] ?? 12);
const TICKERS = args
  .find((a) => a.startsWith("--tickers="))
  ?.split("=")[1]
  ?.split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

/** Host da base, sem credenciais — ver a nota em purge_stale_drafts.ts. */
function dbAlvo(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) return "<sem DATABASE_URL/DIRECT_URL>";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "<ilegível>";
  }
}

type Periodo = "annual" | "quarter";

/** Uma linha já convertida em dólares e pronta a inserir. */
type LinhaPronta = Record<string, unknown>;

async function buscarEmpresa(ticker: string, periodo: Periodo, setor: string | null) {
  const limite = periodo === "annual" ? ANOS : ANOS * 4;
  const p = { symbol: ticker, period: periodo, limit: limite };

  const [inc, bal, cf, rat, km] = await Promise.all([
    fmpGet<FmpIncomeStatement[]>("income-statement", p),
    fmpGet<FmpBalanceSheet[]>("balance-sheet-statement", p),
    fmpGet<FmpCashFlow[]>("cash-flow-statement", p),
    fmpGet<FmpRatios[]>("ratios", p).catch(() => [] as FmpRatios[]),
    fmpGet<FmpKeyMetrics[]>("key-metrics", p).catch(() => [] as FmpKeyMetrics[]),
  ]);

  const porChave = <T extends { fiscalYear: string | number; period: string }>(xs: T[]) =>
    new Map(xs.map((x) => [chavePeriodo(x), x]));

  const mBal = porChave(bal);
  const mCf = porChave(cf);
  const mRat = porChave(rat);
  const mKm = porChave(km);

  return inc.map((i) => {
    const k = chavePeriodo(i);
    return {
      linha: construirLinha(i, mBal.get(k), mCf.get(k), mRat.get(k), mKm.get(k), setor),
      coerencia: coerenciaEps(i),
      origem: i,
    };
  });
}

async function main() {
  console.log(`[fmp] base: ${dbAlvo()}`);
  console.log(
    `[fmp] início${COMPARAR ? " (comparar)" : DRY_RUN ? " (dry-run)" : ""} — ${ANOS} anos${SO_ANUAIS ? ", só anuais" : ""}`,
  );

  const empresas = await prisma.company.findMany({
    where: TICKERS ? { ticker: { in: TICKERS } } : { isActive: true },
    select: { id: true, ticker: true, sector: true },
    orderBy: { ticker: "asc" },
  });
  console.log(`[fmp] ${empresas.length} empresas`);

  const periodos: Periodo[] = SO_ANUAIS ? ["annual"] : ["annual", "quarter"];
  let escritas = 0;
  let incoerentes = 0;
  const falhas: string[] = [];
  const semCambio: string[] = [];
  const semDados: string[] = [];

  await emParalelo(empresas, async (empresa) => {
    // Em reconstrução, junta-se tudo o que a FMP dá para esta empresa e só
    // depois se troca — apagar primeiro deixaria uma janela com a empresa sem
    // dados nenhuns se a chamada seguinte falhasse.
    const novas: LinhaPronta[] = [];

    for (const periodo of periodos) {
      let registos;
      try {
        registos = await buscarEmpresa(empresa.ticker, periodo, empresa.sector);
      } catch (erro) {
        const msg = erro instanceof FmpError ? `${erro.status} ${erro.message}` : String(erro);
        falhas.push(`${empresa.ticker} (${periodo}): ${msg.slice(0, 90)}`);
        continue;
      }

      for (const { linha, coerencia, origem } of registos) {
        // A base é toda em dólares. A FMP responde na moeda de reporte e não
        // tem parâmetro para pedir noutra — ver `lib/fmp/cambio.ts`.
        const moeda = (origem.reportedCurrency ?? "USD").toUpperCase();
        const taxa = await taxaParaUsd(moeda, linha.periodEnd as Date);
        if (taxa === null) {
          semCambio.push(`${empresa.ticker} ${origem.fiscalYear}${origem.period} (${moeda})`);
          continue;
        }
        const emDolares = {
          ...converterLinha(linha, taxa),
          reportedCurrency: moeda,
          fxRate: taxa,
          source: "fmp",
        };

        // A identidade netIncome ÷ shares = epsDiluted. Quando falha, o
        // numerador e o denominador são de universos diferentes — foi
        // exatamente isso que passou despercebido na IBKR.
        if (!coerencia.ok) {
          incoerentes++;
          console.warn(
            `[fmp] ⚠ ${empresa.ticker} ${origem.fiscalYear}${origem.period}: ` +
              `NI/ações = ${coerencia.esperado?.toFixed(2)} mas epsDiluted = ${origem.epsDiluted} ` +
              `(desvio ${coerencia.desvio?.toFixed(0)}%)`,
          );
        }

        if (COMPARAR) {
          await compararComBase(empresa.id, empresa.ticker, emDolares);
          continue;
        }
        if (DRY_RUN) continue;

        if (RECONSTRUIR) {
          novas.push(emDolares as LinhaPronta);
          continue;
        }

        const { periodType, fiscalYear, fiscalQuarter, ...resto } = emDolares;

        // `upsert` está fora de questão: a chave única inclui `fiscalQuarter`,
        // que é NULL nas anuais, e o Prisma recusa null num `where` único
        // ("Argument `fiscalQuarter` must not be null"). Find-then-write faz o
        // mesmo trabalho e aceita o null.
        const existente = await encontrar(empresa.id, periodType, fiscalYear, fiscalQuarter);
        if (existente) {
          await prisma.fundamental.update({ where: { id: existente.id }, data: resto });
        } else {
          await prisma.fundamental.create({
            data: { companyId: empresa.id, periodType, fiscalYear, fiscalQuarter, ...resto },
          });
        }
        escritas++;
      }
    }

    // A troca é atómica por empresa: ou a empresa fica inteira com dados da
    // FMP, ou fica como estava. Se a corrida parar a meio, as empresas já
    // feitas estão consistentes e as outras intactas — repetir o comando
    // acaba o trabalho.
    if (RECONSTRUIR) {
      if (novas.length === 0) {
        semDados.push(empresa.ticker);
        return;
      }
      await prisma.$transaction([
        prisma.fundamental.deleteMany({ where: { companyId: empresa.id } }),
        prisma.fundamental.createMany({
          data: novas.map((l) => ({ ...l, companyId: empresa.id })),
        }),
      ]);
      escritas += novas.length;
    }
  });

  console.log(`\n[fmp] ${escritas} linhas escritas | ${incoerentes} incoerências NI/EPS`);
  if (semDados.length) {
    console.log(
      `[fmp] ${semDados.length} empresas sem dados na FMP (mantidas como estavam): ` +
        semDados.slice(0, 25).join(", "),
    );
  }
  if (semCambio.length) {
    console.log(`[fmp] ${semCambio.length} períodos sem câmbio disponível:`);
    for (const x of semCambio.slice(0, 10)) console.log(`  ${x}`);
  }
  if (falhas.length) {
    console.log(`[fmp] ${falhas.length} falhas:`);
    for (const f of falhas.slice(0, 20)) console.log(`  ${f}`);
  }
}

/** Localiza a linha do período. Ver a nota sobre o null na chave única. */
function encontrar(
  companyId: string,
  periodType: PeriodType,
  fiscalYear: number,
  fiscalQuarter: number | null,
) {
  // `select: { id: true }` e não a linha inteira: só se quer saber se existe
  // e com que id. Uma linha de `fundamentals` são 586 bytes e uma
  // reconstrução toca em ~28 000 — trazer tudo custava 16 MB de egress para
  // deitar fora 99% do que vinha. Foi leitura desnecessária como esta que
  // esgotou a quota do Supabase em Setembro.
  return prisma.fundamental.findFirst({
    where: { companyId, periodType, fiscalYear, fiscalQuarter },
    select: { id: true },
  });
}

/** Mostra, campo a campo, onde a FMP difere do que está guardado. */
async function compararComBase(
  companyId: string,
  ticker: string,
  linha: Record<string, unknown>,
) {
  const atual = await encontrar(
    companyId,
    linha.periodType as PeriodType,
    linha.fiscalYear as number,
    linha.fiscalQuarter as number | null,
  );
  if (!atual) return;

  const campos = ["netIncome", "epsDiluted", "sharesOutstanding", "revenue", "totalDebt", "cash"];
  const difs: string[] = [];
  for (const c of campos) {
    const novo = linha[c] as number | null;
    const velho = atual[c as keyof typeof atual] as unknown as { toString(): string } | null;
    if (novo == null || velho == null) continue;
    const v = Number(velho.toString());
    if (v === 0) continue;
    const d = Math.abs((novo - v) / v) * 100;
    if (d > 2) difs.push(`${c}: BD=${v.toPrecision(6)} FMP=${novo.toPrecision(6)} (${d.toFixed(0)}%)`);
  }
  if (difs.length) {
    const q = linha.fiscalQuarter ? `Q${linha.fiscalQuarter}` : "FY";
    console.log(`  ${ticker} ${linha.fiscalYear}${q}: ${difs.join(" | ")}`);
  }
}

main()
  .catch((err) => {
    console.error("[fmp] erro fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
