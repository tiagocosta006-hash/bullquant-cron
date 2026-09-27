import { baseCustos } from "./historico"
import type { AnoHistorico, AnoProjetado, Pressupostos } from "./tipos"

/**
 * Projeções: os schedules aplicados ano a ano e a construção do FCFF.
 *
 *   receita      = receita anterior × (1 + crescimento)
 *   custo vendas = receita × (1 − margem bruta)
 *   EBIT         = receita × margem EBIT
 *   D&A, capex   = receita × %
 *   EBITDA       = EBIT + D&A
 *   NOPAT        = EBIT × (1 − taxa de imposto)
 *   fundo maneio = clientes + inventário − fornecedores, cada um pelos dias
 *   FCFF         = NOPAT + D&A − capex − Δ fundo de maneio
 *
 * O desconto (fracao, periodoDesconto, fator, VP) fica a zero aqui e é
 * preenchido em `avaliacao.ts`, que conhece a WACC.
 */
export function projetar(base: AnoHistorico, p: Pressupostos): AnoProjetado[] {
  const d = p.drivers
  const custosBase = baseCustos(base) ?? 0
  let receitaAnt = base.revenue ?? 0
  // O fundo de maneio de partida é o real do último ano — assim o primeiro
  // Δ mede a mudança face ao balanço que existe, não face a zero.
  let fmAnt = (base.accountsReceivable ?? 0) + (base.inventory ?? 0) - (base.accountsPayable ?? 0)
  // Sem custo das vendas no histórico, DIO/DPO foram medidos sobre a receita;
  // a projeção tem de usar a mesma base.
  const semCogs = !(base.costOfRevenue && base.costOfRevenue > 0) && custosBase === base.revenue

  // Revenue Build por segmento: cada segmento cresce ao seu ritmo e a receita
  // é a soma; a reconciliação ("outros") mantém o peso face aos segmentos.
  const rs = p.modoReceita === "segmentos" && p.receitaSegmentos && p.receitaSegmentos.segmentos.length > 0 ? p.receitaSegmentos : null
  const segAtual = rs ? rs.segmentos.map((s) => s.base) : []
  const somaBase = segAtual.reduce((a, b) => a + b, 0)

  const out: AnoProjetado[] = []
  for (let i = 0; i < p.anos; i++) {
    let receita = receitaAnt * (1 + d.crescimentoReceita[i])
    let segmentos: Record<string, number> | undefined
    if (rs) {
      segmentos = {}
      for (let k = 0; k < rs.segmentos.length; k++) {
        segAtual[k] = segAtual[k] * (1 + (rs.segmentos[k].crescimento[i] ?? 0))
        segmentos[rs.segmentos[k].nome] = segAtual[k]
      }
      const soma = segAtual.reduce((a, b) => a + b, 0)
      receita = soma + (somaBase > 0 ? rs.outros * (soma / somaBase) : 0)
    }
    const cogs = receita * (1 - d.margemBruta[i])
    const baseDias = semCogs ? receita : cogs
    const ebit = receita * d.margemEbit[i]
    const da = receita * d.daPctReceita[i]
    const capex = receita * d.capexPctReceita[i]
    const clientes = (receita * d.dso[i]) / 365
    const inventario = (baseDias * d.dio[i]) / 365
    const fornecedores = (baseDias * d.dpo[i]) / 365
    const fundoManeio = clientes + inventario - fornecedores
    const variacaoFundoManeio = fundoManeio - fmAnt
    const impostosOperacionais = ebit > 0 ? ebit * d.taxaImposto[i] : 0
    const nopat = ebit - impostosOperacionais
    out.push({
      fiscalYear: base.fiscalYear + i + 1,
      receita,
      segmentos,
      cogs,
      lucroBruto: receita - cogs,
      ebit,
      da,
      ebitda: ebit + da,
      impostosOperacionais,
      nopat,
      capex,
      clientes,
      inventario,
      fornecedores,
      fundoManeio,
      variacaoFundoManeio,
      fcff: nopat + da - capex - variacaoFundoManeio,
      fracao: 1,
      periodoDesconto: 0,
      fatorDesconto: 1,
      valorPresente: 0,
    })
    receitaAnt = receita
    fmAnt = fundoManeio
  }
  return out
}
