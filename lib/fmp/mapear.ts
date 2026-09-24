import { PeriodType } from "@prisma/client";
import type {
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpRatios,
  FmpKeyMetrics,
} from "./tipos";

/**
 * Tradução FMP → modelo `Fundamental`.
 *
 * Duas decisões ficam aqui e não nas rotas, porque são as que, mal feitas,
 * reintroduzem os erros que esta migração veio corrigir.
 */

/**
 * Lucro atribuível aos acionistas da empresa cotada.
 *
 * ── A armadilha ──────────────────────────────────────────────────────────
 *
 * O campo `netIncome` da FMP não tem semântica constante:
 *
 *     IBKR FY2025   netIncome 984 M      bottomLine 984 M     (já é o atribuível)
 *     PLD  FY2025   netIncome 3 411 M    bottomLine 3 340 M   (o 1º inclui minoritários)
 *
 * Mapear `netIncome → netIncome` às cegas repetiria, com outro fornecedor,
 * exatamente o erro da Interactive Brokers: publicar o lucro do grupo inteiro
 * dividido pelas ações da cotada.
 *
 * O `bottomLineNetIncome` é o valor sobre o qual a própria FMP calcula o
 * `epsDiluted`, e é esse que tem de chegar à base — é o que o acionista pode
 * reclamar como seu. Quando os dois coincidem, a escolha é inócua.
 */
export function lucroAtribuivel(inc: FmpIncomeStatement): number | null {
  const bottom = inc.bottomLineNetIncome;
  const net = inc.netIncome;
  if (bottom !== null && bottom !== undefined) return bottom;
  return net ?? null;
}

/**
 * O lucro guardado é coerente com o EPS e as ações que a FMP publica?
 *
 * `netIncome ÷ sharesDiluted` tem de dar `epsDiluted`. É uma identidade
 * contabilística, não uma heurística: quando falha, ou o numerador é de um
 * universo (o grupo) e o denominador de outro (a cotada), ou a contagem de
 * ações veio em unidades erradas. Foi a ausência desta verificação que deixou
 * a IBKR publicada a 7,81 durante meses.
 *
 * A tolerância é generosa (2%) porque a FMP arredonda o EPS a 2-4 casas e em
 * empresas com EPS pequeno o arredondamento domina.
 */
export function coerenciaEps(inc: FmpIncomeStatement): {
  ok: boolean;
  esperado: number | null;
  desvio: number | null;
} {
  const ni = lucroAtribuivel(inc);
  const shares = inc.weightedAverageShsOutDil;
  const eps = inc.epsDiluted;

  if (!ni || !shares || !eps || Math.abs(eps) < 0.01) {
    return { ok: true, esperado: null, desvio: null };
  }
  const esperado = ni / shares;
  const desvio = Math.abs((esperado - eps) / eps) * 100;
  return { ok: desvio <= 2, esperado, desvio };
}

/** "FY" → ANNUAL; "Q1".."Q4" → QUARTERLY. */
export function tipoDePeriodo(period: string): PeriodType {
  return period.toUpperCase().startsWith("Q") ? PeriodType.QUARTERLY : PeriodType.ANNUAL;
}

export function numeroDoTrimestre(period: string): number | null {
  const m = /^Q([1-4])$/i.exec(period.trim());
  return m ? Number(m[1]) : null;
}

export interface LinhaFundamental {
  periodType: PeriodType;
  fiscalYear: number;
  fiscalQuarter: number | null;
  periodEnd: Date;
  filedAt: Date | null;
  [campo: string]: unknown;
}

/**
 * Junta as três demonstrações (mais rácios e métricas) numa linha da tabela
 * `fundamentals`. As quatro respostas vêm por período e são casadas pela
 * chave (fiscalYear, period) a montante.
 */
