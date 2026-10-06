import { projetar } from "./projecao"
import { avaliar, calcularWacc } from "./avaliacao"
import type { AnoHistorico, Mercado, Pressupostos } from "./tipos"

/**
 * Sensibilidade e cenários (bloco 6 do modelo FMVA).
 *
 * Tudo se faz re-correndo o modelo inteiro com pressupostos ajustados — nada
 * de atalhos —, por isso cada célula é exatamente o que o analista veria se
 * escrevesse esses valores nos Schedules e na Valuation.
 */

/** Deslocamentos aplicados aos pressupostos do analista. Pontos percentuais em decimal. */
export type Ajuste = {
  /** Somado ao crescimento da receita de cada ano (e de cada segmento no Revenue Build). */
  crescimento?: number
  /** Somado à margem EBIT de cada ano. */
  margemEbit?: number
  /** Somado à WACC em uso (calculada ou manual). */
  wacc?: number
  /** Substitui o crescimento perpétuo. */
  g?: number
  /** Somado ao múltiplo EV/EBITDA de saída. */
  multiplo?: number
}

export type ContextoSensibilidade = {
  base: AnoHistorico
  pressupostos: Pressupostos
  mercado: Mercado
  /** Fração do ano 1 que conta e anos até ao fim do ano 1 (ver `avaliar`). */
  f: number
  d0: number
}

export function aplicarAjuste(p: Pressupostos, a: Ajuste, waccAtual: number): Pressupostos {
  const soma = (xs: number[], d: number) => (d ? xs.map((x) => x + d) : xs)
  const rs = p.receitaSegmentos
  return {
    ...p,
    drivers: {
      ...p.drivers,
      crescimentoReceita: soma(p.drivers.crescimentoReceita, a.crescimento ?? 0),
      margemEbit: soma(p.drivers.margemEbit, a.margemEbit ?? 0),
    },
    receitaSegmentos: rs && a.crescimento
      ? { ...rs, segmentos: rs.segmentos.map((s) => ({ ...s, crescimento: soma(s.crescimento, a.crescimento!) })) }
      : rs,
    avaliacao: {
      ...p.avaliacao,
      waccManual: a.wacc ? waccAtual + a.wacc : p.avaliacao.waccManual,
      g: a.g ?? p.avaliacao.g,
      multiploSaida: p.avaliacao.multiploSaida + (a.multiplo ?? 0),
    },
  }
}

/** Valor por ação com os pressupostos ajustados; null se o modelo é inválido nesse ponto (ex.: WACC ≤ g). */
export function valorComAjuste(c: ContextoSensibilidade, a: Ajuste = {}): number | null {
  const waccAtual = calcularWacc(c.pressupostos.avaliacao, c.mercado).wacc
  const p = aplicarAjuste(c.pressupostos, a, waccAtual)
  const { avaliacao } = avaliar(projetar(c.base, p), p.avaliacao, c.mercado, c.f, c.d0)
  return avaliacao.valido ? avaliacao.valorPorAcao : null
}

export type Grelha = {
  /** Deslocamentos das linhas e das colunas (0 = o caso base, no centro). */
  linhas: number[]
  colunas: number[]
  /** valores[linha][coluna] */
  valores: Array<Array<number | null>>
}

/** Passos simétricos em torno do base: n=2 → [−2p, −p, 0, +p, +2p]. */
export function passos(passo: number, n = 2): number[] {
  return Array.from({ length: 2 * n + 1 }, (_, i) => Math.round((i - n) * passo * 1e6) / 1e6)
}

/** WACC (linhas) × crescimento perpétuo (colunas). Os deslocamentos de g são relativos ao g do analista. */
export function grelhaWaccG(c: ContextoSensibilidade, passoWacc = 0.01, passoG = 0.005): Grelha {
  const linhas = passos(passoWacc)
  const colunas = passos(passoG)
  const g0 = c.pressupostos.avaliacao.g
  return {
    linhas, colunas,
    valores: linhas.map((dw) => colunas.map((dg) => valorComAjuste(c, { wacc: dw, g: g0 + dg }))),
  }
}

/**
 * WACC (linhas) × múltiplo EV/EBITDA de saída (colunas), deslocamentos em "x".
 * É a tabela certa quando o valor terminal usa o exit multiple: aí o g não entra
 * no valor e a WACC × g teria as colunas todas iguais.
 */
export function grelhaWaccMultiplo(c: ContextoSensibilidade, passoWacc = 0.01, passoMultiplo = 2): Grelha {
  const linhas = passos(passoWacc)
  const m0 = c.pressupostos.avaliacao.multiploSaida
  // Múltiplos ≤ 0 não têm significado: essas colunas ficam vazias.
  const colunas = passos(passoMultiplo)
  return {
    linhas, colunas,
    valores: linhas.map((dw) => colunas.map((dm) => (m0 + dm > 0 ? valorComAjuste(c, { wacc: dw, multiplo: dm }) : null))),
  }
}

/** Crescimento da receita (linhas) × margem EBIT (colunas), ambos em pontos percentuais por ano. */
export function grelhaCrescimentoMargem(c: ContextoSensibilidade, passoCrescimento = 0.02, passoMargem = 0.02): Grelha {
  const linhas = passos(passoCrescimento)
  const colunas = passos(passoMargem)
  return {
    linhas, colunas,
    valores: linhas.map((dc) => colunas.map((dm) => valorComAjuste(c, { crescimento: dc, margemEbit: dm }))),
  }
}

export type NomeCenario = "bear" | "base" | "bull"

export type BarraFootball = { chave: string; min: number; max: number; ponto: number | null }

/** Menor e maior valor válido de uma grelha. */
export function intervaloGrelha(g: Grelha): { min: number; max: number } | null {
  const vs = g.valores.flat().filter((v): v is number => v !== null && Number.isFinite(v))
  return vs.length ? { min: Math.min(...vs), max: Math.max(...vs) } : null
}
