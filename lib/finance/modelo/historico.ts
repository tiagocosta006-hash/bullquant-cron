import type { AnoHistorico, Driver, RaciosAno } from "./tipos"

/**
 * Rácios históricos que alimentam os schedules — os mesmos que se calculam
 * à mão na folha "Historicals" de um modelo FMVA.
 *
 *   crescimento da receita  = receita / receita do ano anterior − 1
 *   margem bruta            = lucro bruto / receita
 *   margem EBIT             = resultado operacional / receita
 *   D&A e capex             = em % da receita
 *   DSO (dias de clientes)  = clientes / receita × 365
 *   DIO (dias de inventário)= inventário / custo das vendas × 365
 *   DPO (dias de fornec.)   = fornecedores / custo das vendas × 365
 *   taxa de imposto efetiva = impostos / resultado antes de impostos
 *
 * Sem custo das vendas (algumas empresas de serviços), DIO e DPO usam a
 * receita como base, para o fundo de maneio continuar a ser projetável.
 */

const div = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null && b !== 0 ? a / b : null

export function baseCustos(a: Pick<AnoHistorico, "costOfRevenue" | "revenue">): number | null {
  return a.costOfRevenue && a.costOfRevenue > 0 ? a.costOfRevenue : a.revenue
}

export function racios(hist: AnoHistorico[]): RaciosAno[] {
  return hist.map((a, i) => {
    const ant = i > 0 ? hist[i - 1] : null
    const custos = baseCustos(a)
    const t = div(a.taxExpense, a.incomeBeforeTax)
    return {
      fiscalYear: a.fiscalYear,
      crescimentoReceita: ant && ant.revenue && ant.revenue > 0 && a.revenue !== null ? a.revenue / ant.revenue - 1 : null,
      margemBruta: div(a.grossProfit, a.revenue),
      margemEbit: div(a.operatingIncome, a.revenue),
      daPctReceita: div(a.depreciationAndAmortization, a.revenue),
      capexPctReceita: div(a.capex, a.revenue),
      dso: a.accountsReceivable !== null && a.revenue ? (a.accountsReceivable / a.revenue) * 365 : null,
      dio: a.inventory !== null && custos ? (a.inventory / custos) * 365 : null,
      dpo: a.accountsPayable !== null && custos ? (a.accountsPayable / custos) * 365 : null,
      // Taxas fora de [0, 60%] são anos com créditos fiscais ou prejuízos —
      // não servem de âncora.
      taxaImposto: t !== null && t >= 0 && t <= 0.6 ? t : null,
    }
  })
}

export type Resumo = { ultimo: number | null; media: number | null; mediana: number | null }

/** Último valor, média e mediana dos últimos `anos` anos com dado. */
export function resumo(rs: RaciosAno[], chave: Driver, anos = 5): Resumo {
  const vals = rs.slice(-anos).map((r) => r[chave]).filter((v): v is number => v !== null && Number.isFinite(v))
  if (vals.length === 0) return { ultimo: null, media: null, mediana: null }
  const ord = [...vals].sort((a, b) => a - b)
  const meio = Math.floor(ord.length / 2)
  return {
    ultimo: rs[rs.length - 1]?.[chave] ?? null,
    media: vals.reduce((s, v) => s + v, 0) / vals.length,
    mediana: ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2,
  }
}
