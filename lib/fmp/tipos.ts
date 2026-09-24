/**
 * Formas das respostas da FMP que usamos.
 *
 * Só os campos que consumimos — a `income-statement` devolve 39, a
 * `balance-sheet-statement` 61 e a `cash-flow-statement` 47. Declarar os que
 * usamos faz o TypeScript avisar quando a FMP renomeia algum, em vez de o
 * valor chegar `undefined` à base de dados sem ninguém reparar.
 */

/** Campos de identificação comuns às três demonstrações. */
interface Periodo {
  date: string;
  symbol: string;
  reportedCurrency: string | null;
  cik: string | null;
  filingDate: string | null;
  acceptedDate: string | null;
  fiscalYear: string | number;
  /** "FY" | "Q1" | "Q2" | "Q3" | "Q4" */
  period: string;
}

export interface FmpIncomeStatement extends Periodo {
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  researchAndDevelopmentExpenses: number | null;
  sellingGeneralAndAdministrativeExpenses: number | null;
  operatingExpenses: number | null;
  netInterestIncome: number | null;
  interestExpense: number | null;
  depreciationAndAmortization: number | null;
  ebitda: number | null;
  operatingIncome: number | null;
  nonOperatingIncomeExcludingInterest: number | null;
  incomeBeforeTax: number | null;
  incomeTaxExpense: number | null;
  /**
   * ⚠️ Muda de significado conforme a empresa.
   *
   * Na IBKR são os 984 M atribuíveis. Na Prologis são os 3 411 M do grupo,
   * INCLUINDO interesses minoritários, e o atribuível está em
   * `bottomLineNetIncome` (3 340 M). Nunca usar este campo sozinho — ver
   * `lucroAtribuivel()` em `lib/fmp/mapear.ts`.
   */
  netIncome: number | null;
  /** Lucro depois das deduções — é sobre este que o `epsDiluted` é calculado. */
  bottomLineNetIncome: number | null;
  netIncomeDeductions: number | null;
  eps: number | null;
  epsDiluted: number | null;
  weightedAverageShsOut: number | null;
  weightedAverageShsOutDil: number | null;
}

export interface FmpBalanceSheet extends Periodo {
  /** A tag pura. A BD guarda `cashAndShortTermInvestments` — ver mapear.ts. */
  cashAndCashEquivalents: number | null;
  shortTermInvestments: number | null;
  cashAndShortTermInvestments: number | null;
  netReceivables: number | null;
  inventory: number | null;
  totalCurrentAssets: number | null;
  propertyPlantEquipmentNet: number | null;
  goodwillAndIntangibleAssets: number | null;
  totalAssets: number | null;
  accountPayables: number | null;
  shortTermDebt: number | null;
  totalCurrentLiabilities: number | null;
  longTermDebt: number | null;
  totalLiabilities: number | null;
  retainedEarnings: number | null;
  totalStockholdersEquity: number | null;
  totalEquity: number | null;
  minorityInterest: number | null;
  /** Já inclui curto prazo e papel comercial — bate com a AAPL 2016 a 87,03 B. */
  totalDebt: number | null;
  netDebt: number | null;
}

export interface FmpCashFlow extends Periodo {
  netIncome: number | null;
  depreciationAndAmortization: number | null;
  stockBasedCompensation: number | null;
  netCashProvidedByOperatingActivities: number | null;
  netCashProvidedByInvestingActivities: number | null;
  netCashProvidedByFinancingActivities: number | null;
  commonStockRepurchased: number | null;
  netDividendsPaid: number | null;
  commonDividendsPaid: number | null;
  netChangeInCash: number | null;
  operatingCashFlow: number | null;
  /** Negativo na FMP (saída de caixa). A BD guarda-o positivo. */
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
}

export interface FmpRatios {
  symbol: string;
  fiscalYear: string | number;
  period: string;
  grossProfitMargin: number | null;
  operatingProfitMargin: number | null;
  netProfitMargin: number | null;
  dividendPerShare: number | null;
}

export interface FmpKeyMetrics {
  symbol: string;
  fiscalYear: string | number;
  period: string;
  returnOnEquity: number | null;
  returnOnInvestedCapital: number | null;
}

export interface FmpProfile {
  symbol: string;
  companyName: string;
  cik: string | null;
  exchange: string | null;
  exchangeFullName: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  currency: string | null;
  website: string | null;
  description: string | null;
  fullTimeEmployees: string | number | null;
  image: string | null;
  isActivelyTrading: boolean;
}

export interface FmpPriceEod {
  symbol: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

/**
 * Demonstração tal como arquivada na SEC: as tags XBRL originais, sem
 * normalização. Usada só para a receita — ver `receitaReportada()`.
 */
export interface FmpAsReported {
  symbol: string;
  fiscalYear: string | number;
  period: string;
  date: string;
  data: Record<string, unknown>;
}