export function construirLinha(
  inc: FmpIncomeStatement,
  bal: FmpBalanceSheet | undefined,
  cf: FmpCashFlow | undefined,
  rat: FmpRatios | undefined,
  km: FmpKeyMetrics | undefined,
  setor?: string | null,
): LinhaFundamental {
  const periodType = tipoDePeriodo(inc.period);

  return {
    periodType,
    fiscalYear: Number(inc.fiscalYear),
    fiscalQuarter: periodType === PeriodType.QUARTERLY ? numeroDoTrimestre(inc.period) : null,
    periodEnd: new Date(inc.date),
    filedAt: inc.filingDate ? new Date(inc.filingDate) : null,

    // ---- Demonstração de resultados ----
    revenue: receita(inc, setor),
    costOfRevenue: inc.costOfRevenue,
    grossProfit: inc.grossProfit,
    operatingExpenses: inc.operatingExpenses,
    researchAndDevelopment: inc.researchAndDevelopmentExpenses,
    sellingGeneralAndAdmin: inc.sellingGeneralAndAdministrativeExpenses,
    ebitda: inc.ebitda,
    operatingIncome: inc.operatingIncome,
    interestExpense: inc.interestExpense,
    taxExpense: inc.incomeTaxExpense,
    netIncome: lucroAtribuivel(inc),
    epsDiluted: inc.epsDiluted,
    sharesOutstanding: inc.weightedAverageShsOutDil,
    depreciationAndAmortization: inc.depreciationAndAmortization,
    incomeBeforeTax: inc.incomeBeforeTax,
    netInterestIncome: inc.netInterestIncome,
    otherNonOperatingIncome: inc.nonOperatingIncomeExcludingInterest,

    // ---- Balanço ----
    // Depende do setor — ver `caixa()`.
    cash: caixa(bal, setor),
    totalCurrentAssets: bal?.totalCurrentAssets ?? null,
    accountsReceivable: bal?.netReceivables ?? null,
    inventory: bal?.inventory ?? null,
    propertyPlantEquipment: bal?.propertyPlantEquipmentNet ?? null,
    goodwillAndIntangibles: bal?.goodwillAndIntangibleAssets ?? null,
    totalAssets: bal?.totalAssets ?? null,
    accountsPayable: bal?.accountPayables ?? null,
    shortTermDebt: bal?.shortTermDebt ?? null,
    totalCurrentLiab: bal?.totalCurrentLiabilities ?? null,
    longTermDebt: bal?.longTermDebt ?? null,
    totalLiabilities: bal?.totalLiabilities ?? null,
    retainedEarnings: bal?.retainedEarnings ?? null,
    // O capital do GRUPO, sem os minoritários — o ROE tem de usar este.
    totalEquity: bal?.totalStockholdersEquity ?? null,
    minorityInterest: bal?.minorityInterest ?? null,
    // NÃO usamos o `totalDebt` da FMP: ela soma-lhe as locações financeiras.
    // Na Microsoft isso são 88,5 mM de leases de data centers em cima de 40,3 mM
    // de dívida — o número passaria de 40 mM para 129 mM e o "Net Cash" que a
    // plataforma mostra virava negativo da noite para o dia.
    //
    // A definição do DATA_DISCREPANCIES.md §1 é dívida financeira: longo prazo +
    // curto prazo + papel comercial, sem locações. É o que a plataforma sempre
    // mostrou e é o que a AAPL 2016 confirma (75,43 + 11,61 = 87,03 mM, o valor
    // que o documento defende como correto).
    //
    // As locações ficam disponíveis em `capitalLeaseObligations` se um dia se
    // quiser uma métrica "dívida incluindo locações" — mas como métrica nova,
    // etiquetada, não como alteração silenciosa desta.
    totalDebt: somar(bal?.shortTermDebt, bal?.longTermDebt),

    // ---- Fluxos de caixa ----
    operatingCashFlow: cf?.operatingCashFlow ?? null,
    // A FMP devolve o capex negativo (saída). A BD guarda-o positivo, como o
    // resto da plataforma sempre assumiu (FCF = OCF − capex).
    capex: cf?.capitalExpenditure != null ? Math.abs(cf.capitalExpenditure) : null,
    freeCashFlow: cf?.freeCashFlow ?? null,
    investingCashFlow: cf?.netCashProvidedByInvestingActivities ?? null,
    financingCashFlow: cf?.netCashProvidedByFinancingActivities ?? null,
    stockBasedCompensation: cf?.stockBasedCompensation ?? null,
    shareRepurchases: cf?.commonStockRepurchased != null ? Math.abs(cf.commonStockRepurchased) : null,
    dividendsPaid: cf?.commonDividendsPaid != null ? Math.abs(cf.commonDividendsPaid) : null,
    netChangeInCash: cf?.netChangeInCash ?? null,

    // ---- Rácios e métricas ----
    grossMargin: racio(rat?.grossProfitMargin),
    operatingMargin: racio(rat?.operatingProfitMargin),
    netMargin: racio(rat?.netProfitMargin),
    dividendPerShare: rat?.dividendPerShare ?? null,
    // Com capital próprio negativo (recompras acima do lucro acumulado — MSCI,
    // McKesson, Home Depot em certos anos) o ROE sai negativo para empresas
    // muito rentáveis: a MSCI dava −45%. A conta está certa e o número não
    // significa nada; a convenção é N/A.
    returnOnEquity:
      bal?.totalStockholdersEquity != null && bal.totalStockholdersEquity <= 0
        ? null
        : racio(km?.returnOnEquity),
    roic: racio(km?.returnOnInvestedCapital),
  };
}

