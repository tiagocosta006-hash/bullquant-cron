/**
 * Segmentos de receita (por produto e por geografia) da FMP, gravados nas
 * linhas de `fundamentals` que já existem.
 *
 *   npx tsx scripts/ingest_segments_fmp.ts [--tickers=AAPL,MSFT] [--dry-run]
 *
 * ── Porque é que existe ───────────────────────────────────────────────────
 *
 * A reconstrução dos fundamentais a partir da FMP (ingest_fundamentals_fmp.ts
 * --reconstruir) recria as linhas, e os segmentos vinham de outro extractor
 * (XBRL). Ficaram todos a NULL. A FMP tem os dois eixos desde ~2010, por
 * trimestre e por ano, com o mesmo fiscalYear/period dos statements — por
 * isso casam com as linhas sem adivinhar datas.
 *
 * `revenueSegments` (o que os gráficos usam) fica com o eixo de produto, ou o
 * geográfico quando a empresa só reporta esse. `revenueSegmentsByAxis` guarda
 * os dois. Valores em dólares, com a mesma taxa de câmbio da linha.
 *
 * 4 pedidos por empresa (produto/geografia × anual/trimestral).
 */
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient, PeriodType, Prisma } from "@prisma/client";
import { fmpGet, emParalelo, FmpError, simboloFmp } from "../lib/fmp/cliente";
import { taxaParaUsd } from "../lib/fmp/cambio";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TICKERS = args
  .find((a) => a.startsWith("--tickers="))
  ?.split("=")[1]
  ?.split(",")
  .map((t) => t.trim().toUpperCase())
  .filter(Boolean);

type LinhaSegmentos = {
  fiscalYear: number | string;
  period: string; // "FY" | "Q1".."Q4"
  reportedCurrency?: string | null;
  date: string;
  data: Record<string, number>;
};

type Eixo = "product" | "geography";
const ENDPOINT: Record<Eixo, string> = {
  product: "revenue-product-segmentation",
  geography: "revenue-geographic-segmentation",
};

const chave = (tipo: PeriodType, ano: number, trimestre: number | null) => `${tipo}:${ano}:${trimestre ?? "FY"}`;

async function main() {
  const empresas = await prisma.company.findMany({
    where: {
      isActive: true,
      ticker: TICKERS ? { in: TICKERS } : { not: { startsWith: "^" } },
    },
    select: { id: true, ticker: true },
    orderBy: { ticker: "asc" },
  });
  console.log(`[segmentos] ${empresas.length} empresas${DRY_RUN ? " (dry-run)" : ""}`);

  let linhasEscritas = 0;
  let empresasComDados = 0;
  const falhas: string[] = [];

  await emParalelo(empresas, async (empresa) => {
    // eixo → chave do período → segmentos já em dólares
    const porEixo: Record<Eixo, Map<string, Record<string, number>>> = {
      product: new Map(),
      geography: new Map(),
    };

    const linhas = await prisma.fundamental.findMany({
      where: { companyId: empresa.id },
      select: { id: true, periodType: true, fiscalYear: true, fiscalQuarter: true, periodEnd: true, fxRate: true, reportedCurrency: true },
    });
    const porChave = new Map(linhas.map((l) => [chave(l.periodType, l.fiscalYear, l.fiscalQuarter), l]));

    for (const eixo of ["product", "geography"] as Eixo[]) {
      for (const periodo of ["annual", "quarter"] as const) {
        let resposta: LinhaSegmentos[];
        try {
          resposta = await fmpGet<LinhaSegmentos[]>(ENDPOINT[eixo], {
            symbol: simboloFmp(empresa.ticker),
            period: periodo,
          });
        } catch (erro) {
          const msg = erro instanceof FmpError ? `${erro.status} ${erro.message}` : String(erro);
          falhas.push(`${empresa.ticker} ${eixo}/${periodo}: ${msg.slice(0, 80)}`);
          continue;
        }
        if (!Array.isArray(resposta)) continue;

        for (const r of resposta) {
          const tipo = r.period === "FY" ? PeriodType.ANNUAL : PeriodType.QUARTERLY;
          const trimestre = r.period === "FY" ? null : Number(r.period.replace("Q", ""));
          const k = chave(tipo, Number(r.fiscalYear), trimestre);
          const linha = porChave.get(k);
          if (!linha || !r.data || Object.keys(r.data).length === 0) continue;

          // A mesma taxa que converteu os statements desta linha, para os
          // segmentos somarem à receita que o gráfico mostra ao lado.
          const moeda = (r.reportedCurrency ?? "USD").toUpperCase();
          let taxa = 1;
          if (moeda !== "USD") {
            const daLinha = linha.reportedCurrency?.toUpperCase() === moeda && linha.fxRate ? Number(linha.fxRate) : null;
            const t = daLinha ?? (await taxaParaUsd(moeda, linha.periodEnd));
            if (t === null) continue;
            taxa = t;
          }
          const segs: Record<string, number> = {};
          for (const [nome, v] of Object.entries(r.data)) {
            if (typeof v === "number" && Number.isFinite(v)) segs[nome] = Math.round(v * taxa);
          }
          if (Object.keys(segs).length > 0) porEixo[eixo].set(k, segs);
        }
      }
    }

    const chaves = new Set([...porEixo.product.keys(), ...porEixo.geography.keys()]);
    if (chaves.size === 0) return;
    empresasComDados++;
    if (DRY_RUN) {
      const ultima = [...chaves].filter((k) => k.startsWith("ANNUAL")).sort().pop();
      if (ultima) console.log(`[segmentos] ${empresa.ticker} ${ultima}`, porEixo.product.get(ultima) ?? porEixo.geography.get(ultima));
      linhasEscritas += chaves.size;
      return;
    }

    // `updateMany` e não `update`: devolve só a contagem, não relê a linha —
    // cada linha relida era egress do Supabase.
    const operacoes = [...chaves].map((k) => {
      const product = porEixo.product.get(k) ?? null;
      const geography = porEixo.geography.get(k) ?? null;
      return prisma.fundamental.updateMany({
        where: { id: porChave.get(k)!.id },
        data: {
          revenueSegments: (product ?? geography) as Prisma.InputJsonValue,
          revenueSegmentsByAxis: { product, geography } as Prisma.InputJsonValue,
        },
      });
    });
    await prisma.$transaction(operacoes);
    linhasEscritas += operacoes.length;
  });

  console.log(`[segmentos] ${empresasComDados} empresas com segmentos, ${linhasEscritas} linhas escritas`);
  if (falhas.length) {
    console.log(`[segmentos] ${falhas.length} falhas:`);
    for (const f of falhas.slice(0, 30)) console.log("  ", f);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
