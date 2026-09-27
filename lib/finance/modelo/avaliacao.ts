import type { AnoProjetado, Avaliacao, Mercado, PressupostosAvaliacao, Wacc } from "./tipos"

const DIA = 86_400_000

/**
 * WACC por CAPM, com pesos a valor de mercado do capital e dívida total.
 *
 *   Re   = rf + β × prémio de risco
 *   Rd   = custo da dívida × (1 − t)
 *   WACC = E/(D+E) × Re + D/(D+E) × Rd
 */
export function calcularWacc(a: PressupostosAvaliacao, m: Mercado): Wacc {
  const re = a.rf + a.beta * a.erp
  const rd = a.custoDivida * (1 - a.taxaImpostoWacc)
  const e = m.preco * m.acoes
  const d = Math.max(0, m.dividaTotal)
  const v = e + d
  const wE = v > 0 ? e / v : 1
  const wD = v > 0 ? d / v : 0
  const calculada = wE * re + wD * rd
  return {
    custoCapitalProprio: re,
    custoDividaAposImpostos: rd,
    pesoCapitalProprio: wE,
    pesoDivida: wD,
    valorMercadoCapital: e,
    wacc: a.waccManual ?? calculada,
    manual: a.waccManual !== null,
  }
}

/**
 * Fração do primeiro ano projetado que ainda NÃO está no balanço usado.
 *
 * A ponte EV → capital próprio usa o balanço mais recente (um trimestre).
 * Os fluxos até essa data já estão lá dentro (na caixa, na dívida); contar o
 * ano 1 inteiro somá-los-ia duas vezes. Conta-se só a parte do ano 1 depois
 * da data do balanço. É o "stub period" dos modelos FMVA.
 */
export function fracaoAno1(fimUltimoAno: string, dataBalanco: Date = new Date()): number {
  const fim = new Date(fimUltimoAno + "T00:00:00Z").getTime()
  const fimAno1 = fim + 365 * DIA
  return Math.min(1, Math.max(0, (fimAno1 - dataBalanco.getTime()) / (365 * DIA)))
}

/** Anos desde hoje até ao fim do ano 1 (pode ser ligeiramente negativo). */
export function anosAteFimAno1(fimUltimoAno: string, hoje: Date = new Date()): number {
  const fim = new Date(fimUltimoAno + "T00:00:00Z").getTime()
  return (fim + 365 * DIA - hoje.getTime()) / (365 * DIA)
}

/**
 * Desconta os fluxos, calcula os dois valores terminais e faz a ponte até
 * ao valor por ação. Devolve as projeções com o desconto preenchido.
 *
 * Períodos de desconto (anos desde hoje), com f = fração do ano 1 que conta
 * e d0 = anos de hoje até ao fim do ano 1:
 *   fim do ano t            = d0 + (t − 1)
 *   meio do ano (convenção) = ano 1: d0 − f / 2 (meio da parte que conta);
 *                             restantes: fim do ano − 0,5
 * O valor terminal desconta-se sempre do fim do último ano. Sem d0, assume-se
 * que o balanço é de hoje (d0 = f).
 */
export function avaliar(
  proj: AnoProjetado[],
  a: PressupostosAvaliacao,
  m: Mercado,
  f: number,
  d0: number = f,
): { projecoes: AnoProjetado[]; avaliacao: Avaliacao } {
  const wacc = calcularWacc(a, m)
  const w = wacc.wacc
  const vazio = (erro: Avaliacao["erro"]): Avaliacao => ({
    valido: false, erro, wacc, somaVpFcff: 0, terminalGordon: 0, terminalMultiplo: 0, terminalUsado: 0,
    vpTerminal: 0, gImplicitoNoMultiplo: null, multiploImplicitoNoGordon: null, pesoTerminal: 0,
    enterpriseValue: 0, valorCapitalProprio: 0, valorPorAcao: 0, preco: m.preco, potencial: 0, margemSeguranca: 0,
  })
  if (proj.length === 0) return { projecoes: proj, avaliacao: vazio("SEM_DADOS") }
  if (!(m.acoes > 0)) return { projecoes: proj, avaliacao: vazio("SEM_ACOES") }

  const projecoes = proj.map((p, i) => {
    const fracao = i === 0 ? f : 1
    const fimAno = d0 + i
    const periodoDesconto = Math.max(0, a.meioDoAno ? (i === 0 ? d0 - f / 2 : fimAno - 0.5) : fimAno)
    const fatorDesconto = 1 / Math.pow(1 + w, periodoDesconto)
    return { ...p, fracao, periodoDesconto, fatorDesconto, valorPresente: p.fcff * fracao * fatorDesconto }
  })
  const somaVpFcff = projecoes.reduce((s, p) => s + p.valorPresente, 0)

  const ult = projecoes[projecoes.length - 1]
  const periodoTerminal = Math.max(0, d0 + projecoes.length - 1)
  const fatorTerminal = 1 / Math.pow(1 + w, periodoTerminal)

  const gordonValido = w > a.g
  const terminalGordon = gordonValido ? (ult.fcff * (1 + a.g)) / (w - a.g) : 0
  const terminalMultiplo = ult.ebitda * a.multiploSaida
  if (a.metodoTerminal !== "multiplo" && !gordonValido) return { projecoes, avaliacao: vazio("WACC_MENOR_QUE_G") }

  const terminalUsado =
    a.metodoTerminal === "gordon" ? terminalGordon
    : a.metodoTerminal === "multiplo" ? terminalMultiplo
    : (terminalGordon + terminalMultiplo) / 2
  const vpTerminal = terminalUsado * fatorTerminal

  // As verificações cruzadas do FMVA: que crescimento perpétuo o múltiplo
  // pressupõe, e que múltiplo o Gordon pressupõe. Se divergirem muito, um
  // dos dois pressupostos está fora da realidade.
  //   TV = FCF(1+g)/(w−g)  ⇔  g = (TV·w − FCF) / (TV + FCF)
  const gImplicitoNoMultiplo =
    terminalMultiplo + ult.fcff !== 0 ? (terminalMultiplo * w - ult.fcff) / (terminalMultiplo + ult.fcff) : null
  const multiploImplicitoNoGordon = gordonValido && ult.ebitda > 0 ? terminalGordon / ult.ebitda : null

  const enterpriseValue = somaVpFcff + vpTerminal
  const valorCapitalProprio = enterpriseValue - m.dividaTotal + m.caixa - m.interessesMinoritarios
  const valorPorAcao = valorCapitalProprio / m.acoes

  return {
    projecoes,
    avaliacao: {
      valido: true,
      wacc,
      somaVpFcff,
      terminalGordon,
      terminalMultiplo,
      terminalUsado,
      vpTerminal,
      gImplicitoNoMultiplo,
      multiploImplicitoNoGordon,
      pesoTerminal: enterpriseValue !== 0 ? vpTerminal / enterpriseValue : 0,
      enterpriseValue,
      valorCapitalProprio,
      valorPorAcao,
      preco: m.preco,
      potencial: m.preco > 0 ? valorPorAcao / m.preco - 1 : 0,
      margemSeguranca: valorPorAcao > 0 ? 1 - m.preco / valorPorAcao : 0,
    },
  }
}