/**
 * Caixa, com a única distinção que o balanço de um banco obriga a fazer.
 *
 * Fora das financeiras, "caixa" significa caixa mais investimentos de curto
 * prazo: é o que a plataforma sempre mostrou e o que qualquer screener mostra.
 * Na Apple são 35,9 mM de caixa mais 18,8 mM de aplicações — 54,7 mM.
 *
 * Num banco isso não é caixa, é o negócio. Os "investimentos de curto prazo"
 * da Bank of America são 346 mM de carteira de títulos; somá-los dá 642,9 mM,
 * um número que não existe em lado nenhum do balanço dela. O que o banco
 * reporta são 290,1 mM, e é o `cashAndCashEquivalents` da FMP que lá chega
 * (296,5 mM). No JP Morgan a coincidência é exata: 469,3 mM dos dois lados.
 *
 * Mostrar 643 mM de caixa a um cliente ao lado de um banco que declara 290 mM
 * não é uma convenção diferente — é um número inventado por soma.
 */
function caixa(bal: FmpBalanceSheet | undefined, setor: string | null | undefined): number | null {
  if (!bal) return null;
  if (eFinanceira(setor)) return bal.cashAndCashEquivalents ?? null;
  return bal.cashAndShortTermInvestments ?? bal.cashAndCashEquivalents ?? null;
}

/** O setor tal como a base o guarda ("Financials") ou a FMP ("Financial Services"). */
export function eFinanceira(setor: string | null | undefined): boolean {
  if (!setor) return false;
  const s = setor.toLowerCase();
  return s.includes("financ") || s.includes("bank");
}

/**
 * Um rácio que caiba no `Decimal(8,6)` do schema — ou nada.
 *
 * O limite são ±99,999999, isto é ±9 999,9% quando lido como percentagem. Não
 * é apertado: só lá chega quem tem denominador quase nulo ou negativo. A
 * McKesson, com capital próprio negativo por causa das recompras, tem um ROE
 * fora dessa escala e fazia a inserção rebentar com `numeric field overflow` —
 * e, por ser transação, levava atrás os outros 55 períodos da empresa.
 *
 * Devolve-se null em vez de cortar no limite: um ROE de 9 999% cortado seria um
 * número errado apresentado como verdadeiro, e um ROE calculado sobre capital
 * próprio negativo não significa nada de útil. "Sem valor" é a leitura honesta.
 */
function racio(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.abs(v) < 100 ? v : null;
}

/** Soma que trata null como ausente, não como zero. */
function somar(...xs: Array<number | null | undefined>): number | null {
  const vs = xs.filter((x): x is number => x != null);
  return vs.length ? vs.reduce((a, b) => a + b, 0) : null;
}

/**
 * Receita, com a correção que o balanço de um banco obriga a fazer.
 *
 * ── O problema ───────────────────────────────────────────────────────────
 *
 * Para financeiras, o `revenue` da FMP é BRUTO: soma os juros recebidos às
 * comissões, sem descontar os juros pagos. A Wells Fargo aparece com 125,4 mM
 * quando a própria reporta 82,3 mM. Ao lado de um lucro de 18,6 mM isso dá uma
 * margem de 15% onde a real é 23% — não é uma convenção diferente, é outra
 * empresa.
 *
 * ── Duas tentativas falhadas antes desta ─────────────────────────────────
 *
 * Tentei ir buscar a linha ao `income-statement-as-reported`. Escolher tags à
 * mão partiu a Microsoft (281,7 → 168,9 mM) e a Goldman (53,5 → 4,9 mM),
 * porque nessas empresas as tags genéricas são linhas de segmento. Reduzi a
 * uma só tag, `revenuesnetofinterestexpense`, e partiu a American Express
 * (65,9 → 0,4 mM): o próprio `as-reported` tem anos incompletos — a Goldman
 * traz 58,3 mM em 2025, 4,9 mM em 2024 e 46,3 mM em 2023.
 *
 * Ou seja, escolher tags é exatamente o problema que esta migração veio
 * eliminar, e não melhora por se escolher só uma.
 *
 * ── A regra que fica ─────────────────────────────────────────────────────
 *
 * Aritmética, não adivinhação: receita líquida = bruta − juros pagos. Ambos os
 * campos são normalizados pela FMP e existem sempre. Reproduz o que cada banco
 * reporta, ao décimo:
 *
 *     WFC  125,4 − 43,1 = 82,3    (reportado 82,3)
 *     BAC  192,4 − 90,5 = 101,9   (reportado 101,9)
 *     GS   126,9 − 73,3 = 53,5    (reportado 53,5)
 *     AXP   74,2 −  8,3 = 65,9    (reportado 65,9)
 *
 * Fora das financeiras não se toca: o juro pago é despesa de financiamento,
 * não uma dedução ao topo da demonstração.
 */
export function receita(inc: FmpIncomeStatement, setor: string | null | undefined): number | null {
  const bruta = inc.revenue;
  if (bruta == null) return null;
  if (!eFinanceira(setor)) return bruta;
  const juros = inc.interestExpense;
  return juros != null ? bruta - juros : bruta;
}

/** Chave de casamento entre as quatro respostas do mesmo período. */
export function chavePeriodo(x: { fiscalYear: string | number; period: string }): string {
  return `${x.fiscalYear}:${x.period.toUpperCase()}`;
}
