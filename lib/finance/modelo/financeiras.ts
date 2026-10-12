import { ERP_POR_OMISSAO, G_POR_OMISSAO, RF_POR_OMISSAO } from "./pressupostos"

/**
 * Modelo para financeiras (bancos, seguradoras, corretoras): retorno em
 * excesso (residual income), em vez do FCFF.
 *
 * Num banco a dívida é matéria-prima e o balanço é o negócio, por isso o
 * fluxo de caixa livre não mede nada. O que se mede é quanto o capital próprio
 * rende acima do que custa:
 *
 *   Ke                = rf + β × prémio de risco            (CAPM)
 *   lucro_t           = ROE_t × capital próprio no início do ano t
 *   distribuições_t   = payout × lucro_t                    (dividendos + recompras)
 *   capital_t         = capital_(t−1) + lucro_t − distribuições_t
 *   retorno em excesso_t = lucro_t − Ke × capital_(t−1)  =  (ROE_t − Ke) × capital_(t−1)
 *   valor do capital  = capital_0 + Σ VP(excesso_t) + VP(valor terminal)
 *   valor terminal    = excesso_(N+1) / (Ke − g),  excesso_(N+1) = (ROE_N − Ke) × capital_N
 *
 * Convenção: o ano 1 são os 12 meses seguintes à data do balanço usado como
 * capital_0 (o último trimestre); os fluxos descontam-se no fim de cada ano.
 * Não há ponte de dívida: o valor já é do capital próprio.
 *
 * Limite conhecido: o capital próprio é o total do grupo, com ações
 * preferenciais, e o lucro é o líquido total. Para bancos com muitas
 * preferenciais o valor por ação sai ligeiramente alto.
 */

export type AnoFin = {
  fiscalYear: number
  periodEnd: string
  netIncome: number | null
  totalEquity: number | null
  /** Dividendos pagos (valor absoluto). */
  dividendos: number | null
  /** Recompras de ações (valor absoluto). */
  recompras: number | null
}

export type RaciosFin = {
  fiscalYear: number
  /** Lucro / capital próprio no início do ano. */
  roe: number | null
  /** (dividendos + recompras) / lucro. */
  payout: number | null
}

export type PressupostosFin = {
  /** 5, 7 ou 10 anos. */
  anos: number
  /** ROE do ano 1 e do último ano; entre eles desce (ou sobe) em linha reta. O terminal usa o último. */
  roeInicial: number
  roeFinal: number
  /** Parte do lucro distribuída (dividendos + recompras). */
  payout: number
  rf: number
  erp: number
  beta: number
  /** Crescimento perpétuo do retorno em excesso. */
  g: number
}

export type MercadoFin = {
  preco: number
  acoes: number
  /** Capital próprio no último balanço (trimestre). */
  capitalProprio: number
}

export type AnoProjFin = {
  ano: number
  roe: number
  capitalInicio: number
  lucro: number
  distribuicoes: number
  capitalFim: number
  retornoExcesso: number
  fatorDesconto: number
  valorPresente: number
}

export type AvaliacaoFin = {
  valido: boolean
  erro?: "KE_MENOR_QUE_G" | "SEM_ACOES" | "SEM_DADOS"
  ke: number
  somaVp: number
  valorTerminal: number
  vpTerminal: number
  valorCapital: number
  valorPorAcao: number
  preco: number
  potencial: number
  margemSeguranca: number
  /** Valor / capital próprio atual: o P/B que o modelo justifica. */
  pbImplicito: number
  /** Valor / lucro do ano 1: o P/E que o modelo justifica. */
  peImplicito: number | null
  /** Parte do valor do capital que vem do valor terminal. */
  pesoTerminal: number
  /** Crescimento que o ROE final e o payout financiam: ROE × (1 − payout). */
  crescimentoSustentavel: number
}

const lim = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const abs = (v: number | null) => (v === null ? null : Math.abs(v))

export function raciosFin(hist: AnoFin[]): RaciosFin[] {
  return hist.map((a, i) => {
    const ant = i > 0 ? hist[i - 1] : null
    const roe = a.netIncome !== null && ant?.totalEquity && ant.totalEquity > 0 ? a.netIncome / ant.totalEquity : null
    const dist = a.dividendos === null && a.recompras === null ? null : (abs(a.dividendos) ?? 0) + (abs(a.recompras) ?? 0)
    const payout = dist !== null && a.netIncome !== null && a.netIncome > 0 ? dist / a.netIncome : null
    return { fiscalYear: a.fiscalYear, roe, payout }
  })
}

