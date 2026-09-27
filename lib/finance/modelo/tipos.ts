/**
 * Tipos do modelo DCF completo (opção A: schedules → projeções → FCFF → avaliação).
 *
 * Organizado como um modelo FMVA: todos os pressupostos num sítio, o
 * histórico, os schedules de apoio (receita, custos, capex e D&A, fundo de
 * maneio, impostos), as projeções e a avaliação. Tudo em USD e em unidades
 * absolutas; taxas em decimal (0,10 = 10%); dias em dias.
 */

/** Um ano fiscal real, como vem dos fundamentais da BullValue. */
export type AnoHistorico = {
  fiscalYear: number
  periodEnd: string // YYYY-MM-DD
  revenue: number | null
  costOfRevenue: number | null
  grossProfit: number | null
  operatingExpenses: number | null
  operatingIncome: number | null
  ebitda: number | null
  depreciationAndAmortization: number | null
  capex: number | null
  accountsReceivable: number | null
  inventory: number | null
  accountsPayable: number | null
  taxExpense: number | null
  incomeBeforeTax: number | null
  stockBasedCompensation: number | null
  operatingCashFlow: number | null
  freeCashFlow: number | null
  /** Receita por segmento (produto) e geografia, já verificada contra a receita (±10%). */
  segmentos?: { product?: Record<string, number> | null; geography?: Record<string, number> | null } | null
}

/** Os pressupostos que se projetam ano a ano. */
export const DRIVERS = [
  "crescimentoReceita",
  "margemBruta",
  "margemEbit",
  "daPctReceita",
  "capexPctReceita",
  "dso",
  "dio",
  "dpo",
  "taxaImposto",
] as const
export type Driver = (typeof DRIVERS)[number]

/** Rácios de um ano histórico, calculados dos fundamentais. null = sem dado. */
export type RaciosAno = { fiscalYear: number } & Record<Driver, number | null>

export type MetodoTerminal = "gordon" | "multiplo" | "media"

export type PressupostosAvaliacao = {
  /** Taxa sem risco (Tesouro dos EUA a 10 anos). */
  rf: number
  /** Prémio de risco do mercado acionista. */
  erp: number
  beta: number
  /** Custo da dívida antes de impostos. */
  custoDivida: number
  /** Taxa de imposto para o benefício fiscal da dívida. */
  taxaImpostoWacc: number
  /** Se preenchida, substitui a WACC calculada. */
  waccManual: number | null
  /** Crescimento perpétuo (Gordon). */
  g: number
  /** Múltiplo EV/EBITDA de saída. */
  multiploSaida: number
  metodoTerminal: MetodoTerminal
  /** Convenção de meio do ano: os fluxos chegam, em média, a meio de cada ano. */
  meioDoAno: boolean
}

/** Um segmento no Revenue Build: receita do último ano e crescimento por ano. */
export type SegmentoProjetado = { nome: string; base: number; crescimento: number[] }

export type ReceitaSegmentos = {
  eixo: "product" | "geography"
  segmentos: SegmentoProjetado[]
  /** Receita − soma dos segmentos no último ano (reconciliação, cresce com o total dos segmentos). */
  outros: number
}

export type Pressupostos = {
  /** Anos projetados (5 a 10). */
  anos: number
  /** Revenue Build: crescimento total (driver) ou soma dos segmentos. */
  modoReceita?: "total" | "segmentos"
  receitaSegmentos?: ReceitaSegmentos | null
  /** Um valor por ano projetado, para cada driver. */
  drivers: Record<Driver, number[]>
  avaliacao: PressupostosAvaliacao
}

/** Dados de mercado para a ponte EV → valor por ação. */
export type Mercado = {
  preco: number
  /** Ações diluídas mais recentes. */
  acoes: number
  dividaTotal: number
  caixa: number
  interessesMinoritarios: number
}

export type AnoProjetado = {
  fiscalYear: number
  receita: number
  /** Só no modo por segmento: receita projetada de cada segmento. */
  segmentos?: Record<string, number>
  cogs: number
  lucroBruto: number
  ebit: number
  da: number
  ebitda: number
  impostosOperacionais: number
  nopat: number
  capex: number
  clientes: number
  inventario: number
  fornecedores: number
  fundoManeio: number
  variacaoFundoManeio: number
  fcff: number
  /** Parte do ano ainda por decorrer que conta (só < 1 no ano 1). */
  fracao: number
  /** Anos desde hoje até ao momento em que o fluxo se desconta. */
  periodoDesconto: number
  fatorDesconto: number
  valorPresente: number
}

export type Wacc = {
  custoCapitalProprio: number
  custoDividaAposImpostos: number
  pesoCapitalProprio: number
  pesoDivida: number
  valorMercadoCapital: number
  wacc: number
  manual: boolean
}

export type Avaliacao = {
  valido: boolean
  erro?: "WACC_MENOR_QUE_G" | "SEM_ACOES" | "SEM_DADOS"
  wacc: Wacc
  somaVpFcff: number
  terminalGordon: number
  terminalMultiplo: number
  terminalUsado: number
  vpTerminal: number
  /** Crescimento perpétuo implícito no múltiplo de saída. */
  gImplicitoNoMultiplo: number | null
  /** Múltiplo EV/EBITDA implícito no valor terminal de Gordon. */
  multiploImplicitoNoGordon: number | null
  /** % do enterprise value que vem do valor terminal (verificação FMVA). */
  pesoTerminal: number
  enterpriseValue: number
  valorCapitalProprio: number
  valorPorAcao: number
  preco: number
  potencial: number
  margemSeguranca: number
}