function mediana(vs: number[]): number | null {
  if (vs.length === 0) return null
  const o = [...vs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

export const keDe = (p: Pick<PressupostosFin, "rf" | "erp" | "beta">) => p.rf + p.beta * p.erp

/**
 * Pressupostos de partida: o ROE do ano 1 é a mediana dos últimos 3 anos; o
 * final mantém metade do excesso sobre o Ke (a vantagem competitiva desgasta-se,
 * não desaparece). O payout é a mediana dos últimos 3 anos. O crescimento
 * perpétuo não passa do que o ROE final e o payout financiam.
 */
export function pressupostosFinIniciais(
  hist: AnoFin[],
  ctx: { rf: number | null; beta: number | null },
  anos = 10,
): PressupostosFin {
  const rs = raciosFin(hist).slice(-3)
  const rf = ctx.rf ?? RF_POR_OMISSAO
  const beta = ctx.beta !== null && ctx.beta > 0 ? Math.round((0.67 * lim(ctx.beta, 0.2, 3) + 0.33) * 100) / 100 : 1
  const erp = ERP_POR_OMISSAO
  const ke = rf + beta * erp
  const roeInicial = lim(mediana(rs.map((r) => r.roe).filter((v): v is number => v !== null)) ?? 0.1, 0, 0.35)
  const roeFinal = roeInicial >= ke ? ke + (roeInicial - ke) / 2 : roeInicial
  const payout = lim(mediana(rs.map((r) => r.payout).filter((v): v is number => v !== null)) ?? 0.5, 0, 1)
  const g = Math.max(0, Math.min(G_POR_OMISSAO, roeFinal * (1 - payout)))
  return { anos, roeInicial, roeFinal, payout, rf, erp, beta, g }
}

export function projetarFin(capital0: number, p: PressupostosFin): AnoProjFin[] {
  const ke = keDe(p)
  const out: AnoProjFin[] = []
  let capital = capital0
  for (let i = 0; i < p.anos; i++) {
    const roe = p.anos > 1 ? p.roeInicial + ((p.roeFinal - p.roeInicial) * i) / (p.anos - 1) : p.roeInicial
    const lucro = roe * capital
    const distribuicoes = p.payout * lucro
    const capitalFim = capital + lucro - distribuicoes
    const retornoExcesso = lucro - ke * capital
    const fatorDesconto = 1 / Math.pow(1 + ke, i + 1)
    out.push({ ano: i + 1, roe, capitalInicio: capital, lucro, distribuicoes, capitalFim, retornoExcesso, fatorDesconto, valorPresente: retornoExcesso * fatorDesconto })
    capital = capitalFim
  }
  return out
}

export function avaliarFin(proj: AnoProjFin[], p: PressupostosFin, m: MercadoFin): AvaliacaoFin {
  const ke = keDe(p)
  const sustentavel = p.roeFinal * (1 - p.payout)
  const vazio = (erro: AvaliacaoFin["erro"]): AvaliacaoFin => ({
    valido: false, erro, ke, somaVp: 0, valorTerminal: 0, vpTerminal: 0, valorCapital: 0, valorPorAcao: 0, preco: m.preco,
    potencial: 0, margemSeguranca: 0, pbImplicito: 0, peImplicito: null, pesoTerminal: 0, crescimentoSustentavel: sustentavel,
  })
  if (proj.length === 0 || !(m.capitalProprio > 0)) return vazio("SEM_DADOS")
  if (!(m.acoes > 0)) return vazio("SEM_ACOES")
  if (!(ke > p.g)) return vazio("KE_MENOR_QUE_G")

  const ult = proj[proj.length - 1]
  const somaVp = proj.reduce((s, a) => s + a.valorPresente, 0)
  const valorTerminal = ((p.roeFinal - ke) * ult.capitalFim) / (ke - p.g)
  const vpTerminal = valorTerminal * ult.fatorDesconto
  const valorCapital = m.capitalProprio + somaVp + vpTerminal
  const valorPorAcao = valorCapital / m.acoes
  return {
    valido: true,
    ke,
    somaVp,
    valorTerminal,
    vpTerminal,
    valorCapital,
    valorPorAcao,
    preco: m.preco,
    potencial: m.preco > 0 ? valorPorAcao / m.preco - 1 : 0,
    margemSeguranca: valorPorAcao > 0 ? 1 - m.preco / valorPorAcao : 0,
    pbImplicito: valorCapital / m.capitalProprio,
    peImplicito: proj[0].lucro > 0 ? valorCapital / proj[0].lucro : null,
    pesoTerminal: valorCapital !== 0 ? vpTerminal / valorCapital : 0,
    crescimentoSustentavel: sustentavel,
  }
}

/** Valor por ação com Ke (via beta) e ROE final deslocados; null onde o modelo é inválido. */
export function grelhaKeRoe(
  m: MercadoFin,
  p: PressupostosFin,
  deslocamentosKe: number[] = [-0.02, -0.01, 0, 0.01, 0.02],
  deslocamentosRoe: number[] = [-0.04, -0.02, 0, 0.02, 0.04],
): { ke: number[]; roe: number[]; valores: Array<Array<number | null>> } {
  const ke0 = keDe(p)
  return {
    ke: deslocamentosKe.map((d) => ke0 + d),
    roe: deslocamentosRoe.map((d) => p.roeFinal + d),
    valores: deslocamentosKe.map((dk) =>
      deslocamentosRoe.map((dr) => {
        // O Ke desloca-se pelo beta: mantém rf e prémio, muda o que o utilizador vê como "risco".
        const pp: PressupostosFin = { ...p, beta: p.erp > 0 ? p.beta + dk / p.erp : p.beta, roeFinal: p.roeFinal + dr }
        const a = avaliarFin(projetarFin(m.capitalProprio, pp), pp, m)
        return a.valido ? a.valorPorAcao : null
      }),
    ),
  }
}
